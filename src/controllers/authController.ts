import { Request, Response } from 'express';
import * as authService from '../services/authService';
import { pool } from '../config/db';
import { sendResetEmail } from '../utils/emailService';
import jwt from 'jsonwebtoken';
import config from '../config/env';

const JWT_SECRET = config.JWT_SECRET;

export async function register(req: Request, res: Response) {
  try {
    // ✅ REMOVED: console.log('📝 Registration request received:', req.body);
    
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
    
    // ✅ REMOVED: console.log('✅ Registration successful:', result);
    res.status(201).json(result);
  } catch (error: any) {
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

// ✅ REFACTORED: Now uses authService.loginUser()
export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const user = await authService.loginUser(username, password);

    const payload = { 
      Account_id: user.Account_id, 
      Roles: user.Roles, 
      Username: user.Username,
      IsFirstLogin: user.IsFirstLogin
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    // ✅ REMOVED: console.log('🔐 Login successful - User data being sent:', user);

    return res.json({ user });
  } catch (err: any) {
    const statusCode = err.message === 'Invalid credentials' ? 401 : 500;
    return res.status(statusCode).json({ 
      message: err.message || 'Login failed'
    });
  }
};

export async function checkSSOEligibility(req: Request, res: Response) {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    // ✅ Call service layer
    const result = await authService.checkSSOEligibility(email);

    if (!result.canSSO) {
      return res.status(404).json({ 
        success: false,
        canSSO: false,
        message: result.message
      });
    }

    return res.json({
      success: true,
      canSSO: true,
      message: result.message
    });

  } catch (error: any) {
    console.error('checkSSOEligibility error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
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

    // Fetch fresh user data from database
    const [rows]: any = await pool.execute(
      `SELECT a.Account_id, a.Username, a.Roles, a.IsActive, a.IsFirstLogin,
              p.FirstName, p.LastName, p.Email
       FROM accounts_tbl a
       LEFT JOIN profile_tbl p ON a.Account_id = p.Account_id
       WHERE a.Account_id = ? AND a.IsActive = 1`,
      [tokenUser.Account_id]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({ 
        valid: false, 
        error: 'Account not found or inactive' 
      });
    }

    const user = rows[0];
    delete (user as any).Password; // Safety check

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

export async function changePassword(req: Request, res: Response) {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = (req as any).user; // From authenticate middleware

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Current password and new password are required' 
      });
    }

    // Validate new password strength
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}/.test(newPassword)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol' 
      });
    }

    const result = await authService.changeUserPassword(
      user.Account_id,
      currentPassword,
      newPassword
    );

    res.json(result);
  } catch (error: any) {
    console.error('changePassword error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message || 'Failed to change password' 
    });
  }
}

// NEW: Get queue position
export async function getQueuePosition(req: Request, res: Response) {
  try {
    const { email } = req.query;
    
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Email is required' 
      });
    }

    const queueInfo = await authService.getQueuePosition(email);

    res.json({ 
      success: true, 
      ...queueInfo 
    });
  } catch (error: any) {
    console.error('getQueuePosition error:', error);
    
    if (error.message === 'Account not found in pending queue') {
      return res.status(404).json({ 
        success: false, 
        error: 'Account not found or already approved' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get queue position' 
    });
  }
}