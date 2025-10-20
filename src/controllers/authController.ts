import { Request, Response } from 'express';
import * as authService from '../services/authService';
import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
import { pool } from '../config/db'; // Add this import

export async function register(req: Request, res: Response) {
  try {
    console.log('📝 Registration request received:', req.body);
    
    // Add isSSO to destructuring
    const { firstName, lastName, areaId, email, roleId, isSSO } = req.body;
    
    // Pass undefined for password so the service will generate one, then pass isSSO as the final flag
    const result = await authService.registerUser(firstName, lastName, areaId, email, roleId, undefined, isSSO || false);
    
    console.log('✅ Registration successful:', result);
    res.status(201).json(result);
  } catch (error: any) {
    console.error('❌ Registration error:', error.message);
    res.status(400).json({ 
      success: false, 
      error: error.message 
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