import { ToolCallTypes } from 'librechat-data-provider';
import type { FindDeniedAssistantRunToolsParams } from '~/tools/rolePermissions';
import { findDeniedAssistantRunTools } from '~/tools/rolePermissions';

export const ASSISTANT_TOOL_NOT_PERMITTED = 'assistant_tool_not_permitted';

const deniedToolLabels: Partial<Record<string, string>> = {
  [ToolCallTypes.CODE_INTERPRETER]: 'Code Interpreter',
  [ToolCallTypes.FILE_SEARCH]: 'File Search',
  [ToolCallTypes.RETRIEVAL]: 'File Search',
};

export interface AssistantToolPermissionErrorBody {
  error: typeof ASSISTANT_TOOL_NOT_PERMITTED;
  message: string;
  /** The chat client builds its error message from the response's `text`. */
  text: string;
  deniedTools: string[];
}

/** A run refused because the caller's role denies a native tool the assistant stores. */
export class AssistantToolPermissionError extends Error {
  public readonly code: typeof ASSISTANT_TOOL_NOT_PERMITTED = ASSISTANT_TOOL_NOT_PERMITTED;
  public readonly statusCode: number = 403;
  public readonly body: AssistantToolPermissionErrorBody;

  constructor(deniedTools: string[]) {
    const labels = [...new Set(deniedTools.map((tool) => deniedToolLabels[tool] ?? tool))];
    const message = `This assistant uses ${labels.join(' and ')}, which your role is not permitted to use.`;
    super(message);
    this.name = 'AssistantToolPermissionError';
    this.body = { error: ASSISTANT_TOOL_NOT_PERMITTED, message, text: message, deniedTools };
    Object.setPrototypeOf(this, AssistantToolPermissionError.prototype);
  }
}

export function isAssistantToolPermissionError(
  error: unknown,
): error is AssistantToolPermissionError {
  return error instanceof AssistantToolPermissionError;
}

export interface AssertAssistantRunToolsPermittedParams {
  req?: FindDeniedAssistantRunToolsParams['req'];
  getRoleByName: FindDeniedAssistantRunToolsParams['getRoleByName'];
  /** The client the chat controller already initialized for this run. */
  openai: {
    beta: {
      assistants: {
        retrieve: (
          assistantId: string,
        ) => Promise<
          { tools?: Array<string | { type?: string } | null> | null } | null | undefined
        >;
      };
    };
  };
  assistantId: string;
}

/**
 * Refuses a run whose assistant stores a native tool the caller's role denies.
 * Called by the chat controllers after their assistant allowlist and author
 * checks, with the client they already built, so the assistant is retrieved
 * only when the role actually lacks a grant.
 */
export async function assertAssistantRunToolsPermitted({
  req,
  getRoleByName,
  openai,
  assistantId,
}: AssertAssistantRunToolsPermittedParams): Promise<void> {
  const deniedTools = await findDeniedAssistantRunTools({
    req,
    getRoleByName,
    getTools: async () => (await openai.beta.assistants.retrieve(assistantId))?.tools,
  });
  if (deniedTools.length > 0) {
    throw new AssistantToolPermissionError(deniedTools);
  }
}
