import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import {pool} from "./config/db.js";
import authRouter from "./services/authService.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT;

// ✅ Allow your frontend
app.use(cors({ origin: process.env.FRONT_END_PORT}));
app.use(express.json());

// Example route
app.get("/api/hello", (req: Request, res: Response) => {
  res.json({ message: "Hello from TypeScript backend!" });
});

// Mount the auth router
app.use('/auth', authRouter); // This makes routes available at /auth/*

app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
});