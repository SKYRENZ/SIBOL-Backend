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
  FRONT_END_PORT: getOptionalEnv('FRONT_END_PORT', 'https://sibolsprout.netlify.app'),

  // Comma-separated list of allowed frontend origins (for dev + prod)
  FRONT_END_ORIGINS: getOptionalEnv('FRONT_END_ORIGINS', 'http://localhost:5173,https://sibolsprout.netlify.app'),

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
  GOOGLE_CLIENT_ID: getOptionalEnv('GOOGLE_CLIENT_ID', ''),
  GOOGLE_CLIENT_SECRET: getOptionalEnv('GOOGLE_CLIENT_SECRET', ''),

  // Secrets (require in production)
  SESSION_SECRET: process.env.SESSION_SECRET || getOptionalEnv('SESSION_SECRET', 'dev-session-secret-not-for-prod'),
  JWT_SECRET: process.env.JWT_SECRET || getOptionalEnv('JWT_SECRET', 'dev-jwt-secret-not-for-prod'),
  JWT_TTL: getOptionalEnv('JWT_TTL', '8h'),
  SESSION_IDLE_MS: parseInt(getOptionalEnv('SESSION_IDLE_MS', '600000'), 10),

  // Default account password (move from code to env)
  DEFAULT_PASSWORD: getOptionalEnv('DEFAULT_PASSWORD', 'SIBOL12345'),
};

// derived helper to use in server
export const FRONTEND_ORIGINS_ARRAY = config.FRONT_END_ORIGINS.split(',').map(s => s.trim());
export default config;