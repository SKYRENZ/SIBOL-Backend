import { Router, Request, Response } from 'express';
import passport from '../services/googleauthService';

const router = Router();

// Initiate Google OAuth
router.get('/google', 
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth callback with custom handling
router.get('/google/callback', (req: Request, res: Response, next) => {
  passport.authenticate('google', (err: any, user: any, info: any) => {
    console.log('🔍 Passport authenticate callback:', { 
      err: err ? err.message : null, 
      user: user ? user.Email : null, 
      info 
    });
    
    if (err) {
      console.error('❌ Passport error:', err);
      return res.redirect(`http://localhost:5173/login?error=server_error`);
    }

    if (user) {
      // Successful authentication
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error('❌ Login error:', loginErr);
          return res.redirect(`http://localhost:5173/login?error=login_failed`);
        }

        console.log('✅ User logged in successfully:', user.Email);
        const userData = {
          Account_id: user.Account_id,
          Username: user.Username,
          Roles: user.Roles,
          FirstName: user.FirstName,
          LastName: user.LastName,
          Email: user.Email
        };
        
        const userDataString = encodeURIComponent(JSON.stringify(userData));
        return res.redirect(`http://localhost:5173/dashboard?user=${userDataString}&auth=success`);
      });
    } else if (info && typeof info === 'object') {
      // Authentication failed with info
      console.log('📋 Authentication info received:', info);
      const { message, email, redirectTo } = info;
      
      console.log(`🎯 Redirect case: ${redirectTo}`);
      
      switch (redirectTo) {
        case 'signup':
          const signupParams = new URLSearchParams({
            email: email || '',
            sso: 'google',
            message: 'Please complete your registration'
          });
          console.log('➡️ Redirecting to signup:', signupParams.toString());
          return res.redirect(`http://localhost:5173/signup?${signupParams.toString()}`);
          
        case 'verify-email':
          console.log('➡️ Redirecting to verify-email');
          return res.redirect(`http://localhost:5173/verify-email?email=${encodeURIComponent(email || '')}&message=Please verify your email first`);
          
        case 'pending-approval':
          console.log('➡️ Redirecting to pending-approval');
          return res.redirect(`http://localhost:5173/pending-approval?email=${encodeURIComponent(email || '')}&message=Your account is pending admin approval`);
          
        default:
          console.log('➡️ Redirecting to login with error message:', message);
          return res.redirect(`http://localhost:5173/login?error=auth_failed&message=${encodeURIComponent(message || 'Authentication failed')}`);
      }
    } else {
      // No user and no info
      console.log('❌ No user or info returned from authentication');
      return res.redirect(`http://localhost:5173/login?error=auth_failed&message=${encodeURIComponent('Google authentication failed')}`);
    }
  })(req, res, next);
});

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