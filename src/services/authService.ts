import { pool } from '../config/db';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import * as emailService from '../utils/emailService'; // Add this import

// 🔐 Default password
const DEFAULT_PASSWORD = "SIBOL12345";
const ADMIN_ROLE = 1;

// 📧 Email verification token expiration (24 hours)
const TOKEN_EXPIRATION_HOURS = 24;

//register function - now stores in pending_accounts_tbl with email verification
export async function registerUser(firstName: string, lastName: string, areaId: number, contact: string, email: string, roleId: number) {
  // ✅ 1. Validation
  if (!firstName || !lastName || !areaId || !contact || !email || !roleId) {
    throw new Error("Missing required fields");
  }

  // Create username (firstname.lastname)
  const username = `${firstName}.${lastName}`.toLowerCase();

  try {
    // ✅ 2. Check if username already exists in pending_accounts_tbl
    const [existingPending]: any = await pool.execute("SELECT * FROM pending_accounts_tbl WHERE Username = ? OR Email = ?", [username, email]);

    if (existingPending.length > 0) {
      throw new Error("Username or email already exists in pending accounts");
    }

    // ✅ 3. Check if username/email already exists in active accounts_tbl
    const [existingActive]: any = await pool.execute("SELECT * FROM accounts_tbl a JOIN profile_tbl p ON a.Account_id = p.Account_id WHERE a.Username = ? OR p.Email = ?", [username, email]);

    if (existingActive.length > 0) {
      throw new Error("Username or email already exists");
    }

    // ✅ 4. Hash the password before storing
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // ✅ 5. Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiration = new Date();
    tokenExpiration.setHours(tokenExpiration.getHours() + TOKEN_EXPIRATION_HOURS);

    // ✅ 6. Insert into pending_accounts_tbl with verification token
    const [pendingResult]: any = await pool.execute(
      `INSERT INTO pending_accounts_tbl 
       (Username, Password, FirstName, LastName, Email, Contact, Area_id, Roles, Verification_token, Token_expiration) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, hashedPassword, firstName, lastName, email, contact, areaId, roleId, verificationToken, tokenExpiration]
    );

    // ✅ 7. Send verification email
    await emailService.sendVerificationEmail(email, verificationToken, firstName);

    // ✅ 8. Return registration data (without exposing token in response)
    return {
      success: true,
      message: "Registration successful. Please check your email to verify your account.",
      pendingId: pendingResult.insertId,
      username: username,
      email: email,
      note: "Verification email sent. Check your inbox."
    };
  } catch (error) {
    console.error("❌ Registration Error:", error);
    throw new Error(`Registration failed: ${error}`);
  }
}

// ✅ NEW: Verify email token
export async function verifyEmail(token: string) {
  try {
    // Find pending account with valid token
    const [pendingRows]: any = await pool.execute(
      `SELECT * FROM pending_accounts_tbl 
       WHERE Verification_token = ? AND Token_expiration > NOW() AND IsEmailVerified = 0`,
      [token]
    );

    if (pendingRows.length === 0) {
      throw new Error("Invalid or expired verification token");
    }

    const pendingAccount = pendingRows[0];

    // Update email verification status
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
    console.error("❌ Email Verification Error:", error);
    throw new Error(`Email verification failed: ${error}`);
  }
}

// ✅ NEW: Resend verification email (generate new token)
export async function resendVerificationEmail(email: string) {
  try {
    const [pendingRows]: any = await pool.execute(
      "SELECT * FROM pending_accounts_tbl WHERE Email = ? AND IsEmailVerified = 0",
      [email]
    );

    if (pendingRows.length === 0) {
      throw new Error("No pending account found for this email or email already verified");
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiration = new Date();
    tokenExpiration.setHours(tokenExpiration.getHours() + TOKEN_EXPIRATION_HOURS);

    // Update token in database
    await pool.execute(
      "UPDATE pending_accounts_tbl SET Verification_token = ?, Token_expiration = ? WHERE Email = ?",
      [verificationToken, tokenExpiration, email]
    );

    return {
      success: true,
      message: "Verification email resent",
      verificationToken,
      email
    };
  } catch (error) {
    console.error("❌ Resend Verification Error:", error);
    throw new Error(`Failed to resend verification: ${error}`);
  }
}

// ✅ NEW: Check account status (for login attempts)
export async function checkAccountStatus(username: string) {
  // Check if account is in pending_accounts_tbl
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

  // Check if account exists in active accounts_tbl
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

// ✅ UPDATED: Login function with status check
export async function validateUser(username: string, password: string) {
  // First check account status
  const statusCheck = await checkAccountStatus(username);
  
  if (statusCheck.status !== 'active') {
    throw new Error(statusCheck.message);
  }

  // Proceed with normal login
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

// NOTE: admin-specific functions (updateAccountAndProfile, setAccountActive, etc.)
// were moved to src/services/adminService.ts to follow SRP.