import { Request, Response } from 'express';
import * as authService from '../services/authService';
import { pool } from '../config/db'; // Add this import
import { sendResetEmail } from '../utils/emailService.js';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';  // Add this import

const SECRET = config.JWT_SECRET;  // Use config.JWT_SECRET
const JWT_SECRET = config.JWT_SECRET;  // Use config.JWT_SECRET


export async function register(req: Request, res: Response) {
  try {
    console.log('📝 Registration request received:', req.body);
    
    // NOTE: use barangayId (new DB column) instead of areaId
    const { firstName, lastName, barangayId, areaId, email, roleId, isSSO } = req.body;
    // support legacy areaId if caller still sends it
    const finalBarangayId = barangayId ?? areaId;

    if (!finalBarangayId) {
      return res.status(400).json({ success: false, error: 'barangayId is required' });
    }

    // Pass undefined for password so the service will generate one, then pass isSSO as the final flag
    const result = await authService.registerUser(
      firstName,
      lastName,
      Number(finalBarangayId),
      email,
      Number(roleId),
      undefined,
      Boolean(isSSO || false)
    );
    
    console.log('✅ Registration successful:', result);
    res.status(201).json(result);
  } catch (error: any) {
    // log full stack for debugging
    console.error('❌ Registration error:', error?.stack ?? error);
    const message = error?.message ?? String(error) ?? 'Registration failed';
    // If message indicates a duplicate, return 409 Conflict so frontend can handle specifically
    const statusCode = /exist/i.test(message) ? 409 : 400;
    res.status(statusCode).json({
      success: false,
      error: message
    });
  }
}

// ✅ NEW: Email verification endpoint
export async function verifyEmail(req: Request, res: Response) {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).json({ 
        success: false, 
        error: "Verification token is required" 
      });
    }
    
    const result = await authService.verifyEmail(token);
    
    // You could redirect to a success page instead of JSON response
    res.status(200).json(result);
  } catch (error: any) {
    // You could redirect to an error page instead of JSON response
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
}

// ✅ NEW: Resend verification email
export async function resendVerification(req: Request, res: Response) {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: "Email is required" 
      });
    }
    
    const result = await authService.resendVerificationEmail(email);
    
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
}

// ✅ NEW: Check account status
export async function checkStatus(req: Request, res: Response) {
  try {
    const { username } = req.params;
    
    if (!username) {
      return res.status(400).json({ 
        success: false, 
        error: "Username is required" 
      });
    }
    
    const result = await authService.checkAccountStatus(username);
    
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
}

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const [rows]: any = await pool.query('SELECT * FROM accounts_tbl WHERE Username = ? LIMIT 1', [username]);
    const user = rows?.[0];
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    // verify password (bcrypt if available, fallback to plain compare)
    let isValid = false;
    try {
      const bcrypt = await import('bcrypt');
      isValid = await bcrypt.compare(password, user.Password);
    } catch {
      isValid = password === user.Password;
    }
    if (!isValid) return res.status(401).json({ message: 'Invalid credentials' });

    // include Account_id and Roles in token payload so authenticate middleware can resolve user
    const payload = { Account_id: user.Account_id, Roles: user.Roles, Username: user.Username };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    const safeUser = { ...user };
    delete (safeUser as any).Password;

    return res.json({ token, user: safeUser });
  } catch (err: any) {
    // <-- changed: log full stack for dev:local debugging
    console.error('login error:', err?.stack ?? err);
    return res.status(500).json({ message: 'Login failed', error: err?.message ?? err });
  }
};

export async function checkSSOEligibility(req: Request, res: Response) {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const [userRows]: any = await pool.execute(`
      SELECT Account_id, Username, Roles, FirstName, LastName, Email 
      FROM accounts_tbl a 
      JOIN profile_tbl p ON a.Account_id = p.Account_id 
      WHERE p.Email = ? AND a.IsActive = 1
    `, [email]);

    if (userRows.length === 0) {
      return res.status(404).json({ 
        message: 'Email not found in system',
        canSSO: false 
      });
    }

    return res.json({
      canSSO: true,
      message: 'Eligible for SSO'
    });

  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function forgotPassword (req: Request, res: Response) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

    const user = await authService.findProfileByEmail(email);
    if (!user) return res.status(404).json({ success: false, error: 'Email not found' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiration = new Date(Date.now() + 10 * 60 * 1000);

    try {
      await authService.createPasswordReset(email, code, expiration);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg.includes('already exists')) return res.status(409).json({ success: false, error: msg });
      return res.status(400).json({ success: false, error: msg });
    }

    // respond immediately
    res.status(200).json({ success: true, message: 'Reset code created. If your email is valid you will receive instructions shortly.' });

    // send email asynchronously, do NOT await — failures will be logged
    void (async () => {
      try {
        await sendResetEmail(email, code);
        console.log('✅ Background reset email sent for', email);
      } catch (err: any) {
        console.error('❌ Background sendResetEmail failed for', email, err?.message ?? err);
        // optionally record failure for retry
      }
    })();

  } catch (err: any) {
    console.error('forgotPassword error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

export async function verifyResetCode(req: Request, res: Response) {
    const { email, code } = req.body;
    try {
        await authService.verifyResetCode(email, code);
        res.json({ success: true, message: 'Code verified. You may reset your password.' });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
}

export async function resetPassword(req: Request, res: Response) {
    const { email, code, newPassword } = req.body;
    try {
        const result = await authService.resetPassword(email, code, newPassword);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
}

// New: return barangay list from DB for sign-up dropdown
export async function getBarangays(req: Request, res: Response) {
  try {
    const rows = await authService.getBarangays();
    return res.json({ success: true, barangays: rows });
  } catch (err: any) {
    console.error('getBarangays error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load barangays' });
  }
}