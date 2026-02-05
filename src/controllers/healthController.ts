import type { Request, Response } from 'express';
import config from '../config/env.js';

const REQUIRED_KEYS = [
  'OPENAI_API_KEY',
  'SENDGRID_API_KEY',
  'CLOUDINARY_API_KEY',
  'SESSION_SECRET',
];

export function healthCheck(req: Request, res: Response) {
  const missing = REQUIRED_KEYS.filter((k) => {
    // prefer config but fall back to process.env
    return !(config as any)[k] && !process.env[k];
  });

  const info = {
    status: missing.length ? 'degraded' : 'ok',
    env: config.NODE_ENV ?? process.env.NODE_ENV ?? 'unknown',
    uptime_seconds: Math.round(process.uptime()),
    missing_keys: missing, // safe: names only, no secret values
  };

  if (missing.length) {
    console.warn('[health] missing env keys:', missing);
    return res.status(503).json({ ...info, message: 'missing_api_keys' });
  }

  return res.status(200).json(info);
}