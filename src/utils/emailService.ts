import nodemailer from 'nodemailer';
import config from '../config/env';
import SendGrid from '@sendgrid/mail';

// normalize frontend base and remove trailing slashes
const FRONTEND_BASE = (config.FRONT_END_PORT || 'http://localhost:5173').replace(/\/+$/, '');

function buildFrontendUrl(path: string, params?: Record<string, string>) {
  try {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(cleanPath, FRONTEND_BASE);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
  } catch {
    const cleanPath = (`/${path}`).replace(/\/+/g, '/');
    const qp = params ? `?${new URLSearchParams(params).toString()}` : '';
    return `${FRONTEND_BASE}${cleanPath}${qp}`;
  }
}

const USE_SENDGRID = Boolean(config.SENDGRID_API_KEY);

if (USE_SENDGRID) {
  SendGrid.setApiKey(config.SENDGRID_API_KEY);
  console.log('📧 Using SendGrid for outbound email');
} else {
  console.log('📧 Using SMTP transporter for outbound email');
}

function defaultFrom() {
  return config.EMAIL_FROM || config.EMAIL_USER || 'no-reply@sibol.local';
}

// --- create single SMTP transporter once (if using SMTP) ---
let smtpTransporter: nodemailer.Transporter | null = null;
function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  smtpTransporter = nodemailer.createTransport({
    host: config.EMAIL_SMTP_HOST || 'smtp.gmail.com',
    port: Number(config.EMAIL_SMTP_PORT ?? 465),
    secure: Number(config.EMAIL_SMTP_PORT ?? 465) === 465,
    auth: { user: config.EMAIL_USER, pass: config.EMAIL_PASSWORD },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  } as any);
  // verify once at startup to fail early in logs (don't await in hot path)
  smtpTransporter.verify().then(() => {
    console.log('✅ SMTP transporter verified');
  }).catch(err => {
    console.error('❌ SMTP transporter verification failed:', err?.message ?? err);
  });
  return smtpTransporter;
}

async function smtpSend(mailOptions: { to: string; subject: string; html: string; from?: string }) {
  const transporter = getSmtpTransporter();
  try {
    const info = await transporter.sendMail({
      from: mailOptions.from || defaultFrom(),
      to: mailOptions.to,
      subject: mailOptions.subject,
      html: mailOptions.html,
    });
    return info; // nodemailer sendMail info object
  } catch (err: any) {
    console.error('❌ smtpSend failed:', err?.message ?? err);
    throw err;
  }
}

async function sendgridSend(mailOptions: { to: string; subject: string; html: string; from?: string }) {
  const msg = {
    to: mailOptions.to,
    from: mailOptions.from || defaultFrom(),
    subject: mailOptions.subject,
    html: mailOptions.html,
  };
  try {
    const res = await SendGrid.send(msg);
    return res; // SendGrid returns an array of responses
  } catch (err: any) {
    console.error('❌ sendgridSend failed:', err?.message ?? err);
    throw err;
  }
}

async function sendEmail(mailOptions: { to: string; subject: string; html: string; from?: string }) {
  try {
    const result = USE_SENDGRID ? await sendgridSend(mailOptions) : await smtpSend(mailOptions);
    // Normalize return shape so callers can log messageId/status consistently
    if (Array.isArray(result) && result.length > 0) {
      return { provider: 'sendgrid', statusCode: result[0].statusCode, body: result[0].body };
    }
    if (result && (result as any).messageId) {
      return { provider: 'smtp', messageId: (result as any).messageId };
    }
    return { provider: USE_SENDGRID ? 'sendgrid' : 'smtp', result };
  } catch (err: any) {
    // Re-throw with original error message preserved
    throw new Error(err?.message ?? String(err));
  }
}

// --- exported helpers use sendEmail and handle normalized result ---

export async function sendVerificationEmail(email: string, verificationToken: string, firstName: string) {
  const verificationUrl = buildFrontendUrl('/email-verification', { token: verificationToken });
  const html = `
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
  `;
  try {
    const info = await sendEmail({ to: email, subject: 'SIBOL - Verify Your Email Address', html });
    console.log('✅ Verification email sent:', info);
    return { success: true, info };
  } catch (error: any) {
    console.error('❌ Verification email failed:', error?.message ?? error);
    throw new Error(error?.message ?? 'Failed to send verification email');
  }
}

export async function sendWelcomeEmail(email: string, firstName: string, username: string, plainPassword?: string) {
  const loginUrl = `${FRONTEND_BASE}/login`;
  // Use provided plainPassword if available; otherwise don't show password in email
  const passwordSection = plainPassword
    ? `<p style="margin: 10px 0;"><strong>Password:</strong> ${plainPassword}</p>
       <p style="color: #dc3545; font-size: 14px; margin-top: 15px;">
         ⚠️ Please change your password after first login for security
       </p>`
    : `<p style="color: #6c757d; font-size: 13px; margin-top: 15px;">
         For security reasons we do not display your password. If you need help to login, please use the "Forgot Password" flow.
       </p>`;

  const html = `
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
  `;
  try {
    const info = await sendEmail({ to: email, subject: 'SIBOL - Account Approved! Welcome aboard!', html });
    console.log('✅ Welcome email sent:', info);
    return { success: true, info };
  } catch (error: any) {
    console.error('❌ Welcome email failed:', error?.message ?? error);
    throw new Error(error?.message ?? 'Failed to send welcome email');
  }
}

