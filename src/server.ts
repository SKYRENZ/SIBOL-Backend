import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import {pool} from "./config/db.js";
import authRouter from "./services/authService.js";

import { validateUser } from "./services/authService.js"; // Import your login function


// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Allow your frontend
app.use(cors({ origin: process.env.FRONT_END_PORT }));
app.use(express.json());

// Example route
app.get("/api/hello", (req: Request, res: Response) => {
  res.json({ message: "Hello from TypeScript backend!" });
});

// Login route
app.post("/api/login", async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Username and password required" });
  }
  try {
    const user = await validateUser(username, password);
    if (user) {
      return res.json({ success: true, user });
    }
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
});

export default app;