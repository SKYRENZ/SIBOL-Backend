import { Request, Response } from 'express';
import * as authService from '../services/authService';
import { pool } from '../config/db'; // Add this import

export async function register(req: Request, res: Response) {
  try {
    console.log('📝 Registration request received:', req.body);
    
    const { firstName, lastName, areaId, contact, email, roleId } = req.body;
    
    const result = await authService.registerUser(firstName, lastName, areaId, contact, email, roleId);
    
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

export async function login(req: Request, res: Response) {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: "Username and password are required" 
      });
    }
    
    const user = await authService.validateUser(username, password);
    
    if (user) {
      res.status(200).json({ 
        success: true, 
        message: "Login successful", 
        user 
      });
    } else {
      res.status(401).json({ 
        success: false, 
        error: "Invalid credentials" 
      });
    }
  } catch (error: any) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
}

export async function checkSSOEligibility(req: Request, res: Response) {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const [userRows]: any = await pool.execute(`
      SELECT p.Email_verified, p.Admin_verified 
      FROM profile_tbl p 
      JOIN accounts_tbl a ON p.Account_id = a.Account_id 
      WHERE p.Email = ? AND a.IsActive = 1
    `, [email]);

    if (userRows.length === 0) {
      return res.status(404).json({ 
        message: 'Email not found in system',
        canSSO: false 
      });
    }

    const user = userRows[0];
    const canSSO = user.Email_verified && user.Admin_verified;

    return res.json({
      canSSO,
      emailVerified: user.Email_verified,
      adminVerified: user.Admin_verified,
      message: canSSO ? 'Eligible for SSO' : 'Account not fully verified'
    });

  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
}