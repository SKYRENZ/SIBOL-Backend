import nodemailer from 'nodemailer';

// Create transporter (using Gmail) - Fixed: createTransport not createTransporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail address
    pass: process.env.EMAIL_PASSWORD // Your Gmail app password
  }
});

export async function sendVerificationEmail(email: string, verificationToken: string, firstName: string) {
  // Fix: Hardcode the frontend URL or provide a fallback
  const frontendUrl = process.env.FRONT_END_PORT;
  const verificationUrl = `${frontendUrl}/email-verification?token=${verificationToken}`;
  
  console.log('📧 Sending verification email to:', email);
  console.log('🔗 Verification URL:', verificationUrl);
  console.log('🌐 Frontend URL from env:', process.env.FRONT_END_PORT);
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
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
            <a href="${verificationUrl}" 
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
    console.log('✅ Email sent successfully:', info.messageId);
    console.log('📋 Email details:', {
      to: email,
      subject: mailOptions.subject,
      verificationUrl
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw new Error('Failed to send verification email');
  }
}

export async function sendWelcomeEmail(email: string, firstName: string, username: string) {
  const frontendUrl = process.env.FRONT_END_PORT;
  const loginUrl = `${frontendUrl}/login`;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
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
          <p style="margin: 10px 0;"><strong>Password:</strong> SIBOL12345</p>
          <p style="color: #dc3545; font-size: 14px; margin-top: 15px;">
            ⚠️ Please change your password after first login for security
          </p>
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
  } catch (error) {
    console.error('❌ Welcome email sending failed:', error);
    throw new Error('Failed to send welcome email');
  }
}

export async function sendResetEmail(email: string, code: string) {
  const frontendUrl = process.env.FRONT_END_PORT;
  const resetUrl = `${frontendUrl}/reset-password`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
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
  } catch (error) {
    console.error('❌ Password reset email sending failed:', error);
    throw new Error('Failed to send password reset email');
  }
}