import db from '../config/db';
import { validateUser, registerUser, verifyEmail, checkAccountStatus } from '../services/authService';
import { createSqlLogger } from "./sqlLogger";

const LOG_SQL = process.env.MOCK_SQL_LOG === "true";
const authSqlCalls: Array<[string, any[] | undefined]> = [];
const _originalDbExecute = (db as any).execute;

const SQL_LOGGER = createSqlLogger("authService");

const TEST_FIRSTNAME = 'Test';
const TEST_LASTNAME = 'User' + Date.now(); // Use timestamp to ensure uniqueness
const TEST_AREAID = 1;
const TEST_EMAIL = `testuser${Date.now()}@example.com`; // Use timestamp to ensure uniqueness
const TEST_ROLEID = 2;
const TEST_PASSWORD = 'SIBOL12345';
const TEST_USERNAME = `${TEST_FIRSTNAME}.${TEST_LASTNAME}`.toLowerCase();

let TEST_PENDING_ID: number;
let TEST_VERIFICATION_TOKEN: string;
let TEST_ACCOUNT_ID: number;

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
    await db.execute('DELETE FROM pending_accounts_tbl WHERE Email LIKE ?', [`testuser%`]);
    
    // Clean up specific test data
    await db.execute('DELETE FROM profile_tbl WHERE Email = ?', [TEST_EMAIL]);
    await db.execute('DELETE FROM accounts_tbl WHERE Username = ?', [TEST_USERNAME]);
    await db.execute('DELETE FROM pending_accounts_tbl WHERE Email = ?', [TEST_EMAIL]);
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

describe('AuthService - Registration Flow (No Contact Field)', () => {
  it('should register user successfully without contact field', async () => {
    const result = await registerUser(
      TEST_FIRSTNAME,
      TEST_LASTNAME,
      TEST_AREAID,
      TEST_EMAIL,
      TEST_ROLEID
    );

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.username).toBe(TEST_USERNAME);
    expect(result.email).toBe(TEST_EMAIL);
    expect(result.message).toContain('Registration successful');
    
    TEST_PENDING_ID = result.pendingId;
  });

  it('should prevent duplicate registration', async () => {
    await expect(
      registerUser(
        TEST_FIRSTNAME,
        TEST_LASTNAME,
        TEST_AREAID,
        TEST_EMAIL,
        TEST_ROLEID
      )
    ).rejects.toThrow('Username or email already exists in pending accounts');
  });

  it('should show email_pending status for unverified user', async () => {
    const status = await checkAccountStatus(TEST_USERNAME);
    expect(status.status).toBe('email_pending');
    expect(status.message).toBe('Please verify your email first');
  });
});

describe('AuthService - Email Verification', () => {
  it('should get verification token from database', async () => {
    // Get the verification token from the database
    const [rows]: any = await db.execute(
      'SELECT Verification_token FROM pending_accounts_tbl WHERE Pending_id = ?',
      [TEST_PENDING_ID]
    );
    
    expect(rows.length).toBe(1);
    TEST_VERIFICATION_TOKEN = rows[0].Verification_token;
    expect(TEST_VERIFICATION_TOKEN).toBeDefined();
  });

  it('should verify email successfully', async () => {
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

  it('should reject invalid verification token', async () => {
    await expect(
      verifyEmail('invalid-token')
    ).rejects.toThrow('Invalid or expired verification token');
  });
});

describe('AuthService - Admin Approval Simulation', () => {
  it('should simulate admin approval by moving data to main tables', async () => {
    // Simulate admin approval process
    const [pendingRows]: any = await db.execute(
      'SELECT * FROM pending_accounts_tbl WHERE Pending_id = ?',
      [TEST_PENDING_ID]
    );
    
    expect(pendingRows.length).toBe(1);
    const pendingAccount = pendingRows[0];

    // Insert into accounts_tbl
    const [accountResult]: any = await db.execute(
      'INSERT INTO accounts_tbl (Username, Password, Roles, IsActive) VALUES (?, ?, ?, 1)',
      [pendingAccount.Username, pendingAccount.Password, pendingAccount.Roles]
    );

    TEST_ACCOUNT_ID = accountResult.insertId;

    // Insert into profile_tbl (without Contact field)
    await db.execute(
      'INSERT INTO profile_tbl (Account_id, FirstName, LastName, Area_id, Email) VALUES (?, ?, ?, ?, ?)',
      [TEST_ACCOUNT_ID, pendingAccount.FirstName, pendingAccount.LastName, pendingAccount.Area_id, pendingAccount.Email]
    );

    // Delete from pending_accounts_tbl
    await db.execute('DELETE FROM pending_accounts_tbl WHERE Pending_id = ?', [TEST_PENDING_ID]);

    // Verify the user is now in the main tables
    const [accountRows]: any = await db.execute(
      'SELECT * FROM accounts_tbl WHERE Username = ?',
      [TEST_USERNAME]
    );
    expect(accountRows.length).toBe(1);

    const [profileRows]: any = await db.execute(
      'SELECT * FROM profile_tbl WHERE Email = ?',
      [TEST_EMAIL]
    );
    expect(profileRows.length).toBe(1);
    expect(profileRows[0].Contact).toBeNull(); // Contact should be NULL
  });
});

describe('AuthService - Login After Approval', () => {
  it('should return active status for approved user', async () => {
    const status = await checkAccountStatus(TEST_USERNAME);
    expect(status.status).toBe('active');
    expect(status.message).toBe('Account is active');
  });

  it('should login successfully with correct credentials', async () => {
    const user = await validateUser(TEST_USERNAME, TEST_PASSWORD);
    expect(user).toBeDefined();
    expect(user.Username).toBe(TEST_USERNAME);
    expect(user.Account_id).toBeDefined();
    expect(user.Roles).toBe(TEST_ROLEID);
    expect(user.Password).toBeUndefined(); // Password should be excluded
  });

  it('should return null for invalid credentials', async () => {
    const user = await validateUser(TEST_USERNAME, 'wrongpassword');
    expect(user).toBeNull();
  });

  it('should throw error for non-existent user', async () => {
    await expect(
      validateUser('nonexistent.user', TEST_PASSWORD)
    ).rejects.toThrow('Account not found');
  });
});

describe('AuthService - Edge Cases', () => {
  it('should throw error for missing required fields', async () => {
    await expect(
      registerUser('', '', 0, '', 0)
    ).rejects.toThrow('Missing required fields');
  });

  it('should return not_found status for non-existent username', async () => {
    const status = await checkAccountStatus('nonexistent.user');
    expect(status.status).toBe('not_found');
    expect(status.message).toBe('Account not found');
  });
});


