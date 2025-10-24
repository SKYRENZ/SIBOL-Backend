import { pool } from '../config/db';
import { createSqlLogger } from "./sqlLogger";

// Mock passport before importing the service
jest.mock('passport', () => ({
  use: jest.fn(),
  serializeUser: jest.fn(),
  deserializeUser: jest.fn()
}));

// Mock passport-google-oauth20
jest.mock('passport-google-oauth20', () => ({
  Strategy: jest.fn().mockImplementation((config, verify) => {
    return {
      name: 'google',
      _verify: verify,
      _config: config
    };
  })
}));

const LOG_SQL = process.env.MOCK_SQL_LOG === "true";
const googleauthSqlCalls: Array<[string, any[] | undefined]> = [];
const _originalPoolExecute = (pool as any).execute;

let TEST_ACCOUNT_ID: number;
let TEST_PROFILE_ID: number;
let TEST_BARANGAY_ID: number;
let testEmail: string;

const SQL_LOGGER = createSqlLogger("googleauthService");

beforeAll(async () => {
  // wrap pool.execute to capture SQL calls when logging is enabled
  (pool as any).execute = async (sql: any, params?: any[]) => {
    SQL_LOGGER.log(String(sql).replace(/\s+/g, " ").trim(), params);
    if (LOG_SQL) googleauthSqlCalls.push([String(sql).replace(/\s+/g, " ").trim(), params]);
    return _originalPoolExecute.call(pool, sql, params);
  };

  // Create test barangay
  const [barangayResult]: any = await pool.execute(
    'INSERT INTO barangay_tbl (Barangay_Name) VALUES (?)',
    [`Test Barangay ${Date.now()}`]
  );
  TEST_BARANGAY_ID = barangayResult.insertId;

  // Create test account (using role ID 2 for 'User' which should exist from the workflow)
  const timestamp = Date.now();
  testEmail = `test${timestamp}@example.com`;
  
  const [accountResult]: any = await pool.execute(
    'INSERT INTO accounts_tbl (Username, Password, Roles, IsActive) VALUES (?, ?, ?, ?)',
    [`testuser_${timestamp}`, 'hashedpassword', 2, 1] // Using role ID 2 for 'User'
  );
  TEST_ACCOUNT_ID = accountResult.insertId;

  // Create test profile
  const [profileResult]: any = await pool.execute(
    'INSERT INTO profile_tbl (Account_id, FirstName, LastName, Barangay_id, Contact, Email) VALUES (?, ?, ?, ?, ?, ?)',
    [TEST_ACCOUNT_ID, 'Test', 'User', TEST_BARANGAY_ID, 1234567890, testEmail]
  );
  TEST_PROFILE_ID = profileResult.insertId;
});

afterEach(() => {
  if (SQL_LOGGER.filePath) {
    for (const c of googleauthSqlCalls) {
      SQL_LOGGER.log(String(c[0]).replace(/\s+/g, " ").trim(), c[1]);
    }
  }
  googleauthSqlCalls.length = 0;
});

afterAll(async () => {
  // restore original execute and perform cleanup
  (pool as any).execute = _originalPoolExecute;

  // Clean up test data (only if IDs were set)
  if (TEST_PROFILE_ID) {
    await pool.execute('DELETE FROM profile_tbl WHERE Profile_id = ?', [TEST_PROFILE_ID]);
  }
  if (TEST_ACCOUNT_ID) {
    await pool.execute('DELETE FROM accounts_tbl WHERE Account_id = ?', [TEST_ACCOUNT_ID]);
  }
  if (TEST_BARANGAY_ID) {
    await pool.execute('DELETE FROM barangay_tbl WHERE Barangay_id = ?', [TEST_BARANGAY_ID]);
  }
  await pool.end();

  if (SQL_LOGGER.filePath) {
    // unified directory print handled by sqlLogger
  }
});

