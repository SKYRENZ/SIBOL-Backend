import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const getRequiredEnv = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
};
const getOptionalEnv = (key: string, defaultValue = ''): string => process.env[key] || defaultValue;

export const config = {
  NODE_ENV: getOptionalEnv('NODE_ENV', 'development'),
  PORT: parseInt(getOptionalEnv('PORT', '5000'), 10),
  BACKEND_URL: getOptionalEnv('BACKEND_URL', `http://localhost:${process.env.PORT || 5000}`),
  MOBILE_APP_PORT: getOptionalEnv('MOBILE_APP_PORT', '8081'),
  FRONT_END_PORT: getOptionalEnv('FRONT_END_PORT', 'https://sibolsprout.netlify.app'),

  // Comma-separated list of allowed frontend origins (for dev + prod)
  // include the expo/web dev origin by default
  FRONT_END_ORIGINS: getOptionalEnv(
    'FRONT_END_ORIGINS',
    `http://localhost:5173,http://localhost:8081,https://sibolsprout.netlify.app`
  ),

  // DB
  DB_HOST: getOptionalEnv('DB_HOST', ''),
  DB_PORT: parseInt(getOptionalEnv('DB_PORT', '3306'), 10),
  DB_USER: getOptionalEnv('DB_USER', ''),
  DB_PASS: getOptionalEnv('DB_PASS', ''),
  DB_NAME: getOptionalEnv('DB_NAME', ''),
  DB_SSL: getOptionalEnv('DB_SSL', 'false') === 'true',

  // Email / OAuth / Auth
  EMAIL_USER: getOptionalEnv('EMAIL_USER', ''),
  EMAIL_PASSWORD: getOptionalEnv('EMAIL_PASSWORD', ''),
  EMAIL_FROM: getOptionalEnv('EMAIL_FROM', ''),
  EMAIL_SMTP_HOST: getOptionalEnv('EMAIL_SMTP_HOST', ''),
  EMAIL_SMTP_PORT: getOptionalEnv('EMAIL_SMTP_PORT', ''),
  SENDGRID_API_KEY: getOptionalEnv('SENDGRID_API_KEY', ''),

  // ✅ Resend
  RESEND_API_KEY: getOptionalEnv('RESEND_API_KEY', ''),
  RESEND_FROM: getOptionalEnv('RESEND_FROM', ''),

  GOOGLE_CLIENT_ID: getOptionalEnv('GOOGLE_CLIENT_ID', ''),
  GOOGLE_ANDROID_CLIENT_ID: getOptionalEnv('GOOGLE_ANDROID_CLIENT_ID', ''),
  GOOGLE_CLIENT_SECRET: getOptionalEnv('GOOGLE_CLIENT_SECRET', ''),

  // Secrets (require in production)
  SESSION_SECRET: process.env.SESSION_SECRET || getOptionalEnv('SESSION_SECRET', 'dev-session-secret-not-for-prod'),
  JWT_SECRET: process.env.JWT_SECRET || getOptionalEnv('JWT_SECRET', 'dev-jwt-secret-not-for-prod'),
  JWT_TTL: getOptionalEnv('JWT_TTL', '8h'),
  SESSION_IDLE_MS: parseInt(getOptionalEnv('SESSION_IDLE_MS', '600000'), 10),

  // Default account password (move from code to env)
  DEFAULT_PASSWORD: getOptionalEnv('DEFAULT_PASSWORD', 'SIBOL12345'),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: getOptionalEnv('CLOUDINARY_CLOUD_NAME', ''),
  CLOUDINARY_API_KEY: getOptionalEnv('CLOUDINARY_API_KEY', ''),
  CLOUDINARY_API_SECRET: getOptionalEnv('CLOUDINARY_API_SECRET', ''),
};

// derived helper to use in server
export const FRONTEND_ORIGINS_ARRAY = config.FRONT_END_ORIGINS.split(',').map(s => s.trim());
export default config;