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
import { buildSkillPrimeMessage } from './skills';
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
  /**
   * Loads a skill by name with ACL constraint (returns full body for injection).
   *
   * `options.preferInvocable` (Phase 6): when true, prefer the newest doc
   * that's both user-invocable and model-invocable; fall back to newest
   * match. Avoids a same-name newer-disabled duplicate shadowing the
   * cataloged invocable skill the model actually targeted.
   */
  getSkillByName?: (
    name: string,
    accessibleIds: Types.ObjectId[],
    options?: { preferInvocable?: boolean },
  ) => Promise<{
    body: string;
    name: string;
    _id: Types.ObjectId;
    fileCount: number;
    /**
     * Set when the skill author opted out of model invocation. The handler
     * rejects the call and returns an instructive error so the model knows
     * it can't reach the skill via the `skill` tool — manual `$` invocation
     * is still allowed and goes through `resolveManualSkills` instead.
     */
    disableModelInvocation?: boolean;
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
  /** Loads a skill file by path (for read_file tool) */
  getSkillFileByPath?: (
    skillId: Types.ObjectId | string,
    relativePath: string,
  ) => Promise<{
    content?: string;
    isBinary?: boolean;
    mimeType: string;
    bytes: number;
    filepath: string;
    source: string;
    relativePath: string;
  } | null>;
  /** Updates cached content on a skill file (lazy caching after first read) */
  updateSkillFileContent?: (
    skillId: Types.ObjectId | string,
    relativePath: string,
    update: { content?: string; isBinary?: boolean },
  ) => Promise<void>;
}

const MAX_READABLE_BYTES = 262_144;
const MAX_BINARY_BYTES = 5 * 1024 * 1024;
const MAX_CACHE_BYTES = 512 * 1024;

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function addLineNumbers(content: string): string {
  const lines = content.split('\n');
  const w = String(lines.length).length;
  return lines.map((l, i) => `${String(i + 1).padStart(w, ' ')} | ${l}`).join('\n');
}

