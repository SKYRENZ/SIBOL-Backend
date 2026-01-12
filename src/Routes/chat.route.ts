import express from "express"
import { chatWithAI } from "../services/chat.service"

const router = express.Router()

router.post("/", async (req, res) => {
  try {
    const roleId = req.user?.Roles // from auth middleware
    const { message } = req.body

    if (typeof roleId !== "number") {
      return res.status(400).json({ error: "Invalid or missing roleId" })
    }

    const reply = await chatWithAI(roleId, message)

    res.json({ reply })
  } catch (err) {
    res.status(403).json({
      error: "You are not allowed to access this chat"
    })
  }
})

export default router
