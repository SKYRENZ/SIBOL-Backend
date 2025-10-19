import dotenv from 'dotenv';
dotenv.config(); // <- move this to the very top, before other imports

import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import {pool} from "./config/db.js";
import { authenticate } from './middleware/authenticate.js';
import { isAdmin } from './middleware/isAdmin.js'; // Add this import at the top

import session from 'express-session';
import passport from './services/googleauthService';
import googleAuthRoutes from './Routes/googleauthRoutes';
// replace incorrect imports that import services as routers:
import authRoutes from "./Routes/authRoutes.js";
import machineRoutes from './Routes/machineRoutes.js';
import maintenanceRoutes from "./Routes/maintenanceRoutes.js";
import scheduleRoutes from "./Routes/scheduleRoutes.js";
import adminRoutes from './Routes/adminRoutes.js';
import rewardRoutes from "./Routes/rewardRoutes.js";
import profileRoutes from './Routes/profileRoutes.js';

// debug: do not print full secret in production — just existence / masked prefix
console.log('dotenv loaded:', !!process.env.JWT_SECRET, 'JWT_SECRET mask:', process.env.JWT_SECRET ? `${process.env.JWT_SECRET.slice(0,6)}...` : 'NOT SET');
console.log('SESSION_SECRET set:', !!process.env.SESSION_SECRET);

const SESSION_SECRET = process.env.SESSION_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;

if (!SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET is not set. Add it to backend .env or env vars.');
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Add it to backend .env or env vars.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Add session middleware before passport
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  // idle timeout: 10 minutes (set via env SESSION_IDLE_MS if needed)
  cookie: {
    secure: false, // true in prod w/ HTTPS
    maxAge: Number(process.env.SESSION_IDLE_MS || 10 * 60 * 1000) // idle expiry
  },
  rolling: true // refresh expiry on each request (idle timeout)
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// ✅ Allow your frontend
app.use(cors({
  origin: process.env.FRONT_END_PORT || 'http://localhost:5173',
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));
app.use(express.json());

// mount feature routers
app.use('/api/auth', authRoutes);
app.use('/api/machines', machineRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use('/api/auth', googleAuthRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/profile', profileRoutes);

// PROTECT admin routes with authenticate and isAdmin (single mount)
app.use('/api/admin', authenticate, isAdmin, adminRoutes);

// remove the global authenticate middleware (it was mounted after routes and may cause confusion)
// app.use(authenticate);

app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
});

export default app;