describe('Google Auth Service', () => {
  let mockPassport: any;
  let GoogleStrategy: any;
  let verifyFunction: any;

  beforeAll(() => {
    // obtain the mocked passport and strategy references so tests can inspect calls
    mockPassport = require('passport');
    GoogleStrategy = require('passport-google-oauth20').Strategy as jest.Mock;
    // require the service after mocks are in place to create the strategy instance
    require('../services/googleauthService');
    // grab the created strategy instance and its verify function
    const instance = GoogleStrategy.mock.results[0]?.value;
    verifyFunction = instance?._verify;
  });

  beforeEach(() => {
    // Don't clear all mocks as we need the setup from beforeAll
  });

  describe('Google Strategy Configuration', () => {
    it('should configure Google strategy with correct settings', () => {
      expect(mockPassport.use).toHaveBeenCalled();
      expect(GoogleStrategy).toHaveBeenCalled();
      
      const strategyConfig = GoogleStrategy.mock.calls[0][0];
      // Accept full callback URL (BACKEND_URL + path) or just the path
      expect(String(strategyConfig.callbackURL)).toContain('/api/auth/google/callback');
    });

    it('should set up serialization and deserialization', () => {
      expect(mockPassport.serializeUser).toHaveBeenCalled();
      expect(mockPassport.deserializeUser).toHaveBeenCalled();
    });
  });

  describe('Google Strategy Verify Function', () => {
    it('SSO w/o account should return not_registered info', async () => {
      expect(verifyFunction).toBeDefined();
      const uniqueEmail = `noacct_${Date.now()}@example.com`;
      const profile = {
        emails: [{ value: uniqueEmail }],
        name: { givenName: 'No', familyName: 'Account' }
      };
      const done = jest.fn();

      // call the verify function (accessToken, refreshToken, profile, done)
      await verifyFunction('at', 'rt', profile, done);

      expect(done).toHaveBeenCalled();
      const [err, user, info] = done.mock.calls[0];
      expect(err).toBeNull();
      expect(user).toBeFalsy();
      expect(info).toMatchObject({
        message: 'not_registered',
        redirectTo: 'signup',
        email: uniqueEmail
      });
    });

    it('SSO w/ account should return the existing account as user', async () => {
      expect(verifyFunction).toBeDefined();
      // testEmail is created in the top-level beforeAll DB setup of this file
      const profile = {
        emails: [{ value: testEmail }],
        name: { givenName: 'Test', familyName: 'User' }
      };
      const done = jest.fn();

      await verifyFunction('at', 'rt', profile, done);

      expect(done).toHaveBeenCalled();
      const [err, user, info] = done.mock.calls[0];
      expect(err).toBeNull();
      expect(user).toBeTruthy();
      // account created in DB should have Account_id set
      expect(user.Account_id || user.AccountId || user.id).toBeDefined();
      // email from profile should match profile table value returned with the account
      expect(user.Email || user.profileEmail).toBe(testEmail);
    });
  });

  describe('Passport Serialization', () => {
    it('should serialize user correctly', () => {
      const serializeCall = mockPassport.serializeUser.mock.calls[0];
      const serializeFunction = serializeCall[0];

      const mockUser = { Account_id: 123, Username: 'testuser' };
      const mockDone = jest.fn();

      serializeFunction(mockUser, mockDone);

      expect(mockDone).toHaveBeenCalledWith(null, 123);
    });

    it('should deserialize user correctly', async () => {
      const deserializeCall = mockPassport.deserializeUser.mock.calls[0];
      const deserializeFunction = deserializeCall[0];

      const mockDone = jest.fn();

      await deserializeFunction(TEST_ACCOUNT_ID, mockDone);

      expect(mockDone).toHaveBeenCalledWith(null, expect.objectContaining({
        Account_id: TEST_ACCOUNT_ID,
        Username: expect.any(String),
        Roles: 2
      }));
    });
  });
});