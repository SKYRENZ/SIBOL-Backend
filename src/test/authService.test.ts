import db from '../config/db';
import bcrypt from 'bcrypt';
import { validateUser, registerUser, verifyEmail, checkAccountStatus, resendVerificationEmail,
         createPasswordReset, verifyResetCode, resetPassword } from '../services/authService';
import { createSqlLogger } from "./sqlLogger";

// Mock the email service to prevent actual email sending during tests
jest.mock('../utils/emailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({
    success: true,
    messageId: 'mock-message-id'
  })
}));

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
    // Clean up any existing test data
    await db.execute('DELETE FROM profile_tbl WHERE Email LIKE ?', [`%${TEST_EMAIL.split('@')[0]}%`]);
    await db.execute('DELETE FROM profile_tbl WHERE Email LIKE ?', [`%${SSO_EMAIL.split('@')[0]}%`]);
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

    // Clean up password reset entries for test emails
    await db.execute('DELETE FROM password_reset_tbl WHERE Email = ?', [TEST_EMAIL]);
    await db.execute('DELETE FROM password_reset_tbl WHERE Email = ?', [SSO_EMAIL]);
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
    const result = await registerUser(TEST_FIRSTNAME, TEST_LASTNAME, TEST_AREAID, TEST_EMAIL, TEST_ROLEID, undefined, false);  // Added undefined for password, changed "false" to false

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
    const result = await registerUser(SSO_FIRSTNAME, SSO_LASTNAME, TEST_AREAID, SSO_EMAIL, TEST_ROLEID, undefined, true);  // Added undefined, changed "true" to true

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

describe('AuthService - Verification Token Comparison', () => {
  it('should verify regular user has verification token but SSO user does not', async () => {
    // Check regular user has verification token
    const [regularRows]: any = await db.execute(
      'SELECT Verification_token, IsEmailVerified FROM pending_accounts_tbl WHERE Pending_id = ?',
      [TEST_PENDING_ID]
    );
    
    expect(regularRows.length).toBe(1);
    expect(regularRows[0].Verification_token).not.toBeNull();
    expect(regularRows[0].IsEmailVerified).toBe(0);

    // Check SSO user has no verification token
    const [ssoRows]: any = await db.execute(
      'SELECT Verification_token, IsEmailVerified FROM pending_accounts_tbl WHERE Pending_id = ?',
      [SSO_PENDING_ID]
    );
    
    expect(ssoRows.length).toBe(1);
    expect(ssoRows[0].Verification_token).toBeNull();
    expect(ssoRows[0].IsEmailVerified).toBe(1);
  });
});

describe('AuthService - Email Verification (Regular Users Only)', () => {
  it('should get verification token from database for regular user', async () => {
    // Ensure TEST_PENDING_ID exists before trying to query
    expect(TEST_PENDING_ID).toBeDefined();
    
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
    // Ensure TEST_VERIFICATION_TOKEN exists
    expect(TEST_VERIFICATION_TOKEN).toBeDefined();
    
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

  it('should handle already verified email gracefully', async () => {
    // Try to verify the same token again
    const result = await verifyEmail(TEST_VERIFICATION_TOKEN);
    
    expect(result.success).toBe(true);
    expect(result.message).toContain('Email already verified');
    expect(result.alreadyVerified).toBe(true);
  });
});

describe('AuthService - Resend Verification Email', () => {
  it('should resend verification email for unverified regular user', async () => {
    // First, let's create a new unverified user for this test
    const newUser = await registerUser(
      'Resend',
      'Test' + Date.now(),
      TEST_AREAID,
      `resendtest${Date.now()}@example.com`,
      TEST_ROLEID,
      undefined,
      false  // Changed "false" to false
    );

    // Now test resending verification
    const result = await resendVerificationEmail(newUser.email);
    
    expect(result.success).toBe(true);
    expect(result.message).toContain('Verification email resent successfully');
    expect(result.email).toBe(newUser.email);
    expect(result.verificationToken).toBeDefined();

    // Clean up
    await db.execute('DELETE FROM pending_accounts_tbl WHERE Email = ?', [newUser.email]);
  });

  it('should fail to resend email for already verified user', async () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    try {
      await expect(
        resendVerificationEmail(TEST_EMAIL)
      ).rejects.toThrow('No pending account found for this email or email already verified');
    } finally {
      consoleSpy.mockRestore(); // Restore console.error
    }
  });

  it('should fail to resend email for non-existent user', async () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    try {
      await expect(
        resendVerificationEmail('nonexistent@example.com')
      ).rejects.toThrow('No pending account found for this email or email already verified');
    } finally {
      consoleSpy.mockRestore(); // Restore console.error
    }
  });
});

