import { logger } from '@librechat/data-schemas';
import { GraphEvents, Constants, CODE_EXECUTION_TOOLS } from '@librechat/agents';
import type {
  LCTool,
  EventHandler,
  LCToolRegistry,
  InjectedMessage,
  ToolCallRequest,
  ToolExecuteResult,
  ToolExecuteBatchRequest,
} from '@librechat/agents';
import type { Types } from 'mongoose';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { ServerRequest } from '~/types';
import { primeSkillFiles } from './skillFiles';
import type { SkillFileRecord } from './skillFiles';
import { runOutsideTracing } from '~/utils';

export interface ToolEndCallbackData {
  output: {
    name: string;
    tool_call_id: string;
    content: string | unknown;
    artifact?: unknown;
  };
}

export interface ToolEndCallbackMetadata {
  run_id?: string;
  thread_id?: string;
  [key: string]: unknown;
}

export type ToolEndCallback = (
  data: ToolEndCallbackData,
  metadata: ToolEndCallbackMetadata,
) => Promise<void>;

export interface ToolExecuteOptions {
  /** Loads tools by name, using agentId to look up agent-specific context */
  loadTools: (
    toolNames: string[],
    agentId?: string,
  ) => Promise<{
    loadedTools: StructuredToolInterface[];
    /** Additional configurable properties to merge (e.g., userMCPAuthMap) */
    configurable?: Record<string, unknown>;
  }>;
  /** Callback to process tool artifacts (code output files, file citations, etc.) */
  toolEndCallback?: ToolEndCallback;
  /** Loads a skill by name with ACL constraint (returns full body for injection) */
  getSkillByName?: (
    name: string,
    accessibleIds: Types.ObjectId[],
  ) => Promise<{
    body: string;
    name: string;
    _id: Types.ObjectId;
    fileCount: number;
  } | null>;
  /** Lists files bundled with a skill (for code env priming) */
  listSkillFiles?: (skillId: Types.ObjectId | string) => Promise<SkillFileRecord[]>;
  /** Storage strategy resolver for skill file streaming */
  getStrategyFunctions?: (source: string) => {
    getDownloadStream?: (req: ServerRequest, filepath: string) => Promise<NodeJS.ReadableStream>;
    [key: string]: unknown;
  };
  /** Batch uploads files to the code execution environment */
  batchUploadCodeEnvFiles?: (params: {
    req: ServerRequest;
    files: Array<{ stream: NodeJS.ReadableStream; filename: string }>;
    apiKey: string;
    entity_id?: string;
  }) => Promise<{ session_id: string; files: Array<{ fileId: string; filename: string }> }>;
  /** Checks if a code env file is still active. Returns lastModified or null. */
  getSessionInfo?: (fileIdentifier: string, apiKey: string) => Promise<string | null>;
  /** 23-hour freshness check */
  checkIfActive?: (dateString: string) => boolean;
  /** Persists codeEnvIdentifiers on skill files after upload */
  updateSkillFileCodeEnvIds?: (
    updates: Array<{
      skillId: Types.ObjectId | string;
      relativePath: string;
      codeEnvIdentifier: string;
    }>,
  ) => Promise<void>;
}

