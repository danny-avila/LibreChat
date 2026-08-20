import type { AgentToolOptions, AllowedCaller } from './types/assistants';

/**
 * Removes Code Interpreter as an allowed caller without mutating the input.
 * Tool entries and unrelated options are preserved; an empty entry is removed.
 */
export function removeCodeExecutionCaller(
  toolOptions: AgentToolOptions | undefined,
): AgentToolOptions | undefined {
  if (toolOptions == null) {
    return toolOptions;
  }

  const normalized: AgentToolOptions = {};
  for (const [toolName, options] of Object.entries(toolOptions)) {
    const callers = options.allowed_callers;
    if (callers?.includes('code_execution') !== true) {
      normalized[toolName] = options;
      continue;
    }

    const allowedCallers = callers.filter(
      (caller): caller is AllowedCaller => caller !== 'code_execution',
    );
    const { allowed_callers: _removed, ...remainingOptions } = options;
    const nextOptions =
      allowedCallers.length > 0
        ? { ...remainingOptions, allowed_callers: allowedCallers }
        : remainingOptions;
    if (Object.keys(nextOptions).length > 0) {
      normalized[toolName] = nextOptions;
    }
  }

  return normalized;
}
