import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { validateUser } from './services/authService.js';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health route
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
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

export default app;