async function handleSkillToolCall(
  tc: ToolCallRequest,
  mergedConfigurable: Record<string, unknown>,
  options: ToolExecuteOptions,
  req?: ServerRequest,
): Promise<ToolExecuteResult> {
  const {
    getSkillByName,
    listSkillFiles,
    getStrategyFunctions,
    batchUploadCodeEnvFiles,
    getSessionInfo,
    checkIfActive,
    updateSkillFileCodeEnvIds,
  } = options;
  const args = tc.args as { skillName?: string; args?: string };
  if (!args.skillName) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: 'skillName is required',
    };
  }

  if (!getSkillByName) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: 'Skill execution is not configured',
    };
  }

  const accessibleIds = (mergedConfigurable?.accessibleSkillIds as Types.ObjectId[]) ?? [];
  const skill = await getSkillByName(args.skillName, accessibleIds);

  if (!skill) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `Skill "${args.skillName}" not found or not accessible`,
    };
  }

  let body = skill.body;
  if (args.args) {
    body = body.replace(/\$ARGUMENTS/g, args.args);
  }

  const injectedMessages: InjectedMessage[] = [
    { role: 'user', content: body, isMeta: true, source: 'skill', skillName: skill.name },
  ];

  const contentText = `Skill "${args.skillName}" loaded. Follow the instructions below.`;
  let artifact:
    | { session_id: string; files: Array<{ id: string; session_id: string; name: string }> }
    | undefined;

  // Prime skill files to code env when the skill has bundled files
  if (
    skill.fileCount > 0 &&
    req &&
    listSkillFiles &&
    getStrategyFunctions &&
    batchUploadCodeEnvFiles
  ) {
    const codeApiKey = (mergedConfigurable?.codeApiKey as string) ?? '';
    if (codeApiKey) {
      try {
        const skillFiles = await listSkillFiles(skill._id);
        const primeResult = await primeSkillFiles({
          skill,
          skillFiles,
          req,
          apiKey: codeApiKey,
          getStrategyFunctions,
          batchUploadCodeEnvFiles,
          getSessionInfo,
          checkIfActive,
          updateSkillFileCodeEnvIds,
        });
        if (primeResult) {
          artifact = primeResult;
        }
      } catch (error) {
        logger.error(
          `[handleSkillToolCall] Failed to prime files for skill "${args.skillName}":`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  return {
    toolCallId: tc.id,
    content: contentText,
    status: 'success',
    artifact,
    injectedMessages,
  };
}

/**
 * Creates the ON_TOOL_EXECUTE handler for event-driven tool execution.
 * This handler receives batched tool calls, loads the required tools,
 * executes them in parallel, and resolves with the results.
 */
export function createToolExecuteHandler(options: ToolExecuteOptions): EventHandler {
  const { loadTools, toolEndCallback } = options;

  return {
    handle: async (_event: string, data: ToolExecuteBatchRequest) => {
      const { toolCalls, agentId, configurable, metadata, resolve, reject } = data;

      try {
        await runOutsideTracing(async () => {
          try {
            const toolNames = [...new Set(toolCalls.map((tc: ToolCallRequest) => tc.name))];
            const { loadedTools, configurable: toolConfigurable } = await loadTools(
              toolNames,
              agentId,
            );
            const toolMap = new Map(loadedTools.map((t) => [t.name, t]));
            const mergedConfigurable = { ...configurable, ...toolConfigurable };

            const results: ToolExecuteResult[] = await Promise.all(
              toolCalls.map(async (tc: ToolCallRequest) => {
                if (tc.name === Constants.SKILL_TOOL) {
                  const req = mergedConfigurable?.req as ServerRequest | undefined;
                  return handleSkillToolCall(tc, mergedConfigurable, options, req);
                }

                const tool = toolMap.get(tc.name);

                if (!tool) {
                  logger.warn(
                    `[ON_TOOL_EXECUTE] Tool "${tc.name}" not found. Available: ${[...toolMap.keys()].map((k) => `"${k}"`).join(', ')}`,
                  );
                  return {
                    toolCallId: tc.id,
                    status: 'error' as const,
                    content: '',
                    errorMessage: `Tool ${tc.name} not found`,
                  };
                }

                try {
                  const toolCallConfig: Record<string, unknown> = {
                    id: tc.id,
                    stepId: tc.stepId,
                    turn: tc.turn,
                  };

                  if (tc.codeSessionContext && CODE_EXECUTION_TOOLS.has(tc.name)) {
                    toolCallConfig.session_id = tc.codeSessionContext.session_id;
                    if (tc.codeSessionContext.files && tc.codeSessionContext.files.length > 0) {
                      toolCallConfig._injected_files = tc.codeSessionContext.files;
                    }
                  }

                  if (tc.name === Constants.PROGRAMMATIC_TOOL_CALLING) {
                    const toolRegistry = mergedConfigurable?.toolRegistry as
                      | LCToolRegistry
                      | undefined;
                    const ptcToolMap = mergedConfigurable?.ptcToolMap as
                      | Map<string, StructuredToolInterface>
                      | undefined;
                    if (toolRegistry) {
                      const toolDefs: LCTool[] = Array.from(toolRegistry.values()).filter(
                        (t) =>
                          t.name !== Constants.PROGRAMMATIC_TOOL_CALLING &&
                          t.name !== Constants.TOOL_SEARCH,
                      );
                      toolCallConfig.toolDefs = toolDefs;
                      toolCallConfig.toolMap = ptcToolMap ?? toolMap;
                    }
                  }

                  const result = await tool.invoke(tc.args, {
                    toolCall: toolCallConfig,
                    configurable: mergedConfigurable,
                    metadata,
                  } as Record<string, unknown>);

                  if (toolEndCallback) {
                    await toolEndCallback(
                      {
                        output: {
                          name: tc.name,
                          tool_call_id: tc.id,
                          content: result.content,
                          artifact: result.artifact,
                        },
                      },
                      {
                        run_id: (metadata as Record<string, unknown>)?.run_id as string | undefined,
                        thread_id: (metadata as Record<string, unknown>)?.thread_id as
                          | string
                          | undefined,
                        ...metadata,
                      },
                    );
                  }

                  return {
                    toolCallId: tc.id,
                    content: result.content,
                    artifact: result.artifact,
                    status: 'success' as const,
                  };
                } catch (toolError) {
                  const error = toolError as Error;
                  logger.error(`[ON_TOOL_EXECUTE] Tool ${tc.name} error:`, error);
                  return {
                    toolCallId: tc.id,
                    status: 'error' as const,
                    content: '',
                    errorMessage: error.message,
                  };
                }
              }),
            );

            resolve(results);
          } catch (error) {
            logger.error('[ON_TOOL_EXECUTE] Fatal error:', error);
            reject(error as Error);
          }
        });
      } catch (outerError) {
        logger.error('[ON_TOOL_EXECUTE] Unexpected error:', outerError);
        reject(outerError as Error);
      }
    },
  };
}

/**
 * Creates a handlers object that includes ON_TOOL_EXECUTE.
 * Can be merged with other handler objects.
 */
export function createToolExecuteHandlers(
  options: ToolExecuteOptions,
): Record<string, EventHandler> {
  return {
    [GraphEvents.ON_TOOL_EXECUTE]: createToolExecuteHandler(options),
  };
}
