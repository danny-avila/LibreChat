export interface AgentPromptTarget {
  instructions?: string;
  additional_instructions?: string;
}

/** Apply the repository-owned app prompt and retain per-run context separately. */
export function applyResponseAppPrompt<T extends AgentPromptTarget>(
  agent: T,
  appInstructions: string,
  requestInstructions?: string,
): T {
  const result = { ...agent };
  const requestText = requestInstructions?.trim() ?? '';
  const taskInstructions =
    appInstructions &&
    (requestText === appInstructions || requestText.startsWith(`${appInstructions}\n\n`))
      ? requestText.slice(appInstructions.length).replace(/^\s+/, '')
      : requestText;

  if (appInstructions) {
    result.instructions = appInstructions;
    result.additional_instructions = [
      result.additional_instructions,
      agent.instructions === appInstructions ? '' : agent.instructions,
      taskInstructions,
    ]
      .filter(Boolean)
      .join('\n\n');
  } else if (taskInstructions) {
    result.additional_instructions = [result.additional_instructions, taskInstructions]
      .filter(Boolean)
      .join('\n\n');
  }
  return result;
}
