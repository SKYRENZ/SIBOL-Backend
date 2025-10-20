import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import {pool} from "./config/db.js";
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

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Add session middleware before passport
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set to true in production with HTTPS
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

app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
});

export default app;