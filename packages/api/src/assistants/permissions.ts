import { logger } from '@librechat/data-schemas';
import { ErrorTypes } from 'librechat-data-provider';
import type { Response } from 'express';
import type { FindDeniedAssistantRunToolsParams } from '~/tools/rolePermissions';
import type { CheckAccessParams } from '~/middleware/access';
import { findDeniedAssistantRunTools } from '~/tools/rolePermissions';

/** An assistant's tool list as the provider stores it. */
export type AssistantRunTools = Array<string | { type?: string } | null>;

export interface AssistantToolPermissionErrorBody {
  error: ErrorTypes.ASSISTANT_TOOL_NOT_PERMITTED;
  message: string;
  /** Typed error payload the chat client localizes; it builds the message from `text`. */
  text: string;
  deniedTools: string[];
}

export function createAssistantToolPermissionErrorBody(
  deniedTools: string[],
): AssistantToolPermissionErrorBody {
  return {
    error: ErrorTypes.ASSISTANT_TOOL_NOT_PERMITTED,
    message: `Assistant run refused: the role does not permit ${deniedTools.join(', ')}.`,
    text: JSON.stringify({ type: ErrorTypes.ASSISTANT_TOOL_NOT_PERMITTED, tools: deniedTools }),
    deniedTools,
  };
}

export interface AuthorizeAssistantRunParams {
  req?: FindDeniedAssistantRunToolsParams['req'];
  res: Pick<Response, 'status' | 'json'>;
  getRoleByName: FindDeniedAssistantRunToolsParams['getRoleByName'];
  /** The client the chat controller already initialized for this run. */
  openai: {
    beta: {
      assistants: {
        retrieve: (
          assistantId: string,
        ) => Promise<{ tools?: AssistantRunTools | null } | null | undefined>;
      };
    };
  };
  assistantId: string;
}

export interface AssistantRunAuthorization {
  /** A 403 was written; the controller must not continue. */
  refused: boolean;
  /**
   * Applies the authorized snapshot to the run request. When the role lacked a
   * grant, the run is pinned to the tools checked here, so a tool added to the
   * assistant after the check cannot execute for this run.
   */
  applyToRunBody: <T extends object>(body: T) => T & { tools?: AssistantRunTools };
}

/**
 * Authorizes an assistant run against the caller's role. Called by the chat
 * controllers after their allowlist and author checks, with the client they
 * already built: the assistant is retrieved only when the role lacks a grant,
 * and a denial is answered here with a 403 before any run side effect.
 */
export async function authorizeAssistantRun({
  req,
  res,
  getRoleByName,
  openai,
  assistantId,
}: AuthorizeAssistantRunParams): Promise<AssistantRunAuthorization> {
  let checkedTools: AssistantRunTools | undefined;
  const deniedTools = await findDeniedAssistantRunTools({
    req,
    getRoleByName,
    getTools: async () => {
      const tools = (await openai.beta.assistants.retrieve(assistantId))?.tools ?? undefined;
      checkedTools = tools ?? undefined;
      return tools;
    },
  });

  if (deniedTools.length > 0) {
    logger.warn('[assistantsRun] Refused a run whose assistant stores tools the role denies', {
      userId: (req?.user as CheckAccessParams['user'] | undefined)?.id,
      assistantId,
      deniedTools,
    });
    res.status(403).json(createAssistantToolPermissionErrorBody(deniedTools));
    return { refused: true, applyToRunBody: (body) => body };
  }

  return {
    refused: false,
    applyToRunBody: (body) => (checkedTools ? { ...body, tools: checkedTools } : body),
  };
}
