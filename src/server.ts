import dotenv from 'dotenv';
dotenv.config();  // Must be before other imports

import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import {pool, testDbConnection} from "./config/db.js";
import { authenticate } from './middleware/authenticate.js';

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
import moduleRoutes from './Routes/moduleRoutes.js';
import { authorizeByModulePath } from './middleware/authorize.js';

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// trust proxy so secure cookies work behind Render's proxy
app.set('trust proxy', 1);

// Add session middleware before passport
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true on Render (HTTPS)
    sameSite: 'none', // allow cross-site if frontend is different origin
  }
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// ✅ Allow your frontend
app.use(cors({
  origin: process.env.FRONT_END_PORT || 'https://sproutsibol.netlify.app',  // Fallback to HTTPS
  credentials: true,
}));
app.use(express.json());

// mount feature routers
app.use('/api/auth', authRoutes);
app.use('/api/machines', machineRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', googleAuthRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/modules', moduleRoutes);
// admin routes
app.use('/api/admin', authenticate, authorizeByModulePath('/admin'), adminRoutes);

// mount auth globally (optional)
app.use(authenticate);

// OR mount only for admin path
// app.use('/api/admin', authenticate, adminRoutes);

testDbConnection();
app.listen(PORT, () => {
  const backendUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;
  console.log(`✅ Backend running at ${backendUrl}`);
});

export default app;