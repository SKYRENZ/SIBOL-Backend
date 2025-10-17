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

export async function login(req: Request, res: Response) {
  try {
    const { username, password } = req.body;
    
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