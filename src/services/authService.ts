import { pool } from '../config/db';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import * as emailService from '../utils/emailService';
import config from '../config/env';

// DEFAULT_PASSWORD moved to config
const DEFAULT_PASSWORD = config.DEFAULT_PASSWORD;
const ADMIN_ROLE = 1;

// Email verification token expiration (24 hours)
const TOKEN_EXPIRATION_HOURS = 24;

function generateRandomPassword(length = 10) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}

// When creating users (use DEFAULT_PASSWORD fallback if password param missing)
// NOTE: changed parameter name areaId -> barangayId and use Barangay_id column in inserts
export async function registerUser(
  firstName: string,
  lastName: string,
  barangayId: number,
  email: string,
  roleId: number,
  password: string | undefined,
  isSSO: boolean
) {
  const finalPassword = password && password.length > 0 ? password : DEFAULT_PASSWORD;

  // 1. Validation
  if (!firstName || !lastName || !barangayId || !email || !roleId) {
    throw new Error("Missing required fields");
  }

  // Create username (firstname.lastname)
  const username = `${firstName}.${lastName}`.toLowerCase();

  try {
    // 2. Check if username already exists in pending_accounts_tbl
    const [existingPending]: any = await pool.execute(
      "SELECT * FROM pending_accounts_tbl WHERE Username = ? OR Email = ?",
      [username, email]
    );

    if (existingPending.length > 0) {
      throw new Error("Name or email already exists in pending accounts");
    }

    // 3. Check if username/email already exists in active accounts_tbl/profile_tbl
    const [existingActive]: any = await pool.execute(
      `SELECT * FROM accounts_tbl a
       JOIN profile_tbl p ON a.Account_id = p.Account_id
       WHERE a.Username = ? OR p.Email = ?`,
      [username, email]
    );

    if (existingActive.length > 0) {
      throw new Error("Name or email already exists");
    }

    // 4. Generate and hash the password
    if (!finalPassword || typeof finalPassword !== 'string') {
      throw new Error("Failed to generate a valid password");
    }
    let hashedPassword;
    try {
      hashedPassword = await bcrypt.hash(finalPassword, 10);
    } catch (hashError) {
      console.error("❌ Bcrypt hashing failed:", hashError);
      throw new Error("Password hashing failed");
    }

    // 5. Generate verification token (only for non-SSO users)
    let verificationToken = null;
    let tokenExpiration = null;
    let isEmailVerified = isSSO ? 1 : 0;  // SSO users have pre-verified emails

    if (!isSSO) {
      verificationToken = crypto.randomBytes(32).toString('hex');
      tokenExpiration = new Date();
      tokenExpiration.setHours(tokenExpiration.getHours() + TOKEN_EXPIRATION_HOURS);
    }

    // 6. Insert into pending_accounts_tbl — use Barangay_id column
    const [pendingResult]: any = await pool.execute(
      `INSERT INTO pending_accounts_tbl 
       (Username, Password, FirstName, LastName, Email, Barangay_id, Roles, Verification_token, Token_expiration, IsEmailVerified) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, hashedPassword, firstName, lastName, email, barangayId, roleId, verificationToken, tokenExpiration, isEmailVerified]
    );

    // 7. Send verification email (only for non-SSO users and only if not in test environment)
    if (!isSSO && process.env.NODE_ENV !== 'test') {
      try {
        await emailService.sendVerificationEmail(email, verificationToken!, firstName);
      } catch (emailError) {
        console.warn('⚠️ Email sending failed, but registration completed:', emailError);
      }
    }

    // 8. Return registration data
    const responseMessage = isSSO 
      ? "Registration successful. Your account is pending admin approval."
      : "Registration successful. Please check your email to verify your account.";

    const responseNote = isSSO 
      ? "Email already verified via Google. Waiting for admin approval."
      : "Verification email sent. Check your inbox.";

    return {
      success: true,
      message: responseMessage,
      pendingId: pendingResult.insertId,
      username: username,
      email: email,
      isSSO: isSSO,
      emailVerified: isSSO,
      note: responseNote
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error("❌ Registration Error:", error);
    }
    // Preserve original Error message/object so caller sees "Username or email already exists"
    if (error instanceof Error) throw error;
    throw new Error(String(error));
  }
}

// Verify email token (no changes needed to columns)
export async function verifyEmail(token: string) {
  try {
    const [tokenRows]: any = await pool.execute(
      `SELECT * FROM pending_accounts_tbl WHERE Verification_token = ?`,
      [token]
    );

    if (tokenRows.length === 0) {
      throw new Error("Invalid verification token");
    }

    const pendingAccount = tokenRows[0];

    if (pendingAccount.IsEmailVerified === 1) {
      return {
        success: true,
        message: "Email already verified. Waiting for admin approval.",
        pendingId: pendingAccount.Pending_id,
        email: pendingAccount.Email,
        alreadyVerified: true
      };
    }

    const now = new Date();
    const tokenExpiration = new Date(pendingAccount.Token_expiration);
    if (tokenExpiration < now) {
      throw new Error("Verification token has expired. Please request a new verification email.");
    }

    await pool.execute(
      "UPDATE pending_accounts_tbl SET IsEmailVerified = 1 WHERE Pending_id = ?",
      [pendingAccount.Pending_id]
    );

    return {
      success: true,
      message: "Email verified successfully. Waiting for admin approval.",
      pendingId: pendingAccount.Pending_id,
      email: pendingAccount.Email
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error("❌ Email Verification Error:", error);
    }
    throw error;
  }
}

// Resend verification email (no column change required)
export async function resendVerificationEmail(email: string) {
  try {
    console.log('🔄 Resending verification email for:', email);
    
    const [pendingRows]: any = await pool.execute(
      "SELECT * FROM pending_accounts_tbl WHERE Email = ? AND IsEmailVerified = 0",
      [email]
    );

    if (pendingRows.length === 0) {
      throw new Error("No pending account found for this email or email already verified");
    }

    const pendingAccount = pendingRows[0];
    console.log('📋 Found pending account:', {
      email: pendingAccount.Email,
      firstName: pendingAccount.FirstName,
      username: pendingAccount.Username
    });

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiration = new Date();
    tokenExpiration.setHours(tokenExpiration.getHours() + TOKEN_EXPIRATION_HOURS);

    await pool.execute(
      "UPDATE pending_accounts_tbl SET Verification_token = ?, Token_expiration = ? WHERE Email = ?",
      [verificationToken, tokenExpiration, email]
    );
    
    console.log('✅ Updated verification token in database');

    if (process.env.NODE_ENV !== 'test') {
      try {
        console.log('📧 Sending verification email...');
        await emailService.sendVerificationEmail(email, verificationToken, pendingAccount.FirstName);
        console.log('✅ Verification email sent successfully');
      } catch (emailError) {
        console.error('❌ Failed to send verification email:', emailError);
        console.warn('⚠️ Email sending failed, but token was updated in database');
      }
    } else {
      console.log('🧪 Test environment - skipping email send');
    }

    return {
      success: true,
      message: "Verification email resent successfully",
      verificationToken,
      email
    };
  } catch (error) {
    console.error("❌ Resend Verification Error:", error);
    throw new Error(`Failed to resend verification: ${error}`);
  }
}

// Check account status (no change needed)
export async function checkAccountStatus(username: string) {
  const [pendingRows]: any = await pool.execute(
    "SELECT IsEmailVerified, IsAdminVerified FROM pending_accounts_tbl WHERE Username = ?",
    [username]
  );

  if (pendingRows.length > 0) {
    const pending = pendingRows[0];
    if (!pending.IsEmailVerified) {
      return { status: 'email_pending', message: 'Please verify your email first' };
    }
    if (!pending.IsAdminVerified) {
      return { status: 'admin_pending', message: 'Account is pending admin approval' };
    }
  }

  const [activeRows]: any = await pool.execute(
    "SELECT Account_id, IsActive FROM accounts_tbl WHERE Username = ?",
    [username]
  );

  if (activeRows.length > 0) {
    const active = activeRows[0];
    if (!active.IsActive) {
      return { status: 'inactive', message: 'Account has been deactivated' };
    }
    return { status: 'active', message: 'Account is active' };
  }

  return { status: 'not_found', message: 'Account not found' };
}

// Login helper (no change)
export async function validateUser(username: string, password: string) {
  const statusCheck = await checkAccountStatus(username);
  
  if (statusCheck.status !== 'active') {
    throw new Error(statusCheck.message);
  }

  const query = "SELECT Account_id, Username, Password, Roles FROM accounts_tbl WHERE Username = ? AND IsActive = 1 LIMIT 1";
  const [rows]: any = await pool.execute(query, [username]);
  
  if (Array.isArray(rows) && rows.length > 0) {
    const user = rows[0] as any;
    const match = await bcrypt.compare(password, user.Password);
    if (match) {
      const { Password, ...safeUser } = user;
      return safeUser;
    }
  }
  return null;
}

// Password reset & profile helpers (no change)
export async function findProfileByEmail(email: string) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Invalid email format');
    }
    const [rows]: any = await pool.execute('SELECT * FROM profile_tbl WHERE Email = ?', [email]);
    return rows[0];
};

export async function createPasswordReset(email: string, code: string, expiration: Date) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Invalid email format');
    }
    if (!code || !/^\d{6}$/.test(code)) {
        throw new Error('Invalid code format. Must be a 6-digit number.');
    }
    const [existing]: any = await pool.execute(
        `SELECT * FROM password_reset_tbl 
         WHERE Email = ? AND IsUsed = 0 AND Expiration > NOW()`,
        [email]
    );
    if (existing.length > 0) {
        throw new Error('A valid reset code already exists for this email. Please check your email.');
    }
    const profile = await findProfileByEmail(email);
    if (!profile) throw new Error('No account found with that email');

    await pool.execute(
        `DELETE FROM password_reset_tbl WHERE Expiration <= NOW()`
    );

    const hashedCode = await bcrypt.hash(code, 10);
    await pool.execute(
        'INSERT INTO password_reset_tbl (Email, Reset_code, Expiration) VALUES (?, ?, ?)',
        [email, hashedCode, expiration]
    );
};

export async function verifyResetCode(email: string, code: string) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Invalid email format');
    }
    if (!code || !/^\d{6}$/.test(code)) {
        throw new Error('Invalid code format. Must be a 6-digit number.');
    }
    const [rows]: any = await pool.execute(
        `SELECT * FROM password_reset_tbl 
         WHERE Email = ? AND IsUsed = 0 AND Expiration > NOW() 
         ORDER BY Created_at DESC LIMIT 1`,
        [email]
    );
    if (!rows.length) throw new Error('No valid reset code found');

    const reset = rows[0];
    const match = await bcrypt.compare(code, reset.Reset_code);
    if (!match) throw new Error('Invalid reset code');

    return reset;
}

export async function resetPassword(email: string, code: string, newPassword: string) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Invalid email format');
    }
    if (!code || !/^\d{6}$/.test(code)) {
        throw new Error('Invalid code format. Must be a 6-digit number.');
    }
    if (!newPassword || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}/.test(newPassword)) {
        throw new Error('Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.');
    }

    const reset = await verifyResetCode(email, code);
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const [profileRows]: any = await pool.execute(
        'SELECT Account_id FROM profile_tbl WHERE Email = ?',
        [email]
    );
    if (!profileRows.length) throw new Error('Profile not found');
    const accountId = profileRows[0].Account_id;

    await pool.execute(
        'UPDATE accounts_tbl SET Password = ? WHERE Account_id = ?',
        [hashedPassword, accountId]
    );

    await pool.execute(
        'UPDATE password_reset_tbl SET IsUsed = 1 WHERE Reset_id = ?',
        [reset.Reset_id]
    );

    return { success: true, message: 'Password reset successful' };
}

// Test DB connection helper
async function testDBConnection() {
  try {
    const connection = await pool.getConnection();
    try {
      const host = (connection as any)?.config?.host ?? 'unknown';
      const port = (connection as any)?.config?.port ?? 'unknown';
      const threadId = (connection as any)?.threadId ?? 'unknown';
      console.log(`DB connection test: host=${host} port=${port} threadId=${threadId}`);
    } catch (logErr) {
      console.log('DB connection test: connection established (details hidden)');
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('DB connection error:', error);
  }
}

export { testDBConnection };

export async function getBarangays() {
  // Return all barangays (your table doesn't have an IsActive column)
  const [rows]: any = await pool.execute(
    `SELECT Barangay_id AS id, Barangay_Name AS name
     FROM barangay_tbl
     ORDER BY Barangay_Name`
  );
  return rows;
}