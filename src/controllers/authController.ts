import { Request, Response } from 'express';
import * as authService from '../services/authService';

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