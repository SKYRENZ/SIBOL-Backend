import { Request, Response } from 'express';
import * as authService from '../services/authService';
import { pool } from '../config/db';
import { sendResetEmail } from '../utils/emailService';
import jwt from 'jsonwebtoken';
import config from '../config/env';

const SECRET = config.JWT_SECRET;
const JWT_SECRET = config.JWT_SECRET;

export async function register(req: Request, res: Response) {
  try {
    console.log('📝 Registration request received:', req.body);
    
    const { firstName, lastName, barangayId, areaId, email, roleId, isSSO } = req.body;
    const finalBarangayId = barangayId ?? areaId;

    if (!finalBarangayId) {
      return res.status(400).json({ success: false, error: 'barangayId is required' });
    }

    const explicitClientHeader = (req.headers['x-client-type'] as string) || (req.body?.client as string);
    const ua = (req.headers['user-agent'] as string) || '';
    const isMobileClient = !!explicitClientHeader
      ? /mobile|mobi|react-native|expo|android|ios/i.test(explicitClientHeader)
      : /okhttp|react-native|expo|android|iphone|ipad|mobile|iOS|Android/i.test(ua);

    const sendMethod: 'link' | 'code' = isMobileClient ? 'code' : 'link';

    const result = await authService.registerUser(
      firstName,
      lastName,
      Number(finalBarangayId),
      email,
      Number(roleId),
      undefined,
      Boolean(isSSO || false),
      sendMethod
    );
    
    console.log('✅ Registration successful:', result);
    res.status(201).json(result);
  } catch (error: any) {
    console.error('❌ Registration error:', error?.stack ?? error);
    const message = error?.message ?? String(error) ?? 'Registration failed';
    const statusCode = /exist/i.test(message) ? 409 : 400;
    res.status(statusCode).json({
      success: false,
      error: message
    });
  }
}

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
    
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
}

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

    let isValid = false;
    try {
      const bcrypt = await import('bcrypt');
      isValid = await bcrypt.compare(password, user.Password);
    } catch {
      isValid = password === user.Password;
    }
    if (!isValid) return res.status(401).json({ message: 'Invalid credentials' });

    const payload = { Account_id: user.Account_id, Roles: user.Roles, Username: user.Username };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    const safeUser = { ...user };
    delete (safeUser as any).Password;

    return res.json({ token, user: safeUser });
  } catch (err: any) {
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
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    const user = await authService.findProfileByEmail(email);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'No account found with that email address. Please check your email and try again.' 
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiration = new Date(Date.now() + 10 * 60 * 1000);

    try {
      await authService.createPasswordReset(email, code, expiration);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg.includes('already exists')) {
        return res.status(409).json({ 
          success: false, 
          error: 'A reset code was recently sent to this email. Please check your inbox or wait a few minutes before requesting another code.' 
        });
      }
      return res.status(400).json({ success: false, error: msg });
    }

    // Send email asynchronously
    void (async () => {
      try {
        await sendResetEmail(email, code);
        console.log('✅ Background reset email sent for', email);
      } catch (err: any) {
        console.error('❌ Background sendResetEmail failed for', email, err?.message ?? err);
      }
    })();

    // Respond with success
    res.status(200).json({ 
      success: true, 
      message: 'Reset code sent successfully. Please check your email.',
      debugCode: process.env.NODE_ENV !== 'production' ? code : undefined
    });

  } catch (err: any) {
    console.error('forgotPassword error:', err);
    res.status(500).json({ success: false, error: 'Server error. Please try again later.' });
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

export async function getBarangays(req: Request, res: Response) {
  try {
    const rows = await authService.getBarangays();
    return res.json({ success: true, barangays: rows });
  } catch (err: any) {
    console.error('getBarangays error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load barangays' });
  }
}

export async function sendVerificationCode(req: Request, res: Response) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });
    const result = await authService.createEmailVerification(email);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message ?? String(err) });
  }
}

export async function verifyVerificationCode(req: Request, res: Response) {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ success: false, error: 'Email and code required' });
    await authService.verifyEmailCode(email, code);
    res.json({ success: true, message: 'Email verified' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message ?? String(err) });
  }
}

export async function verifyToken(req: Request, res: Response) {
  try {
    // The authenticate middleware already validated the token
    // and attached the user to req.user
    const tokenUser = (req as any).user;
    
    if (!tokenUser || !tokenUser.Account_id) {
      return res.status(401).json({ 
        valid: false, 
        error: 'Invalid token payload' 
      });
    }

    // Fetch fresh user data from database to ensure account is still active
    const user = await authService.getUserById(tokenUser.Account_id);

    if (!user) {
      return res.status(401).json({ 
        valid: false, 
        error: 'Account not found or inactive' 
      });
    }

    res.json({ 
      valid: true, 
      user: user
    });
  } catch (error: any) {
    console.error('Token verification error:', error);
    res.status(500).json({ 
      valid: false, 
      error: 'Server error during verification' 
    });
  }
}