import { pool } from '../config/db';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import * as emailService from '../utils/emailService';

// 🔐 Default password
const DEFAULT_PASSWORD = "SIBOL12345";
const ADMIN_ROLE = 1;

// 📧 Email verification token expiration (24 hours)
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

export async function registerUser(firstName: string, lastName: string, areaId: number, email: string, roleId: number, password?: string, isSSO: boolean = false) {
  // ✅ 1. Validation
  if (!firstName || !lastName || !areaId || !email || !roleId) {
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
    const finalPassword = password || generateRandomPassword();  // Use provided or default
    const hashedPassword = await bcrypt.hash(finalPassword, 10);

    // ✅ 5. Generate verification token (only for non-SSO users)
    let verificationToken = null;
    let tokenExpiration = null;
    let isEmailVerified = isSSO ? 1 : 0; // SSO users have pre-verified emails

    if (!isSSO) {
      verificationToken = crypto.randomBytes(32).toString('hex');
      tokenExpiration = new Date();
      tokenExpiration.setHours(tokenExpiration.getHours() + TOKEN_EXPIRATION_HOURS);
    }

    // ✅ 6. Insert into pending_accounts_tbl
    const [pendingResult]: any = await pool.execute(
      `INSERT INTO pending_accounts_tbl 
       (Username, Password, FirstName, LastName, Email, Area_id, Roles, Verification_token, Token_expiration, IsEmailVerified) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, hashedPassword, firstName, lastName, email, areaId, roleId, verificationToken, tokenExpiration, isEmailVerified]
    );

    // ✅ 7. Send verification email (only for non-SSO users and only if not in test environment)
    if (!isSSO && process.env.NODE_ENV !== 'test') {
      try {
        await emailService.sendVerificationEmail(email, verificationToken!, firstName);
      } catch (emailError) {
        // Log email error but don't fail registration
        console.warn('⚠️ Email sending failed, but registration completed:', emailError);
      }
    }

    // ✅ 8. Return registration data
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
    // ✅ Only log in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      console.error("❌ Registration Error:", error);
    }
    throw new Error(`Registration failed: ${error}`);
  }
}

// ✅ UPDATED: Verify email token
export async function verifyEmail(token: string) {
  try {
    // First, check if the token exists (regardless of verification status)
    const [tokenRows]: any = await pool.execute(
      `SELECT * FROM pending_accounts_tbl WHERE Verification_token = ?`,
      [token]
    );

    if (tokenRows.length === 0) {
      throw new Error("Invalid verification token");
    }

    const pendingAccount = tokenRows[0];

    // Check if email is already verified
    if (pendingAccount.IsEmailVerified === 1) {
      return {
        success: true,
        message: "Email already verified. Waiting for admin approval.",
        pendingId: pendingAccount.Pending_id,
        email: pendingAccount.Email,
        alreadyVerified: true
      };
    }

    // Check if token has expired
    const now = new Date();
    const tokenExpiration = new Date(pendingAccount.Token_expiration);
    if (tokenExpiration < now) {
      throw new Error("Verification token has expired. Please request a new verification email.");
    }

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
    // ✅ Only log in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      console.error("❌ Email Verification Error:", error);
    }
    throw error; // Don't wrap the error, just re-throw it
  }
}

// ✅ FIXED: Resend verification email (generate new token AND send email)
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

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiration = new Date();
    tokenExpiration.setHours(tokenExpiration.getHours() + TOKEN_EXPIRATION_HOURS);

    // Update token in database
    await pool.execute(
      "UPDATE pending_accounts_tbl SET Verification_token = ?, Token_expiration = ? WHERE Email = ?",
      [verificationToken, tokenExpiration, email]
    );
    
    console.log('✅ Updated verification token in database');

    // 🔥 FIX: Actually send the email (only if not in test environment)
    if (process.env.NODE_ENV !== 'test') {
      try {
        console.log('📧 Sending verification email...');
        await emailService.sendVerificationEmail(email, verificationToken, pendingAccount.FirstName);
        console.log('✅ Verification email sent successfully');
      } catch (emailError) {
        console.error('❌ Failed to send verification email:', emailError);
        // Don't throw error, still return success since token was updated
        console.warn('⚠️ Email sending failed, but token was updated in database');
      }
    } else {
      console.log('🧪 Test environment - skipping email send');
    }

    return {
      success: true,
      message: "Verification email resent successfully",
      verificationToken, // For testing purposes
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