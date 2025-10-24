import nodemailer from 'nodemailer';
import config from '../config/env.js';

// normalize frontend base and remove trailing slashes
// use the existing config key (FRONT_END_PORT) — do not reference FRONT_END_URL
const FRONTEND_BASE = (config.FRONT_END_PORT || 'http://localhost:5173').replace(/\/+$/, '');

function buildFrontendUrl(path: string, params?: Record<string, string>) {
  try {
    // try using URL to produce a correct absolute URL
    const url = new URL(path, FRONTEND_BASE);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    return url.toString();
  } catch {
    // fallback join without duplicate slashes
    const cleanPath = (`/${path}`).replace(/\/+/g, '/').replace(/^\/+/, '/');
    const qp = params ? `?${new URLSearchParams(params).toString()}` : '';
    return `${FRONTEND_BASE}${cleanPath}${qp}`;
  }
}

// Use explicit SMTP settings (works reliably with Gmail app passwords)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // true for 465, false for 587
  auth: {
    user: config.EMAIL_USER,
    pass: config.EMAIL_PASSWORD,
  },
  tls: {
    // Allow self-signed certs if your host uses them (optional)
    rejectUnauthorized: false,
  },
  // pool: true, // uncomment if sending many emails
});

// Verify transporter at startup so failures show in logs
transporter.verify()
  .then(() => console.log('✅ SMTP transporter verified'))
  .catch(err => console.error('❌ SMTP transporter verification failed:', err));

// Single exported sendVerificationEmail implementation
export async function sendVerificationEmail(email: string, verificationToken: string, firstName: string) {
  const verificationUrl = buildFrontendUrl('/email-verification', { token: verificationToken });

  console.log('📧 Sending verification email to:', email);
  console.log('🔗 Verification URL:', verificationUrl);
  // log the normalized frontend base (was using undefined `frontendUrl`)
  console.log('🌐 Frontend URL from config:', FRONTEND_BASE);
  
  const mailOptions = {
    from: config.EMAIL_USER,
    to: email,
    subject: 'SIBOL - Verify Your Email Address',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin-bottom: 10px;">Welcome to SIBOL, ${firstName}!</h1>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px; margin-bottom: 30px;">
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Thank you for registering with SIBOL. To complete your registration, please verify your email address by clicking the button below:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" target="_blank" rel="noopener noreferrer"
               style="background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
              Verify Email Address
            </a>
          </div>
          
          <p style="font-size: 14px; color: #666; margin-top: 20px;">
            Or copy and paste this link into your browser:
          </p>
          <p style="word-break: break-all; color: #007bff; background-color: #fff; padding: 10px; border-radius: 4px; font-family: monospace;">
            ${verificationUrl}
          </p>
        </div>
        
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
          <p style="color: #856404; font-size: 14px; margin: 0;">
            ⏰ This verification link will expire in 24 hours. After email verification, your account will need admin approval before you can log in.
          </p>
        </div>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          If you didn't create a SIBOL account, please ignore this email.
        </p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Verification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('❌ Verification email failed:', error);
    throw new Error(error?.message ? `Failed to send verification email: ${error.message}` : 'Failed to send verification email');
  }
}

// Single exported sendWelcomeEmail implementation
export async function sendWelcomeEmail(email: string, firstName: string, username: string, plainPassword?: string) {
  const frontendUrl = config.FRONT_END_PORT;
  const loginUrl = `${frontendUrl}/login`;
  // Use provided plainPassword if available; otherwise don't show password in email
  const passwordSection = plainPassword
    ? `<p style="margin: 10px 0;"><strong>Password:</strong> ${plainPassword}</p>
       <p style="color: #dc3545; font-size: 14px; margin-top: 15px;">
         ⚠️ Please change your password after first login for security
       </p>`
    : `<p style="color: #6c757d; font-size: 13px; margin-top: 15px;">
         For security reasons we do not display your password. If you need help to login, please use the "Forgot Password" flow.
       </p>`;

  const mailOptions = {
    from: config.EMAIL_USER,
    to: email,
    subject: 'SIBOL - Account Approved! Welcome aboard!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #28a745; text-align: center;">🎉 Welcome to SIBOL, ${firstName}!</h2>
        
        <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p style="color: #155724; margin-bottom: 15px;">Great news! Your account has been approved by our admin team.</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #333; margin-bottom: 15px;">Your Login Details:</h3>
          <p style="margin: 10px 0;"><strong>Username:</strong> ${username}</p>
          ${passwordSection}
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${loginUrl}" 
             style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Login to Your Account
          </a>
        </div>
        
        <p style="text-align: center; color: #333;">Welcome to the SIBOL family!</p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Welcome email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('❌ Welcome email failed:', error);
    throw new Error(error?.message ? `Failed to send welcome email: ${error.message}` : 'Failed to send welcome email');
  }
}

// Single exported sendResetEmail implementation
export async function sendResetEmail(email: string, code: string) {
  const frontendUrl = config.FRONT_END_PORT;
  const resetUrl = `${frontendUrl}/reset-password`;

  const mailOptions = {
    from: config.EMAIL_USER,
    to: email,
    subject: 'SIBOL - Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #007bff; text-align: center;">🔒 Password Reset Request</h2>
        
        <div style="background-color: #f8f9fa; border: 1px solid #c3e6cb; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <p style="color: #333; margin-bottom: 15px;">
            You requested to reset your password for your SIBOL account. Please use the code below to proceed:
          </p>
          <div style="text-align: center; margin: 20px 0;">
            <span style="font-size: 2em; font-weight: bold; color: #007bff; letter-spacing: 4px; background: #e9ecef; padding: 10px 30px; border-radius: 8px;">
              ${code}
            </span>
          </div>
          <p style="color: #dc3545; font-size: 14px; margin-top: 15px;">
            ⚠️ This code will expire in 10 minutes and can only be used once.
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Reset Your Password
          </a>
        </div>
        
        <p style="color: #999; font-size: 12px; text-align: center;">
          If you did not request a password reset, please ignore this email.
        </p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('❌ Password reset email failed:', error);
    throw new Error(error?.message ? `Failed to send password reset email: ${error.message}` : 'Failed to send password reset email');
  }
}