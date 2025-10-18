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
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'SIBOL - Verify Your Email Address',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to SIBOL, ${firstName}!</h2>
        
        <p>Thank you for registering with SIBOL. To complete your registration, please verify your email address by clicking the button below:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" 
             style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #007bff;">${verificationUrl}</p>
        
        <p style="color: #666; font-size: 14px;">
          This verification link will expire in 24 hours. After email verification, your account will need admin approval before you can log in.
        </p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #999; font-size: 12px;">
          If you didn't create a SIBOL account, please ignore this email.
        </p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw new Error('Failed to send verification email');
  }
}

export async function sendWelcomeEmail(email: string, firstName: string, username: string) {
  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'SIBOL - Account Approved! Welcome aboard!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745;">🎉 Welcome to SIBOL, ${firstName}!</h2>
        
        <p>Great news! Your account has been approved by our admin team.</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3>Your Login Details:</h3>
          <p><strong>Username:</strong> ${username}</p>
          <p><strong>Password:</strong> SIBOL12345</p>
          <p style="color: #dc3545; font-size: 14px;">⚠️ Please change your password after first login</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${loginUrl}" 
             style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Login Now
          </a>
        </div>
        
        <p>Welcome to the SIBOL family!</p>
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