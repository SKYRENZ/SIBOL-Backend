import { pool } from '../config/db';
import { createSqlLogger } from "./sqlLogger";

// Mock passport before importing the service
jest.mock('passport', () => ({
  use: jest.fn(),
  serializeUser: jest.fn(),
  deserializeUser: jest.fn()
}));

// Mock passport-google-oauth20 to capture the verify function
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

  // Create test account and profile (SSO account scenario)
  const timestamp = Date.now();
  testEmail = `sso_test_${timestamp}@example.com`;
  
  const [accountResult]: any = await pool.execute(
    'INSERT INTO accounts_tbl (Username, Password, Roles, IsActive) VALUES (?, ?, ?, ?)',
    [`sso_user_${timestamp}`, 'hashedpassword', 2, 1]
  );
  TEST_ACCOUNT_ID = accountResult.insertId;

  const [profileResult]: any = await pool.execute(
    'INSERT INTO profile_tbl (Account_id, FirstName, LastName, Barangay_id, Contact, Email) VALUES (?, ?, ?, ?, ?, ?)',
    [TEST_ACCOUNT_ID, 'SSO', 'User', TEST_BARANGAY_ID, 1234567890, testEmail]
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

  try {
    if (TEST_PROFILE_ID) {
      await pool.execute('DELETE FROM profile_tbl WHERE Profile_id = ?', [TEST_PROFILE_ID]);
    }
    if (TEST_ACCOUNT_ID) {
      await pool.execute('DELETE FROM accounts_tbl WHERE Account_id = ?', [TEST_ACCOUNT_ID]);
    }
    if (TEST_BARANGAY_ID) {
      await pool.execute('DELETE FROM barangay_tbl WHERE Barangay_id = ?', [TEST_BARANGAY_ID]);
    }
  } catch (err) {
    // ignore cleanup errors
  }

  await pool.end();
});

describe('Google Auth Service - SSO w/ account only', () => {
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

  it('SSO w/ account should return the existing account as user', async () => {
    expect(verifyFunction).toBeDefined();

    const profile = {
      emails: [{ value: testEmail }],
      name: { givenName: 'SSO', familyName: 'User' }
    };
    const done = jest.fn();

    await verifyFunction('accessToken', 'refreshToken', profile, done);

    expect(done).toHaveBeenCalled();
    const [err, user, info] = done.mock.calls[0];
    expect(err).toBeNull();
    expect(user).toBeTruthy();
    expect(user.Account_id || user.AccountId || user.id).toBeDefined();
    expect(user.Email || user.profileEmail).toBe(testEmail);
  });
});