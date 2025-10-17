import { Router, Request, Response } from 'express';
import passport from '../services/googleauthService';

const router = Router();

// Initiate Google OAuth
router.get('/google', 
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth callback with better error handling
router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: `http://localhost:5173/login?error=auth_failed`,
    failureMessage: true 
  }),
  (req: Request, res: Response) => {
    if (req.user) {
      // Store user data that frontend can access
      const userData = {
        Account_id: (req.user as any).Account_id,
        Username: (req.user as any).Username,
        Roles: (req.user as any).Roles,
        FirstName: (req.user as any).FirstName,
        LastName: (req.user as any).LastName,
        Email: (req.user as any).Email
      };
      
      // Redirect with user data as URL params (temporary solution)
      const userDataString = encodeURIComponent(JSON.stringify(userData));
      res.redirect(`http://localhost:5173/dashboard?user=${userDataString}&auth=success`);
    } else {
      res.redirect(`http://localhost:5173/login?error=auth_failed`);
    }
  }
);

// API endpoint to get current user session
router.get('/me', (req: Request, res: Response) => {
  if (req.user) {
    res.json({ success: true, user: req.user });
  } else {
    res.status(401).json({ success: false, message: 'Not authenticated' });
  }
});

// Logout endpoint
router.post('/logout', (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

export default router;