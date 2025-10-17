import db from '../config/db';
import { validateUser, registerUser, verifyEmail, checkAccountStatus } from '../services/authService';
import { createSqlLogger } from "./sqlLogger";

const LOG_SQL = process.env.MOCK_SQL_LOG === "true";
const authSqlCalls: Array<[string, any[] | undefined]> = [];
const _originalDbExecute = (db as any).execute;

const SQL_LOGGER = createSqlLogger("authService");

const TEST_FIRSTNAME = 'Test';
const TEST_LASTNAME = 'User' + Date.now();
const TEST_AREAID = 1;
const TEST_EMAIL = `testuser${Date.now()}@example.com`;
const TEST_ROLEID = 2;
const TEST_PASSWORD = 'SIBOL12345';
const TEST_USERNAME = `${TEST_FIRSTNAME}.${TEST_LASTNAME}`.toLowerCase();

// SSO Test Data
const SSO_FIRSTNAME = 'SSO';
const SSO_LASTNAME = 'User' + Date.now();
const SSO_EMAIL = `ssouser${Date.now()}@gmail.com`;
const SSO_USERNAME = `${SSO_FIRSTNAME}.${SSO_LASTNAME}`.toLowerCase();

let TEST_PENDING_ID: number;
let SSO_PENDING_ID: number;
let TEST_VERIFICATION_TOKEN: string;
let TEST_ACCOUNT_ID: number;
let SSO_ACCOUNT_ID: number;

beforeAll(async () => {
  // wrap execute to capture SQL calls when logging is enabled
  (db as any).execute = async (sql: any, params?: any[]) => {
    SQL_LOGGER.log(String(sql).replace(/\s+/g, " ").trim(), params);
    if (LOG_SQL) authSqlCalls.push([String(sql).replace(/\s+/g, " ").trim(), params]);
    return _originalDbExecute.call(db, sql, params);
  };

  // ✅ Clean up any existing test data before starting
  await cleanupTestData();
});

// ✅ Add cleanup function
async function cleanupTestData() {
  try {
    await db.execute('DELETE FROM profile_tbl WHERE Email LIKE ?', [`%${Date.now().toString().slice(0, 8)}%`]);
    await db.execute('DELETE FROM accounts_tbl WHERE Username LIKE ?', [`test.user%`]);
    await db.execute('DELETE FROM accounts_tbl WHERE Username LIKE ?', [`sso.user%`]);
    await db.execute('DELETE FROM pending_accounts_tbl WHERE Email LIKE ?', [`testuser%`]);
    await db.execute('DELETE FROM pending_accounts_tbl WHERE Email LIKE ?', [`ssouser%`]);
    
    // Clean up specific test data
    await db.execute('DELETE FROM profile_tbl WHERE Email = ?', [TEST_EMAIL]);
    await db.execute('DELETE FROM profile_tbl WHERE Email = ?', [SSO_EMAIL]);
    await db.execute('DELETE FROM accounts_tbl WHERE Username = ?', [TEST_USERNAME]);
    await db.execute('DELETE FROM accounts_tbl WHERE Username = ?', [SSO_USERNAME]);
    await db.execute('DELETE FROM pending_accounts_tbl WHERE Email = ?', [TEST_EMAIL]);
    await db.execute('DELETE FROM pending_accounts_tbl WHERE Email = ?', [SSO_EMAIL]);
  } catch (error) {
    console.log('Cleanup info:', error);
  }
}

afterEach(() => {
  if (SQL_LOGGER.filePath) {
    for (const c of authSqlCalls) {
      SQL_LOGGER.log(String(c[0]).replace(/\s+/g, " ").trim(), c[1]);
    }
  }
  authSqlCalls.length = 0;
});

afterAll(async () => {
  (db as any).execute = _originalDbExecute;
  
  // ✅ Final cleanup
  await cleanupTestData();
  await db.end();
});

describe('AuthService - Regular Registration Flow', () => {
  it('should register regular user successfully (requires email verification)', async () => {
    const result = await registerUser(
      TEST_FIRSTNAME,
      TEST_LASTNAME,
      TEST_AREAID,
      TEST_EMAIL,
      TEST_ROLEID,
      false // isSSO = false
    );

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.username).toBe(TEST_USERNAME);
    expect(result.email).toBe(TEST_EMAIL);
    expect(result.isSSO).toBe(false);
    expect(result.emailVerified).toBe(false);
    expect(result.message).toContain('Please check your email to verify your account');
    expect(result.note).toContain('Verification email sent');
    
    TEST_PENDING_ID = result.pendingId;
  });

  it('should show email_pending status for regular unverified user', async () => {
    const status = await checkAccountStatus(TEST_USERNAME);
    expect(status.status).toBe('email_pending');
    expect(status.message).toBe('Please verify your email first');
  });
});

