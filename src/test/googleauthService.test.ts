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
    // Import mocked modules
    mockPassport = require('passport');
    GoogleStrategy = require('passport-google-oauth20').Strategy;
    
    // Import the service to trigger passport configuration
    require('../services/googleauthService');
    
    // Get the verify function from the mock calls
    const strategyCall = mockPassport.use.mock.calls[0];
    if (strategyCall && strategyCall[0]) {
      verifyFunction = strategyCall[0]._verify;
    }
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
    it('should authenticate existing user with valid email', async () => {
      const mockProfile = {
        id: 'google123',
        emails: [{ value: testEmail, verified: true }],
        displayName: 'Test User',
        name: { givenName: 'Test', familyName: 'User' }
      };

      const mockDone = jest.fn();

      await verifyFunction('accessToken', 'refreshToken', mockProfile, mockDone);

      expect(mockDone).toHaveBeenCalledWith(null, expect.objectContaining({
        Account_id: TEST_ACCOUNT_ID,
        Email: testEmail,
        FirstName: 'Test',
        LastName: 'User'
      }));
    });

    it('should redirect unregistered user to signup', async () => {
      const mockProfile = {
        id: 'google456',
        emails: [{ value: 'unregistered@gmail.com', verified: true }],
        displayName: 'New User',
        name: { givenName: 'New', familyName: 'User' }
      };

      const mockDone = jest.fn();

      await verifyFunction('accessToken', 'refreshToken', mockProfile, mockDone);

      expect(mockDone).toHaveBeenCalledWith(
        null, 
        false, 
        expect.objectContaining({
          message: 'not_registered',
          email: 'unregistered@gmail.com',
          firstName: 'New',
          lastName: 'User',
          redirectTo: 'signup'
        })
      );
    });

    it('should handle pending email verification', async () => {
      // Create a pending account that needs email verification
      await pool.execute(
        'INSERT INTO pending_accounts_tbl (Username, Password, FirstName, LastName, Email, Barangay_id, Roles, IsEmailVerified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['pending.user', 'hashedpass', 'Pending', 'User', 'pending@example.com', TEST_BARANGAY_ID, 2, 0]
      );

      const mockProfile = {
        id: 'google789',
        emails: [{ value: 'pending@example.com', verified: true }],
        displayName: 'Pending User',
        name: { givenName: 'Pending', familyName: 'User' }
      };

      const mockDone = jest.fn();

      await verifyFunction('accessToken', 'refreshToken', mockProfile, mockDone);

      expect(mockDone).toHaveBeenCalledWith(
        null, 
        false, 
        expect.objectContaining({
          message: 'email_pending',
          email: 'pending@example.com',
          redirectTo: 'verify-email'
        })
      );

      // Cleanup
      await pool.execute('DELETE FROM pending_accounts_tbl WHERE Email = ?', ['pending@example.com']);
    });

    it('should handle pending admin approval', async () => {
      // Create a pending account that needs admin approval
      await pool.execute(
        'INSERT INTO pending_accounts_tbl (Username, Password, FirstName, LastName, Email, Barangay_id, Roles, IsEmailVerified, IsAdminVerified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['adminpending.user', 'hashedpass', 'AdminPending', 'User', 'adminpending@example.com', TEST_BARANGAY_ID, 2, 1, 0]
      );

      const mockProfile = {
        id: 'google101112',
        emails: [{ value: 'adminpending@example.com', verified: true }],
        displayName: 'AdminPending User',
        name: { givenName: 'AdminPending', familyName: 'User' }
      };

      const mockDone = jest.fn();

      await verifyFunction('accessToken', 'refreshToken', mockProfile, mockDone);

      expect(mockDone).toHaveBeenCalledWith(
        null, 
        false, 
        expect.objectContaining({
          message: 'admin_pending',
          email: 'adminpending@example.com',
          redirectTo: 'pending-approval'
        })
      );

      // Cleanup
      await pool.execute('DELETE FROM pending_accounts_tbl WHERE Email = ?', ['adminpending@example.com']);
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