describe('AuthService - Admin Approval Simulation', () => {
  it('should simulate admin approval for regular user', async () => {
    // Ensure TEST_PENDING_ID exists
    expect(TEST_PENDING_ID).toBeDefined();
    
    const [pendingRows]: any = await db.execute(
      'SELECT * FROM pending_accounts_tbl WHERE Pending_id = ?',
      [TEST_PENDING_ID]
    );
    
    expect(pendingRows.length).toBe(1);
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
    // Ensure SSO_PENDING_ID exists
    expect(SSO_PENDING_ID).toBeDefined();
    
    const [pendingRows]: any = await db.execute(
      'SELECT * FROM pending_accounts_tbl WHERE Pending_id = ?',
      [SSO_PENDING_ID]
    );
    
    expect(pendingRows.length).toBe(1);
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
    // Ensure TEST_ACCOUNT_ID exists
    expect(TEST_ACCOUNT_ID).toBeDefined();
    
    const user = await validateUser(TEST_USERNAME, TEST_PASSWORD);
    expect(user).toBeDefined();
    expect(user.Username).toBe(TEST_USERNAME);
    expect(user.Account_id).toBe(TEST_ACCOUNT_ID);
    expect(user.Password).toBeUndefined();
  });

  it('should login successfully for SSO user', async () => {
    // Ensure SSO_ACCOUNT_ID exists
    expect(SSO_ACCOUNT_ID).toBeDefined();
    
    const user = await validateUser(SSO_USERNAME, TEST_PASSWORD);
    expect(user).toBeDefined();
    expect(user.Username).toBe(SSO_USERNAME);
    expect(user.Account_id).toBe(SSO_ACCOUNT_ID);
    expect(user.Password).toBeUndefined();
  });

  it('should throw error for user still pending email verification', async () => {
    // Create a user that hasn't verified email yet
    const pendingUser = await registerUser(
      'Pending',
      'User' + Date.now(),
      TEST_AREAID,
      `pending${Date.now()}@example.com`,
      TEST_ROLEID,
      undefined,
      false  // Changed "false" to false
    );

    await expect(
      validateUser(pendingUser.username, TEST_PASSWORD)
    ).rejects.toThrow('Please verify your email first');

    // Clean up
    await db.execute('DELETE FROM pending_accounts_tbl WHERE Email = ?', [pendingUser.email]);
  });

  it('should throw error for user pending admin approval', async () => {
    // Create an SSO user (email verified but pending admin approval)
    const adminPendingUser = await registerUser(
      'AdminPending',
      'User' + Date.now(),
      TEST_AREAID,
      `adminpending${Date.now()}@gmail.com`,
      TEST_ROLEID,
      undefined,
      true  // Changed "true" to true
    );

    await expect(
      validateUser(adminPendingUser.username, TEST_PASSWORD)
    ).rejects.toThrow('Account is pending admin approval');

    // Clean up
    await db.execute('DELETE FROM pending_accounts_tbl WHERE Email = ?', [adminPendingUser.email]);
  });
});

