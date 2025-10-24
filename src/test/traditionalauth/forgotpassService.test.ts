import { pool } from '../../config/db';
import bcrypt from 'bcrypt';
import {
  findProfileByEmail,
  createPasswordReset,
  verifyResetCode,
  resetPassword
} from '../../services/authService';

// Prevent sending real emails during tests
jest.mock('../utils/emailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
  sendResetEmail: jest.fn().mockResolvedValue({ success: true })
}));

describe('Forgot password flow', () => {
  const timestamp = Date.now();
  const TEST_EMAIL = `forgot_${timestamp}@example.com`;
  const TEST_USERNAME = `forgot_user_${timestamp}`;
  let accountId: number;
  let profileId: number;

  beforeAll(async () => {
    // create minimal account + profile required by createPasswordReset
    const [acctRes]: any = await pool.execute(
      'INSERT INTO accounts_tbl (Username, Password, Roles, IsActive) VALUES (?, ?, ?, ?)',
      [TEST_USERNAME, 'initial-hash', 2, 1]
    );
    accountId = acctRes.insertId;

    const [profRes]: any = await pool.execute(
      'INSERT INTO profile_tbl (Account_id, FirstName, LastName, Barangay_id, Contact, Email) VALUES (?, ?, ?, ?, ?, ?)',
      [accountId, 'Forgot', 'User', 1, '09171234567', TEST_EMAIL]
    );
    profileId = profRes.insertId;
  });

  afterAll(async () => {
    try {
      await pool.execute('DELETE FROM password_reset_tbl WHERE Email = ?', [TEST_EMAIL]);
      if (profileId) await pool.execute('DELETE FROM profile_tbl WHERE Profile_id = ?', [profileId]);
      if (accountId) await pool.execute('DELETE FROM accounts_tbl WHERE Account_id = ?', [accountId]);
    } catch {
      // ignore cleanup errors
    }
  });

  it('creates reset code, verifies it, and resets the password', async () => {
    // sanity: profile exists
    const profile = await findProfileByEmail(TEST_EMAIL);
    expect(profile).toBeDefined();
    expect(profile.Email).toBe(TEST_EMAIL);

    // create 6-digit code and expiration
    const code = '123456';
    const expiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // create reset entry
    await expect(createPasswordReset(TEST_EMAIL, code, expiration)).resolves.toBeDefined();

    // confirm DB entry created and stored hashed code
    const [rows]: any = await pool.execute(
      'SELECT * FROM password_reset_tbl WHERE Email = ? ORDER BY Created_at DESC LIMIT 1',
      [TEST_EMAIL]
    );
    expect(rows.length).toBeGreaterThan(0);
    const record = rows[0];
    expect(record.Reset_code).toBeDefined();
    expect(record.Reset_code).not.toBe(code);

    // verify reset code via service
    const verified = await verifyResetCode(TEST_EMAIL, code);
    expect(verified).toBeDefined();
    expect(verified.Email).toBe(TEST_EMAIL);

    // perform password reset with a valid new password
    const newPassword = 'NewPass1!';
    const result = await resetPassword(TEST_EMAIL, code, newPassword);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);

    // confirm accounts_tbl password updated (hashed) and matches new password
    const [acctRows]: any = await pool.execute(
      'SELECT Password FROM accounts_tbl WHERE Account_id = ? LIMIT 1',
      [accountId]
    );
    expect(acctRows.length).toBe(1);
    const hashed = acctRows[0].Password;
    const match = await bcrypt.compare(newPassword, hashed);
    expect(match).toBe(true);
  });
});