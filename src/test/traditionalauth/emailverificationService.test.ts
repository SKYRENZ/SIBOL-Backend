import { pool } from '../../config/db';
import { verifyEmail } from '../../services/authService';

// Prevent any real emails (not required for verifyEmail but safe)
jest.mock('../../utils/emailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
  sendResetEmail: jest.fn().mockResolvedValue({ success: true })
}));

describe('Email verification flow', () => {
  const TEST_EMAIL = `emailverify_${Date.now()}@example.com`;
  let pendingId: number;
  let token: string;

  beforeAll(async () => {
    // generate token and insert pending account row
    token = `tkn_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const tokenExpiration = new Date(Date.now() + 24 * 3600 * 1000); // 24h in future

    const [res]: any = await pool.execute(
      `INSERT INTO pending_accounts_tbl
         (Username, Password, FirstName, LastName, Email, Barangay_id, Roles, Verification_token, Token_expiration, IsEmailVerified, IsAdminVerified, Created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [`u_${Date.now()}`, 'pw', 'Verif', 'User', TEST_EMAIL, 1, 2, token, tokenExpiration, 0, 0]
    );
    pendingId = res.insertId;
  });

  afterAll(async () => {
    try {
      if (pendingId) {
        await pool.execute('DELETE FROM pending_accounts_tbl WHERE Pending_id = ?', [pendingId]);
      }
    } catch (err) {
      // ignore cleanup errors in tests
    }
    // Close the pool so Jest can exit
    await pool.end();
    // Do not close if other suites expect the same pool across parallel runs;
    // if you keep tests run --runInBand you can safely close here.
  });

  it('verifies email with valid token', async () => {
    const result = await verifyEmail(token);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.email).toBe(TEST_EMAIL);
    expect(result.alreadyVerified).not.toBe(true);
  });

  it('returns alreadyVerified when token is used again', async () => {
    const result2 = await verifyEmail(token);
    expect(result2).toBeDefined();
    expect(result2.success).toBe(true);
    expect(result2.alreadyVerified).toBe(true);
    expect(result2.email).toBe(TEST_EMAIL);
  });
});