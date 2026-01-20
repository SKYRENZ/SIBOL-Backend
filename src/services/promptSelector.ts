import { householdPrompt } from "../prompts/household.prompt"
import { operatorPrompt } from "../prompts/operator.prompt"

export function getPromptByRole(roleId: number): string {
  switch (roleId) {
    case 3:
      return operatorPrompt
    case 4:
      return householdPrompt
    default:
      throw new Error("Role not supported for chat")
  }
}