describe('AuthService - Edge Cases', () => {
  it('should throw error for missing required fields', async () => {
    await expect(
      registerUser('', '', 0, '', 0, undefined, false)  // Added undefined for password, false for isSSO
    ).rejects.toThrow('Missing required fields');
  });

  it('should prevent duplicate regular registration', async () => {
    await expect(
      registerUser(
        TEST_FIRSTNAME,
        TEST_LASTNAME,
        TEST_AREAID,
        TEST_EMAIL,
        TEST_ROLEID,
        undefined,
        false  // Changed "false" to false
      )
    ).rejects.toThrow('Username or email already exists');
  });

  it('should prevent duplicate SSO registration', async () => {
    await expect(
      registerUser(
        SSO_FIRSTNAME,
        SSO_LASTNAME,
        TEST_AREAID,
        SSO_EMAIL,
        TEST_ROLEID,
        undefined,
        true  // Changed "true" to true
      )
    ).rejects.toThrow('Username or email already exists');
  });

  it('should handle invalid verification token', async () => {
    await expect(
      verifyEmail('invalid-token-12345')
    ).rejects.toThrow('Invalid verification token');
  });

  it('should handle email sending properly in test environment', () => {
    // In test environment, email service should be mocked
    expect(process.env.NODE_ENV).toBe('test');
    
    // Verify that the mock exists
    const emailService = require('../utils/emailService');
    expect(emailService.sendVerificationEmail).toBeDefined();
    expect(jest.isMockFunction(emailService.sendVerificationEmail)).toBe(true);
  });
});

// ------------------------- NEW: Password reset tests -------------------------
describe('AuthService - Password Reset Flow', () => {
  let generatedCode: string;
  const NEW_PASSWORD = 'NewPassw0rd!';

  it('should create a password reset code (store hashed) for existing account', async () => {
    // Ensure account/profile exists from previous admin approval step
    expect(TEST_ACCOUNT_ID).toBeDefined();

    // generate 6-digit code
    generatedCode = Math.floor(100000 + Math.random() * 900000).toString();

    const expiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // This will insert a hashed code into password_reset_tbl
    await createPasswordReset(TEST_EMAIL, generatedCode, expiration);

    const [rows]: any = await db.execute(
      'SELECT * FROM password_reset_tbl WHERE Email = ? ORDER BY Created_at DESC LIMIT 1',
      [TEST_EMAIL]
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].Reset_code).toBeDefined();
    // stored code must not equal plain generated code
    expect(rows[0].Reset_code).not.toBe(generatedCode);
  });

  it('should verify the reset code successfully', async () => {
    expect(generatedCode).toBeDefined();
    const reset = await verifyResetCode(TEST_EMAIL, generatedCode);
    expect(reset).toBeDefined();
    expect(reset.Email).toBe(TEST_EMAIL);
    expect(reset.IsUsed).toBe(0);
  });

  it('should reset the password and mark the code as used', async () => {
    expect(generatedCode).toBeDefined();

    const result = await resetPassword(TEST_EMAIL, generatedCode, NEW_PASSWORD);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);

    // Verify accounts_tbl password updated (hashed)
    const [accRows]: any = await db.execute(
      `SELECT a.Password FROM accounts_tbl a 
       JOIN profile_tbl p ON a.Account_id = p.Account_id
       WHERE p.Email = ? LIMIT 1`,
      [TEST_EMAIL]
    );
    expect(accRows.length).toBe(1);
    const hashed = accRows[0].Password;
    const match = await bcrypt.compare(NEW_PASSWORD, hashed);
    expect(match).toBe(true);

    // Verify reset code marked used
    const [resetRows]: any = await db.execute(
      'SELECT IsUsed FROM password_reset_tbl WHERE Email = ? ORDER BY Created_at DESC LIMIT 1',
      [TEST_EMAIL]
    );
    expect(resetRows.length).toBeGreaterThan(0);
    expect(resetRows[0].IsUsed).toBe(1);
  });
});


