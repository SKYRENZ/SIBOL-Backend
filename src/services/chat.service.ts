import OpenAI from "openai"
import { getPromptByRole } from "./promptSelector"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function chatWithAI(
  roleId: number,
  message: string
) {
  const systemPrompt = getPromptByRole(roleId)

  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ],
    temperature: roleId === 4 ? 0.3 : 0.6
  })

  return completion.choices[0]?.message?.content ?? ""
}
