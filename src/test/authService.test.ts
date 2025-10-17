import db from '../config/db';
import { validateUser, registerUser } from '../services/authService';
import { createSqlLogger } from "./sqlLogger";

const LOG_SQL = process.env.MOCK_SQL_LOG === "true";
const authSqlCalls: Array<[string, any[] | undefined]> = [];
const _originalDbExecute = (db as any).execute;

const SQL_LOGGER = createSqlLogger("authService");

const TEST_FIRSTNAME = 'Test';
const TEST_LASTNAME = 'User' + Date.now();
const TEST_AREAID = 1;
const TEST_CONTACT = '09123456789';
const TEST_EMAIL = `testuser${Date.now()}@example.com`;
const TEST_ROLEID = 1;
const TEST_PASSWORD = 'SIBOL12345'; // Default password in registerUser
const TEST_USERNAME = `${TEST_FIRSTNAME}.${TEST_LASTNAME}`.toLowerCase();

beforeAll(async () => {
  // Register test user
  await registerUser(
    TEST_FIRSTNAME,
    TEST_LASTNAME,
    TEST_AREAID,
    TEST_CONTACT,
    TEST_EMAIL,
    TEST_ROLEID
  );
  // wrap execute to capture SQL calls when logging is enabled
  (db as any).execute = async (sql: any, params?: any[]) => {
    SQL_LOGGER.log(String(sql).replace(/\s+/g, " ").trim(), params);
    if (LOG_SQL) authSqlCalls.push([String(sql).replace(/\s+/g, " ").trim(), params]);
    return _originalDbExecute.call(db, sql, params);
  };
});

// cleanup wrapper and optionally log after each test
afterEach(() => {
  if (SQL_LOGGER.filePath) {
    for (const c of authSqlCalls) {
      SQL_LOGGER.log(String(c[0]).replace(/\s+/g, " ").trim(), c[1]);
    }
  }
  authSqlCalls.length = 0;
});

afterAll(async () => {
  // restore original execute and close pool
  (db as any).execute = _originalDbExecute;
  // Remove test user from accounts_tbl and profile_tbl
  await db.execute('DELETE FROM profile_tbl WHERE Email = ?', [TEST_EMAIL]);
  await db.execute('DELETE FROM accounts_tbl WHERE Username = ?', [TEST_USERNAME]);
  await db.end();

  if (SQL_LOGGER.filePath) {
    // nothing to print here; sqlLogger will print the unified directory once
  }
});

describe('User Registration and Login', () => {
  it('should return user for valid credentials after registration', async () => {
    const user = await validateUser(TEST_USERNAME, TEST_PASSWORD);
    expect(user).toBeDefined();
    expect(user.Username).toBe(TEST_USERNAME);
  });

  it('should return null for invalid credentials', async () => {
    const user = await validateUser(TEST_USERNAME, 'wrongpassword');
    expect(user).toBeNull();
  });
});