describe('AuthService - SSO Registration Flow', () => {
  it('should register SSO user successfully (skip email verification)', async () => {
    const result = await registerUser(
      SSO_FIRSTNAME,
      SSO_LASTNAME,
      TEST_AREAID,
      SSO_EMAIL,
      TEST_ROLEID,
      true // isSSO = true
    );

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.username).toBe(SSO_USERNAME);
    expect(result.email).toBe(SSO_EMAIL);
    expect(result.isSSO).toBe(true);
    expect(result.emailVerified).toBe(true);
    expect(result.message).toContain('Your account is pending admin approval');
    expect(result.note).toContain('Email already verified via Google');
    
    SSO_PENDING_ID = result.pendingId;
  });

  it('should show admin_pending status for SSO user (skip email verification)', async () => {
    const status = await checkAccountStatus(SSO_USERNAME);
    expect(status.status).toBe('admin_pending');
    expect(status.message).toBe('Account is pending admin approval');
  });

  it('should verify SSO user has IsEmailVerified = 1 in database', async () => {
    const [rows]: any = await db.execute(
      'SELECT IsEmailVerified, Verification_token FROM pending_accounts_tbl WHERE Pending_id = ?',
      [SSO_PENDING_ID]
    );
    
    expect(rows.length).toBe(1);
    expect(rows[0].IsEmailVerified).toBe(1);
    expect(rows[0].Verification_token).toBeNull();
  });
});

describe('AuthService - Email Verification (Regular Users Only)', () => {
  it('should get verification token from database for regular user', async () => {
    const [rows]: any = await db.execute(
      'SELECT Verification_token FROM pending_accounts_tbl WHERE Pending_id = ?',
      [TEST_PENDING_ID]
    );
    
    expect(rows.length).toBe(1);
    TEST_VERIFICATION_TOKEN = rows[0].Verification_token;
    expect(TEST_VERIFICATION_TOKEN).toBeDefined();
    expect(TEST_VERIFICATION_TOKEN).not.toBeNull();
  });

  it('should verify email successfully for regular user', async () => {
    const result = await verifyEmail(TEST_VERIFICATION_TOKEN);
    
    expect(result.success).toBe(true);
    expect(result.message).toContain('Email verified successfully');
    expect(result.email).toBe(TEST_EMAIL);
  });

  it('should show admin_pending status after email verification', async () => {
    const status = await checkAccountStatus(TEST_USERNAME);
    expect(status.status).toBe('admin_pending');
    expect(status.message).toBe('Account is pending admin approval');
  });
});

describe('AuthService - Admin Approval Simulation', () => {
  it('should simulate admin approval for regular user', async () => {
    const [pendingRows]: any = await db.execute(
      'SELECT * FROM pending_accounts_tbl WHERE Pending_id = ?',
      [TEST_PENDING_ID]
    );
    
    const pendingAccount = pendingRows[0];

    const [accountResult]: any = await db.execute(
      'INSERT INTO accounts_tbl (Username, Password, Roles, IsActive) VALUES (?, ?, ?, 1)',
      [pendingAccount.Username, pendingAccount.Password, pendingAccount.Roles]
    );

    TEST_ACCOUNT_ID = accountResult.insertId;

    await db.execute(
      'INSERT INTO profile_tbl (Account_id, FirstName, LastName, Area_id, Email) VALUES (?, ?, ?, ?, ?)',
      [TEST_ACCOUNT_ID, pendingAccount.FirstName, pendingAccount.LastName, pendingAccount.Area_id, pendingAccount.Email]
    );

    await db.execute('DELETE FROM pending_accounts_tbl WHERE Pending_id = ?', [TEST_PENDING_ID]);
  });

  it('should simulate admin approval for SSO user', async () => {
    const [pendingRows]: any = await db.execute(
      'SELECT * FROM pending_accounts_tbl WHERE Pending_id = ?',
      [SSO_PENDING_ID]
    );
    
    const pendingAccount = pendingRows[0];

    const [accountResult]: any = await db.execute(
      'INSERT INTO accounts_tbl (Username, Password, Roles, IsActive) VALUES (?, ?, ?, 1)',
      [pendingAccount.Username, pendingAccount.Password, pendingAccount.Roles]
    );

    SSO_ACCOUNT_ID = accountResult.insertId;

    await db.execute(
      'INSERT INTO profile_tbl (Account_id, FirstName, LastName, Area_id, Email) VALUES (?, ?, ?, ?, ?)',
      [SSO_ACCOUNT_ID, pendingAccount.FirstName, pendingAccount.LastName, pendingAccount.Area_id, pendingAccount.Email]
    );

    await db.execute('DELETE FROM pending_accounts_tbl WHERE Pending_id = ?', [SSO_PENDING_ID]);
  });
});

describe('AuthService - Login After Approval', () => {
  it('should login successfully for regular user', async () => {
    const user = await validateUser(TEST_USERNAME, TEST_PASSWORD);
    expect(user).toBeDefined();
    expect(user.Username).toBe(TEST_USERNAME);
    expect(user.Account_id).toBe(TEST_ACCOUNT_ID);
    expect(user.Password).toBeUndefined();
  });

  it('should login successfully for SSO user', async () => {
    const user = await validateUser(SSO_USERNAME, TEST_PASSWORD);
    expect(user).toBeDefined();
    expect(user.Username).toBe(SSO_USERNAME);
    expect(user.Account_id).toBe(SSO_ACCOUNT_ID);
    expect(user.Password).toBeUndefined();
  });
});

describe('AuthService - Edge Cases', () => {
  it('should throw error for missing required fields', async () => {
    await expect(
      registerUser('', '', 0, '', 0)
    ).rejects.toThrow('Missing required fields');
  });

  it('should prevent duplicate SSO registration', async () => {
    await expect(
      registerUser(
        SSO_FIRSTNAME,
        SSO_LASTNAME,
        TEST_AREAID,
        SSO_EMAIL,
        TEST_ROLEID,
        true
      )
    ).rejects.toThrow('Username or email already exists');
  });
});


