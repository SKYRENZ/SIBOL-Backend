import db from '../../config/db';
import { registerUser, checkAccountStatus } from '../../services/authService';
import { createSqlLogger } from '../sqlLogger';

// Mock the email service to prevent actual email sending during tests
jest.mock('../utils/emailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'mock-message-id'
  })
}));

const LOG_SQL = process.env.MOCK_SQL_LOG === 'true';
const authSqlCalls: Array<[string, any[] | undefined]> = [];
const _originalDbExecute = (db as any).execute;
const SQL_LOGGER = createSqlLogger('authService');

const TEST_FIRSTNAME = 'Test';
const TEST_LASTNAME = 'User' + Date.now();
const TEST_BARANGAY_ID = 1;
const TEST_EMAIL = `testuser${Date.now()}@example.com`;
const TEST_ROLEID = 2;
const TEST_USERNAME = `${TEST_FIRSTNAME}.${TEST_LASTNAME}`.toLowerCase();

async function cleanupTestData() {
  try {
    await db.execute('DELETE FROM pending_accounts_tbl WHERE Email = ?', [TEST_EMAIL]);
    await db.execute('DELETE FROM profile_tbl WHERE Email = ?', [TEST_EMAIL]);
    await db.execute('DELETE FROM accounts_tbl WHERE Username = ?', [TEST_USERNAME]);
    await db.execute('DELETE FROM password_reset_tbl WHERE Email = ?', [TEST_EMAIL]);
  } catch (err) {
    // ignore cleanup errors in tests
  }
}

beforeAll(async () => {
  // wrap execute to capture SQL calls when logging is enabled
  (db as any).execute = async (sql: any, params?: any[]) => {
    SQL_LOGGER.log(String(sql).replace(/\s+/g, ' ').trim(), params);
    if (LOG_SQL) authSqlCalls.push([String(sql).replace(/\s+/g, ' ').trim(), params]);
    return _originalDbExecute.call(db, sql, params);
  };

  // ensure clean slate
  await cleanupTestData();
});

afterEach(() => {
  if (SQL_LOGGER.filePath) {
    for (const c of authSqlCalls) {
      SQL_LOGGER.log(String(c[0]).replace(/\s+/g, ' ').trim(), c[1]);
    }
  }
  authSqlCalls.length = 0;
});

afterAll(async () => {
  (db as any).execute = _originalDbExecute;
  await cleanupTestData();
  await db.end();
});

describe('AuthService - Traditional Registration only', () => {
  let pendingId: number;

  it('registers a traditional (non-SSO) user and inserts pending account', async () => {
    const result = await registerUser(
      TEST_FIRSTNAME,
      TEST_LASTNAME,
      TEST_BARANGAY_ID,
      TEST_EMAIL,
      TEST_ROLEID,
      undefined, // let service use default password
      false // non-SSO
    );

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.isSSO).toBe(false);
    expect(result.email).toBe(TEST_EMAIL);
    expect(result.username).toBe(TEST_USERNAME);
    expect(result.emailVerified).toBe(false);
    expect(result.pendingId).toBeDefined();

    pendingId = result.pendingId;
  });

  it('shows email_pending status for newly registered traditional user', async () => {
    const status = await checkAccountStatus(TEST_USERNAME);
    expect(status).toBeDefined();
    expect(status.status).toBe('email_pending');
    expect(status.message).toBe('Please verify your email first');
  });
});


