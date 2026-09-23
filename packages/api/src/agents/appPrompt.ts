import { resolveResponseAppInstructions } from './generatedResponsePrompts';

export interface AgentPromptTarget {
  instructions?: string;
  additional_instructions?: string;
}

/** Apply the repository-owned app prompt and retain per-run context separately. */
export function applyResponseAppPrompt<T extends AgentPromptTarget>(
  agent: T,
  appId: string | number | undefined,
  requestInstructions?: string,
): T {
  const result = { ...agent };
  const appInstructions = resolveResponseAppInstructions(appId);
  const requestText = requestInstructions?.trim() ?? '';
  const taskInstructions =
    appInstructions &&
    (requestText === appInstructions || requestText.startsWith(`${appInstructions}\n\n`))
      ? requestText.slice(appInstructions.length).replace(/^\s+/, '')
      : requestText;

  if (appInstructions) {
    result.instructions = resolveResponseAppInstructions(appId, result.instructions);
  }
  if (taskInstructions) {
    result.additional_instructions = [result.additional_instructions, taskInstructions]
      .filter(Boolean)
      .join('\n\n');
  }
  return result;
}
