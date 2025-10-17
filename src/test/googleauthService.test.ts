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
let TEST_AREA_ID: number;
let testEmail: string;

const SQL_LOGGER = createSqlLogger("googleauthService");

beforeAll(async () => {
  // wrap pool.execute to capture SQL calls when logging is enabled
  (pool as any).execute = async (sql: any, params?: any[]) => {
    SQL_LOGGER.log(String(sql).replace(/\s+/g, " ").trim(), params);
    if (LOG_SQL) googleauthSqlCalls.push([String(sql).replace(/\s+/g, " ").trim(), params]);
    return _originalPoolExecute.call(pool, sql, params);
  };

  // Create test area
  const [areaResult]: any = await pool.execute(
    'INSERT INTO area_tbl (Area_Name) VALUES (?)',
    [`Test Area ${Date.now()}`]
  );
  TEST_AREA_ID = areaResult.insertId;

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
    'INSERT INTO profile_tbl (Account_id, FirstName, LastName, Area_id, Contact, Email) VALUES (?, ?, ?, ?, ?, ?)',
    [TEST_ACCOUNT_ID, 'Test', 'User', TEST_AREA_ID, 1234567890, testEmail]
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
  if (TEST_AREA_ID) {
    await pool.execute('DELETE FROM area_tbl WHERE Area_id = ?', [TEST_AREA_ID]);
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
      expect(strategyConfig.callbackURL).toBe("/api/auth/google/callback");
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

    it('should reject user with non-existent email', async () => {
      const mockProfile = {
        id: 'google456',
        emails: [{ value: 'nonexistent@example.com', verified: true }],
        displayName: 'Non User',
        name: { givenName: 'Non', familyName: 'User' }
      };

      const mockDone = jest.fn();

      await verifyFunction('accessToken', 'refreshToken', mockProfile, mockDone);

      expect(mockDone).toHaveBeenCalledWith(
        null, 
        false, 
        { message: 'Email not registered or not yet approved in system' }
      );
    });

    it('should handle database errors gracefully', async () => {
      // Temporarily break the database connection
      const originalExecute = pool.execute;
      (pool as any).execute = jest.fn().mockRejectedValue(new Error('Database error'));

      const mockProfile = {
        id: 'google789',
        emails: [{ value: 'test@example.com', verified: true }],
        displayName: 'Test User',
        name: { givenName: 'Test', familyName: 'User' }
      };

      const mockDone = jest.fn();

      await verifyFunction('accessToken', 'refreshToken', mockProfile, mockDone);

      expect(mockDone).toHaveBeenCalledWith(
        expect.any(Error),
        null
      );

      // Restore original execute
      (pool as any).execute = originalExecute;
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
        Roles: 2 // Should match the role ID we used
      }));
    });

    it('should handle non-existent user in deserialization', async () => {
      const deserializeCall = mockPassport.deserializeUser.mock.calls[0];
      const deserializeFunction = deserializeCall[0];

      const mockDone = jest.fn();

      await deserializeFunction(99999, mockDone);

      expect(mockDone).toHaveBeenCalledWith(null, null);
    });

    it('should handle database errors in deserialization', async () => {
      // Temporarily break the database connection
      const originalExecute = pool.execute;
      (pool as any).execute = jest.fn().mockRejectedValue(new Error('Database error'));

      const deserializeCall = mockPassport.deserializeUser.mock.calls[0];
      const deserializeFunction = deserializeCall[0];

      const mockDone = jest.fn();

      await deserializeFunction(TEST_ACCOUNT_ID, mockDone);

      expect(mockDone).toHaveBeenCalledWith(
        expect.any(Error),
        null
      );

      // Restore original execute
      (pool as any).execute = originalExecute;
    });
  });
});