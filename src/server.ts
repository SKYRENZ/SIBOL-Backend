import dotenv from 'dotenv';
dotenv.config();  // Must be before other imports

import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import cookieParser from 'cookie-parser'; // ✅ ADD THIS
import config, { FRONTEND_ORIGINS_ARRAY } from './config/env.js';
console.log('Server starting', { NODE_ENV: config.NODE_ENV, DB_HOST: config.DB_HOST, DB_NAME: config.DB_NAME });

import uploadRoutes from "./Routes/uploadRoutes.js";
import chatRoutes from "./Routes/chat.route.js";
import leaderboardRoutes from './Routes/leaderboardRoutes';

import {pool, testDbConnection} from "./config/db.js";
import { authenticate } from './middleware/authenticate.js';

import session from 'express-session';
import passport from './services/googleauthService';
import googleAuthRoutes from './Routes/googleauthRoutes';
import googleMobileRoutes from './Routes/googlemobileRoutes';
// replace incorrect imports that import services as routers:
import authRoutes from "./Routes/authRoutes.js";
import machineRoutes from './Routes/machineRoutes.js';
import maintenanceRoutes from "./Routes/maintenanceRoutes.js";
import scheduleRoutes from "./Routes/scheduleRoutes.js";
import adminRoutes from './Routes/adminRoutes.js';
import rewardRoutes from "./Routes/rewardRoutes.js";
import profileRoutes from './Routes/profileRoutes.js';
import moduleRoutes from './Routes/moduleRoutes.js';
import areaRoutes from "./Routes/areaRoutes";
import operatorRoutes from "./Routes/operatorRoutes";
import filtersRoutes from './Routes/filtersRoutes';
import { authorizeByModulePath } from './middleware/authorize.js';
import qrRoutes from './Routes/qrRoutes';
import conversionRoutes from './Routes/conversionRoutes';
import wasteContainerRoutes from './Routes/wasteContainerRoutes';
import wasteCollectionRoutes from './Routes/wasteCollectionRoutes';
import additivesRoutes from './Routes/additivesRoutes';
import userRoutes from "./Routes/userRoutes"; // 1. Import user routes
// I.O.T Stages imports:
import S1_esp32Routes from './Routes/S1_esp32Routes';

import wasteInputRoutes from "./Routes/wasteInputRoutes";

// Build allowlist from env (FRONT_END_ORIGINS)
const allowedOrigins = FRONTEND_ORIGINS_ARRAY;

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET','HEAD','PUT','PATCH','POST','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Accept','X-Requested-With','x-client-type'],
};

const app = express();

app.use(cors(corsOptions)); // ✅ Only this one

const PORT = config.PORT;  // Use config.PORT instead of Number(process.env.PORT) || 5000

// trust proxy so secure cookies work behind Render's proxy
app.set('trust proxy', 1);

// ✅ Add cookie-parser middleware BEFORE routes
app.use(cookieParser());

// Session middleware
app.use(session({
  secret: config.SESSION_SECRET,  // Use config.SESSION_SECRET
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.NODE_ENV === 'production', // Use config.NODE_ENV
    sameSite: 'none', // allow cross-site if frontend is different origin
  }
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Remove the app.options('*' / '/*') call (path-to-regexp rejects '*').
// Provide a simple OPTIONS responder so preflight requests are answered.
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204); // No Content -- preflight handled
  }
  next();
});

// Add this middleware BEFORE your routes
app.use((req, res, next) => {
  // Prevent caching of HTML pages
  if (req.path.endsWith('.html') || req.path === '/' || req.path.startsWith('/login') || req.path.startsWith('/signup')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use(express.json());

// mount feature routers
app.use('/api/auth', authRoutes);  // Mount auth routes first
app.use('/api/machines', machineRoutes);
// mount mobile SSO endpoint (POST /api/auth/sso-google)
app.use('/api/auth', googleMobileRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use('/api/rewards', rewardRoutes); // ✅ Now has auth internally
app.use('/api/profile', profileRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/auth', googleAuthRoutes);
app.use("/api/areas", areaRoutes);
app.use("/api/operators", operatorRoutes);
app.use('/api/filters', filtersRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/conversion', conversionRoutes);
app.use('/api/waste-containers', wasteContainerRoutes);
app.use('/api/waste-collections', wasteCollectionRoutes);
app.use("/api/users", userRoutes); // 2. Register user routes
app.use('/api/additives', additivesRoutes);
app.use("/api/waste-inputs", wasteInputRoutes);
app.use('/api/chat', authenticate, chatRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// mount admin routes with required middleware (single mount with auth+authorize)
app.use('/api/admin', authenticate, authorizeByModulePath('/admin'), adminRoutes);

app.use("/api/upload", uploadRoutes);

// mount esp32 stages
app.use('/api/s1-esp32', S1_esp32Routes)

// ❌ REMOVE THIS LINE - it's causing issues
// app.use(authenticate);  // Don't apply global auth middleware

app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
});

export default app;