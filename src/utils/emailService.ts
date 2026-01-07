import config from '../config/env';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';

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

// Provider switches
const USE_RESEND = Boolean(config.RESEND_API_KEY);
const USE_SMTP = Boolean(config.EMAIL_SMTP_HOST && config.EMAIL_SMTP_PORT && config.EMAIL_USER && config.EMAIL_PASSWORD);

console.log(
  `📧 Outbound email: Resend API ${USE_RESEND ? '(enabled)' : '(disabled)'} | SMTP ${USE_SMTP ? '(enabled)' : '(disabled)'}`
);

// --- Resend client ---
let resendClient: Resend | null = null;
function getResendClient() {
  if (resendClient) return resendClient;
  if (!config.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
  resendClient = new Resend(config.RESEND_API_KEY);
  return resendClient;
}

function defaultFrom() {
  // Prefer RESEND_FROM; fallback to EMAIL_FROM
  const from = (config.RESEND_FROM || config.EMAIL_FROM || '').trim();
  if (!from) throw new Error('Missing sender: set RESEND_FROM or EMAIL_FROM');
  return from;
}

// --- SMTP transporter (lazy) ---
let smtpTransporter: nodemailer.Transporter | null = null;
function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  if (!USE_SMTP) throw new Error('SMTP is not configured (EMAIL_SMTP_HOST/PORT/USER/PASSWORD)');

  const port = Number(config.EMAIL_SMTP_PORT);
  smtpTransporter = nodemailer.createTransport({
    host: config.EMAIL_SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: config.EMAIL_USER,
      pass: config.EMAIL_PASSWORD,
    },
  } as any);

  return smtpTransporter;
}

async function resendSend(mailOptions: { to: string; subject: string; html: string; from?: string }) {
  const resend = getResendClient();

  const from = (mailOptions.from || defaultFrom()).trim();
  const to = (mailOptions.to || '').trim();
  if (!to) throw new Error('Missing recipient email (to)');

  const result = await resend.emails.send({
    from,
    to: [to],
    subject: mailOptions.subject,
    html: mailOptions.html,
  });

  const err = (result as any)?.error;
  if (err) throw new Error(err?.message || 'Resend send failed');

  return result;
}

async function smtpSend(mailOptions: { to: string; subject: string; html: string; from?: string }) {
  const transporter = getSmtpTransporter();

  const from = (mailOptions.from || defaultFrom()).trim();
  const to = (mailOptions.to || '').trim();
  if (!to) throw new Error('Missing recipient email (to)');

  const info = await transporter.sendMail({
    from,
    to,
    subject: mailOptions.subject,
    html: mailOptions.html,
  });

  return info;
}

async function sendEmail(mailOptions: { to: string; subject: string; html: string; from?: string }) {
  // Try Resend first if enabled; on error fallback to SMTP (if configured)
  if (USE_RESEND) {
    try {
      const result = await resendSend(mailOptions);
      return { provider: 'resend', id: (result as any)?.data?.id ?? (result as any)?.id, result };
    } catch (err: any) {
      console.warn('⚠️ Resend failed; attempting SMTP fallback:', err?.message ?? err);
      if (!USE_SMTP) throw err;
    }
  }

  const result = await smtpSend(mailOptions);
  return { provider: 'smtp', messageId: (result as any)?.messageId, result };
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
  const info = await sendEmail({ to: email, subject: 'SIBOL - Verify Your Email Address', html });
  return { success: true, info };
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
  const info = await sendEmail({ to: email, subject: 'SIBOL - Account Approved! Welcome aboard!', html });
  return { success: true, info };
}

export async function sendResetEmail(email: string, code: string) {
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
  const info = await sendEmail({ to: email, subject: 'SIBOL - Password Reset Code', html });
  return { success: true, info };
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
  const info = await sendEmail({ to: email, subject: 'SIBOL - Email Verification Code', html });
  return { success: true, info };
}