import { operatorPrompt } from "../prompts/operator.prompt";
import { householdPrompt } from "../prompts/household.prompt";
import { webPrompt } from "../prompts/web.prompt";

export function getPromptByRole(roleId: number): string {
  switch (roleId) {
    // WEB USERS
    case 1:
    case 2:
      return webPrompt;

    // MOBILE USERS
    case 3:
      return operatorPrompt;
    case 4:
      return householdPrompt;

    default:
      throw new Error(`Role not supported for chat: ${roleId}`);
  }
}