export async function sendResetEmail(email: string, code: string) {
  // ✅ Add link to forgot password page with email prefilled
  const resetUrl = buildFrontendUrl('/forgot-password', { email, step: 'verify' });
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 28px; text-align: center;">
      <div style="text-align: center; margin-bottom: 18px;">
        <div style="font-size: 22px; color: #0d6efd; display:inline-block; vertical-align:middle; gap:8px;">
          <span style="font-size:20px; display:inline-block; vertical-align:middle;">🔒</span>
          <strong style="letter-spacing:0.2px; display:inline-block; vertical-align:middle;">Password Reset Request</strong>
        </div>
      </div>

      <div style="border: 1px solid #c3e6cb; background: #ffffff; border-radius: 8px; padding: 20px 22px; margin-bottom: 18px; text-align: center;">
        <p style="color: #333; font-size: 14px; margin: 0 0 16px 0;">
          You requested to reset your password for your SIBOL account. Please use the code below to proceed:
        </p>

        <div style="margin: 14px 0;">
          <div style="display:inline-block; margin:0 auto; background:#f1f5f9; border-radius:8px; padding:12px 22px; font-family: monospace; font-size:28px; letter-spacing:6px; color:#0d6efd; box-shadow: inset 0 -1px 0 rgba(0,0,0,0.02);">
            ${code}
          </div>
        </div>

        <p style="color: #dc3545; font-size: 13.5px; margin: 12px 0 0 0;">
          ⚠️ This code will expire in 10 minutes and can only be used once.
        </p>
      </div>

      <!-- ✅ NEW: Add button to reset password page -->
      <div style="text-align: center; margin: 20px 0;">
        <a href="${resetUrl}" 
           style="display: inline-block; background-color: #28a745; color: white; padding: 12px 32px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
          Reset Password
        </a>
      </div>

      <p style="font-size: 12px; color: #6c757d; text-align:center; margin-top: 16px;">
        Or copy and paste this link into your browser:
      </p>
      <p style="word-break: break-all; color: #007bff; background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px;">
        ${resetUrl}
      </p>

      <p style="font-size: 12px; color: #6c757d; text-align:center; margin-top: 6px;">
        If you did not request a password reset, please ignore this email.
      </p>
    </div>
  `;
  try {
    const info = await sendEmail({ to: email, subject: 'SIBOL - Password Reset Code', html });
    console.log('✅ Password reset email queued/sent:', email, info);
    return { success: true, info };
  } catch (err: any) {
    console.error('❌ Password reset email sending failed:', err?.message ?? err);
    throw new Error(err?.message ?? 'Failed to send password reset email');
  }
}

export async function sendVerificationCodeEmail(email: string, code: string, firstName = '') {
  const displayName = firstName ? ` ${firstName}` : '';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 28px; text-align: center;">
      <div style="text-align: center; margin-bottom: 18px;">
        <div style="font-size: 22px; color: #0d6efd; display:inline-block; vertical-align:middle; gap:8px;">
          <span style="font-size:20px; display:inline-block; vertical-align:middle;">✅</span>
          <strong style="letter-spacing:0.2px; display:inline-block; vertical-align:middle;">Email Verification${displayName}</strong>
        </div>
      </div>

      <div style="border: 1px solid #e2e8f0; background: #ffffff; border-radius: 8px; padding: 20px 22px; margin-bottom: 18px; text-align: center;">
        <p style="color: #333; font-size: 14px; margin: 0 0 16px 0;">
          Use the verification code below to confirm your email address for your SIBOL account.
        </p>

        <div style="margin: 14px 0;">
          <div style="display:inline-block; margin:0 auto; background:#f1f5f9; border-radius:8px; padding:12px 22px; font-family: monospace; font-size:28px; letter-spacing:6px; color:#0d6efd; box-shadow: inset 0 -1px 0 rgba(0,0,0,0.02);">
            ${code}
          </div>
        </div>

        <p style="color: #6c757d; font-size: 13.5px; margin: 12px 0 0 0;">
          This code will expire in 10 minutes and can only be used once.
        </p>
      </div>

      <p style="font-size: 12px; color: #6c757d; text-align:center; margin-top: 6px;">
        If you did not request this verification, please ignore this email.
      </p>
    </div>
  `;
  try {
    const info = await sendEmail({ to: email, subject: 'SIBOL - Email Verification Code', html });
    console.log('✅ Verification code email queued/sent:', email, info);
    return { success: true, info };
  } catch (err: any) {
    console.error('❌ Verification code email sending failed:', err?.message ?? err);
    throw new Error(err?.message ?? 'Failed to send verification code email');
  }
}