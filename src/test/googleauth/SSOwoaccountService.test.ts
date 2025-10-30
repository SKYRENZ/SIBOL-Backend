import { pool } from '../../config/db';
import { createSqlLogger } from "../sqlLogger";

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
const SQL_LOGGER = createSqlLogger("googleauthService");

beforeAll(async () => {
  // wrap pool.execute to capture SQL calls when logging is enabled
  (pool as any).execute = async (sql: any, params?: any[]) => {
    SQL_LOGGER.log(String(sql).replace(/\s+/g, " ").trim(), params);
    if (LOG_SQL) googleauthSqlCalls.push([String(sql).replace(/\s+/g, " ").trim(), params]);
    return _originalPoolExecute.call(pool, sql, params);
  };
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
  // restore original execute
  (pool as any).execute = _originalPoolExecute;
  // close the pool so Jest can exit
  await pool.end();
});

describe('Google Auth Service - SSO w/o account', () => {
  let GoogleStrategy: any;
  let verifyFunction: any;

  beforeAll(() => {
    GoogleStrategy = require('passport-google-oauth20').Strategy as jest.Mock;
    // require the service after mocks are in place to create the strategy instance
    require('../../services/googleauthService');
    const instance = GoogleStrategy.mock.results[0]?.value;
    verifyFunction = instance?._verify;
  });

  it('SSO w/o account should return not_registered info', async () => {
    expect(verifyFunction).toBeDefined();

    const uniqueEmail = `sso_noacct_${Date.now()}@example.com`;

    // ensure no leftover rows for that email
    await pool.execute('DELETE FROM pending_accounts_tbl WHERE Email = ?', [uniqueEmail]).catch(() => {});
    await pool.execute('DELETE FROM profile_tbl WHERE Email = ?', [uniqueEmail]).catch(() => {});
    await pool.execute('DELETE FROM accounts_tbl WHERE Username = ?', [uniqueEmail.split('@')[0]]).catch(() => {});

    const profile = {
      emails: [{ value: uniqueEmail }],
      name: { givenName: 'NoAcct', familyName: 'User' }
    };
    const done = jest.fn();

    await verifyFunction('accessToken', 'refreshToken', profile, done);

    expect(done).toHaveBeenCalled();
    const [err, user, info] = done.mock.calls[0];
    expect(err).toBeNull();
    expect(user).toBeFalsy();
    expect(info).toMatchObject({
      message: 'not_registered',
      redirectTo: 'signup',
      email: uniqueEmail,
      firstName: 'NoAcct',
      lastName: 'User'
    });
  });

  it('SSO with pending-account (email verified but admin approval pending) should return admin_pending info', async () => {
    expect(verifyFunction).toBeDefined();

    const pendingEmail = `sso_pending_${Date.now()}@example.com`;

    // clean any previous data just in case
    await pool.execute('DELETE FROM pending_accounts_tbl WHERE Email = ?', [pendingEmail]).catch(() => {});

    // insert a pending account row: email verified but not admin-approved
    await pool.execute(
      `INSERT INTO pending_accounts_tbl
        (Username, Password, FirstName, LastName, Email, Barangay_id, Roles, IsEmailVerified, IsAdminVerified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [pendingEmail.split('@')[0], 'pwd', 'Pending', 'User', pendingEmail, null, 2, 1, 0]
    );

    const profile = {
      emails: [{ value: pendingEmail }],
      name: { givenName: 'Pending', familyName: 'User' }
    };
    const done = jest.fn();

    await verifyFunction('accessToken', 'refreshToken', profile, done);

    expect(done).toHaveBeenCalled();
    const [err, user, info] = done.mock.calls[0];
    expect(err).toBeNull();
    expect(user).toBeFalsy();
    expect(info).toMatchObject({
      message: 'admin_pending',
      redirectTo: 'pending-approval',
      email: pendingEmail
    });

    // cleanup
    await pool.execute('DELETE FROM pending_accounts_tbl WHERE Email = ?', [pendingEmail]).catch(() => {});
  });
});