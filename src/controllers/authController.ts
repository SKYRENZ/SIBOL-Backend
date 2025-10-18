import { Request, Response } from 'express';
import * as authService from '../services/authService';
import jwt from 'jsonwebtoken';
const SECRET = process.env.JWT_SECRET || 'changeme';
import { pool } from '../config/db'; // Add this import

export async function register(req: Request, res: Response) {
  try {
    console.log('📝 Registration request received:', req.body);
    
    // Add isSSO to destructuring
    const { firstName, lastName, areaId, email, roleId, isSSO } = req.body;
    
    // Pass isSSO flag to the service
    const result = await authService.registerUser(firstName, lastName, areaId, email, roleId, isSSO || false);
    
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
            return res.status(400).json({ message: 'username and password required' });
        }
        const user = await authService.validateUser(username, password);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // sign JWT and return token + user
        const payload = { Account_id: user.Account_id, Username: user.Username, Roles: user.Roles };
        const token = jwt.sign(payload, SECRET, { expiresIn: '8h' });

        return res.status(200).json({ user: { Account_id: user.Account_id, Username: user.Username, Roles: user.Roles }, token });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Login failed';
        return res.status(500).json({ message });
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