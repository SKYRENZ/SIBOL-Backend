import express from "express";
import { chatWithAI } from "../services/chat.service";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const roleId = Number((req as any).user?.Roles);
    const { message } = req.body;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    if (!roleId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const reply = await chatWithAI(roleId, message);
    return res.json({ reply });
  } catch (err) {
    console.error("[chat.route] chat failed:", err);
    return res.status(500).json({ error: "Chat failed" });
  }
});

export default router;
