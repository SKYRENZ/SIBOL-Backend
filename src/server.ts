import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";

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

app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
});