async function handleReadFileCall(
  tc: ToolCallRequest,
  mergedConfigurable: Record<string, unknown>,
  options: ToolExecuteOptions,
  req?: ServerRequest,
): Promise<ToolExecuteResult> {
  const { getSkillByName, getSkillFileByPath, getStrategyFunctions, updateSkillFileContent } =
    options;
  const args = tc.args as { file_path?: string };
  if (!args.file_path) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: 'file_path is required',
    };
  }

  const slashIdx = args.file_path.indexOf('/');
  if (slashIdx < 1) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `Invalid file path "${args.file_path}". Use format: {skillName}/{path}`,
    };
  }

  const skillName = args.file_path.slice(0, slashIdx);
  const relativePath = args.file_path.slice(slashIdx + 1);
  if (!relativePath) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: 'Missing file path after skill name',
    };
  }

  if (!getSkillByName) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: 'File reading is not configured',
    };
  }

  const accessibleIds = (mergedConfigurable?.accessibleSkillIds as Types.ObjectId[]) ?? [];
  /* `preferInvocable` keeps name-collision resolution consistent with the
     catalog/popover. Without it, a newer disabled or non-user-invocable
     duplicate would shadow the cataloged invocable skill — the model
     would read files from a different doc than the body it sees. Falls
     back to the newest match so the disabled-only case still resolves
     and the model-invocation gate below can fire its explicit error. */
  const skill = await getSkillByName(skillName, accessibleIds, { preferInvocable: true });
  if (!skill) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `Skill "${skillName}" not found or not accessible`,
    };
  }

  /**
   * `disable-model-invocation: true` blocks AUTONOMOUS read_file probes:
   * a model that learned a hidden skill's name (stale catalog, hallucination)
   * shouldn't be able to read its SKILL.md body or bundled files. But when
   * the user explicitly invoked the skill manually this turn, the body is
   * already primed into context — and a manually-primed skill that depends
   * on `references/foo.md` would be non-functional if read_file were
   * blocked. Bypass the gate for manually-primed skill names so manual `$`
   * invocation of disabled skills stays usable end-to-end.
   *
   * Sticky-primed skills (manually or model-invoked in prior turns) are not
   * yet in this exception list — that's a known limitation tracked for
   * a follow-up. Same-turn manual invocation is the load-bearing path.
   */
  const manualSkillNames = (mergedConfigurable?.manualSkillNames as string[] | undefined) ?? [];
  const isManuallyPrimedThisTurn = manualSkillNames.includes(skillName);
  if (skill.disableModelInvocation === true && !isManuallyPrimedThisTurn) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `Skill "${skillName}" cannot be invoked by the model`,
    };
  }

  // SKILL.md special case: read from skill.body directly
  if (relativePath === 'SKILL.md') {
    if (!skill.body) {
      return {
        toolCallId: tc.id,
        status: 'error',
        content: '',
        errorMessage: `SKILL.md is empty for skill "${skillName}"`,
      };
    }
    return {
      toolCallId: tc.id,
      status: 'success',
      content: `File: ${args.file_path}\n\n${addLineNumbers(skill.body)}`,
    };
  }

  if (!getSkillFileByPath) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: 'File reading is not configured',
    };
  }

  const file = await getSkillFileByPath(skill._id, relativePath);
  if (!file) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `File not found: "${relativePath}" in skill "${skillName}"`,
    };
  }

  // Known binary — serve images as artifacts, others as metadata
  if (file.isBinary === true) {
    if (IMAGE_MIMES.has(file.mimeType) && file.bytes <= MAX_BINARY_BYTES) {
      // Stream and return as image artifact (handled below in stream path)
    } else {
      return {
        toolCallId: tc.id,
        status: 'success',
        content: `Binary file (${file.mimeType}, ${file.bytes} bytes). Use bash to process: /mnt/data/${args.file_path}`,
      };
    }
  }

  // Cached text content
  if (file.isBinary !== true && file.content != null && file.content !== '') {
    return {
      toolCallId: tc.id,
      status: 'success',
      content: `File: ${args.file_path} (${file.bytes} bytes)\n\n${addLineNumbers(file.content)}`,
    };
  }

  // Early size check from DB metadata before streaming
  const isImage = IMAGE_MIMES.has(file.mimeType);
  if (!isImage && file.bytes > MAX_READABLE_BYTES) {
    return {
      toolCallId: tc.id,
      status: 'success',
      content: `File "${args.file_path}" is too large to read directly (${file.bytes} bytes, limit: ${MAX_READABLE_BYTES}). Invoke the skill first, then use bash to read it at /mnt/data/${args.file_path}.`,
    };
  }
  if (isImage && file.bytes > MAX_BINARY_BYTES) {
    return {
      toolCallId: tc.id,
      status: 'success',
      content: `File too large (${file.bytes} bytes, limit: ${MAX_BINARY_BYTES}). Use bash to process: /mnt/data/${args.file_path}`,
    };
  }

  // Stream from storage
  if (!getStrategyFunctions || !req) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: 'Storage access not available',
    };
  }

  try {
    const strategy = getStrategyFunctions(file.source);
    if (!strategy.getDownloadStream) {
      return {
        toolCallId: tc.id,
        status: 'error',
        content: '',
        errorMessage: 'Download not supported for this storage backend',
      };
    }

    const stream = await strategy.getDownloadStream(req, file.filepath);
    const chunks: Buffer[] = [];
    // Use the larger binary limit as streaming cap; cheaper type-specific
    // checks happen after binary detection on the assembled buffer.
    const streamLimit = MAX_BINARY_BYTES;
    let streamedBytes = 0;
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      streamedBytes += chunk.length;
      if (streamedBytes > streamLimit) {
        // Destroy the stream if possible to free resources
        if (
          'destroy' in stream &&
          typeof (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy === 'function'
        ) {
          (stream as NodeJS.ReadableStream & { destroy: () => void }).destroy();
        }
        return {
          toolCallId: tc.id,
          status: 'success',
          content: `File "${args.file_path}" exceeded streaming limit (${streamLimit} bytes). Invoke the skill first, then use bash to read it at /mnt/data/${args.file_path}.`,
        };
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Binary detection on first 8KB
    const checkLen = Math.min(buffer.length, 8192);
    let isBinary = file.isBinary === true;
    if (!isBinary) {
      for (let i = 0; i < checkLen; i++) {
        if (buffer[i] === 0) {
          isBinary = true;
          break;
        }
      }
    }

    if (isBinary) {
      // Cache the binary flag (first read only)
      if (file.isBinary == null && updateSkillFileContent) {
        updateSkillFileContent(skill._id, relativePath, { isBinary: true }).catch(
          (err: unknown) => {
            logger.warn(
              '[handleReadFileCall] cache write failed:',
              err instanceof Error ? err.message : err,
            );
          },
        );
      }

      // Return images/PDFs as artifacts
      if (IMAGE_MIMES.has(file.mimeType) && buffer.length <= MAX_BINARY_BYTES) {
        const base64 = buffer.toString('base64');
        return {
          toolCallId: tc.id,
          status: 'success',
          content: `Image: ${args.file_path} (${buffer.length} bytes, ${file.mimeType})`,
          artifact: {
            content: [
              { type: 'image_url', image_url: { url: `data:${file.mimeType};base64,${base64}` } },
            ],
          },
        };
      }

      // TODO: PDF artifact support requires a document content block path
      // (image_url runs image processing which fails for PDFs). Falls through
      // to the generic binary handler below.

      return {
        toolCallId: tc.id,
        status: 'success',
        content: `Binary file (${file.mimeType}, ${buffer.length} bytes). Use bash to process: /mnt/data/${args.file_path}`,
      };
    }

    const text = buffer.toString('utf-8');

    // Cache text on first read (skill files are immutable)
    if (file.content == null && updateSkillFileContent && buffer.length <= MAX_CACHE_BYTES) {
      updateSkillFileContent(skill._id, relativePath, { content: text, isBinary: false }).catch(
        (err: unknown) => {
          logger.warn(
            '[handleReadFileCall] cache write failed:',
            err instanceof Error ? err.message : err,
          );
        },
      );
    }

    if (buffer.length > MAX_READABLE_BYTES) {
      return {
        toolCallId: tc.id,
        status: 'success',
        content: `File too large (${buffer.length} bytes, limit: ${MAX_READABLE_BYTES}). Use bash: cat /mnt/data/${args.file_path}`,
      };
    }

    return {
      toolCallId: tc.id,
      status: 'success',
      content: `File: ${args.file_path} (${buffer.length} bytes)\n\n${addLineNumbers(text)}`,
    };
  } catch (error) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
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
  /* `preferInvocable` keeps name-collision resolution aligned with the
     catalog: the model called the cataloged invocable skill, so the
     handler resolves to the same doc. Falls back to the newest match
     so the model-invocation gate below can still fire its explicit
     error when only a disabled doc exists for the name. */
  const skill = await getSkillByName(args.skillName, accessibleIds, { preferInvocable: true });

  if (!skill) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `Skill "${args.skillName}" not found or not accessible`,
    };
  }

  /**
   * `disable-model-invocation: true` skills are excluded from the catalog
   * the model sees, but a model that learned the name elsewhere (stale
   * cache, hallucinated guess) could still try to invoke it. Reject
   * explicitly so the error message tells the model exactly why and it
   * doesn't loop retrying. Manual `$` invocation goes through
   * `resolveManualSkills`, which is unaffected by this flag.
   */
  if (skill.disableModelInvocation === true) {
    return {
      toolCallId: tc.id,
      status: 'error',
      content: '',
      errorMessage: `Skill "${args.skillName}" cannot be invoked by the model`,
    };
  }

  let body = skill.body;
  if (args.args) {
    body = body.replace(/\$ARGUMENTS/g, args.args);
  }

  const injectedMessages: InjectedMessage[] = [buildSkillPrimeMessage({ name: skill.name, body })];

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
                if (tc.name === Constants.SKILL_TOOL || tc.name === Constants.READ_FILE) {
                  const req = mergedConfigurable?.req as ServerRequest | undefined;
                  const handlerResult =
                    tc.name === Constants.SKILL_TOOL
                      ? await handleSkillToolCall(tc, mergedConfigurable, options, req)
                      : await handleReadFileCall(tc, mergedConfigurable, options, req);

                  if (toolEndCallback && handlerResult.artifact) {
                    await toolEndCallback(
                      {
                        output: {
                          name: tc.name,
                          tool_call_id: tc.id,
                          content: handlerResult.content,
                          artifact: handlerResult.artifact,
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

                  return handlerResult;
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
