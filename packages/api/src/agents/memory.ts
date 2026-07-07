/** Memories */
import { z } from 'zod';
import { logger } from '@librechat/data-schemas';
import { tool } from '@librechat/agents/langchain/tools';
import { Run, Providers, GraphEvents } from '@librechat/agents';
import { HumanMessage } from '@librechat/agents/langchain/messages';
import {
  Tools,
  Permissions,
  EModelEndpoint,
  PermissionTypes,
  AgentCapabilities,
} from 'librechat-data-provider';
import type {
  OpenAIClientOptions,
  StreamEventData,
  ToolEndCallback,
  LCToolRegistry,
  EventHandler,
  ToolEndData,
  LLMConfig,
  LCTool,
} from '@librechat/agents';
import type {
  IRole,
  ObjectId,
  MemoryMethods,
  IUser,
  FormattedMemoriesResult,
} from '@librechat/data-schemas';
import type { BaseMessage, ToolMessage } from '@librechat/agents/langchain/messages';
import type { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import type { TAttachment, MemoryArtifact } from 'librechat-data-provider';
import type { Response as ServerResponse } from 'express';
import type { ServerRequest, RunLLMConfig } from '~/types';
import { GenerationJobManager } from '~/stream/GenerationJobManager';
import { resolveConfigHeaders, createSafeUser } from '~/utils';
import { checkAccess } from '~/middleware/access';
import { isMemoryEnabled } from '~/memory';
import Tokenizer from '~/utils/tokenizer';

type RequiredMemoryMethods = Pick<
  MemoryMethods,
  'setMemory' | 'deleteMemory' | 'getFormattedMemories'
>;

type ToolEndMetadata = Record<string, unknown> & {
  run_id?: string;
  thread_id?: string;
};

type SanitizedMemoryLLMConfig = Omit<Partial<LLMConfig>, 'apiKey'> & { apiKey?: string };

export interface MemoryConfig {
  validKeys?: string[];
  instructions?: string;
  llmConfig?: Partial<LLMConfig>;
  tokenLimit?: number;
}

function normalizeMemoryLLMConfig(llmConfig?: Partial<LLMConfig>): SanitizedMemoryLLMConfig {
  const config = { ...(llmConfig ?? {}) } as Record<string, unknown>;
  if (typeof config.apiKey !== 'string') {
    delete config.apiKey;
  }
  return config as SanitizedMemoryLLMConfig;
}

export const memoryInstructions =
  'The system automatically stores important user information and can update or delete memories based on user requests, enabling dynamic memory management.';

export const SET_MEMORY_TOOL_NAME = 'set_memory';
export const DELETE_MEMORY_TOOL_NAME = 'delete_memory';

/** Maximum memory key length, matching the REST memory routes. */
const MEMORY_KEY_CHAR_LIMIT = 1000;

const SET_MEMORY_DESCRIPTION = 'Saves important information about the user into memory.';
const DELETE_MEMORY_DESCRIPTION =
  'Deletes specific memory data about the user using the provided key. For updating existing memories, use the `set_memory` tool instead';

const getDefaultInstructions = (
  validKeys?: string[],
  tokenLimit?: number,
) => `Use the \`set_memory\` tool to save important information about the user, but ONLY when the user has requested you to remember something.

The \`delete_memory\` tool should only be used in two scenarios:
  1. When the user explicitly asks to forget or remove specific information
  2. When updating existing memories, use the \`set_memory\` tool instead of deleting and re-adding the memory.

1. ONLY use memory tools when the user requests memory actions with phrases like:
   - "Remember [that] [I]..."
   - "Don't forget [that] [I]..."
   - "Please remember..."
   - "Store this..."
   - "Forget [that] [I]..."
   - "Delete the memory about..."

2. NEVER store information just because the user mentioned it in conversation.

3. NEVER use memory tools when the user asks you to use other tools or invoke tools in general.

4. Memory tools are ONLY for memory requests, not for general tool usage.

5. If the user doesn't ask you to remember or forget something, DO NOT use any memory tools.

${validKeys && validKeys.length > 0 ? `\nVALID KEYS: ${validKeys.join(', ')}` : ''}

${tokenLimit ? `\nTOKEN LIMIT: Maximum ${tokenLimit} tokens per memory value.` : ''}

When in doubt, and the user hasn't asked to remember or forget anything, END THE TURN IMMEDIATELY.`;

type MemoryArtifactRecord = Record<Tools.memory, MemoryArtifact>;

/**
 * Creates a memory tool instance with user context
 */
export const createMemoryTool = ({
  userId,
  setMemory,
  validKeys,
  charLimit,
  tokenLimit,
  totalTokens = 0,
  onWrite,
}: {
  userId: string | ObjectId;
  setMemory: MemoryMethods['setMemory'];
  validKeys?: string[];
  charLimit?: number;
  tokenLimit?: number;
  totalTokens?: number;
  onWrite?: () => void;
}): DynamicStructuredTool => {
  /** Running token total, advanced after each successful write. Writes are
   *  serialized through `writeChain` so multiple `set_memory` calls in one
   *  event-driven batch (executed in parallel) can't each pass the limit
   *  check against the same stale total and collectively exceed `tokenLimit`. */
  let currentTotalTokens = totalTokens;
  let writeChain: Promise<unknown> = Promise.resolve();
  /** Tokens this instance has already committed per key. `set_memory` upserts,
   *  so a repeat write to the same key REPLACES its value — the running total
   *  must swap the prior contribution for the new one, not add both. */
  const writtenTokensByKey = new Map<string, number>();

  return tool(
    async ({ key, value }) => {
      const run = async (): Promise<[string, MemoryArtifactRecord?]> => {
        try {
          if (validKeys && validKeys.length > 0 && !validKeys.includes(key)) {
            logger.warn(
              `Memory Agent failed to set memory: Invalid key "${key}". Must be one of: ${validKeys.join(
                ', ',
              )}`,
            );
            return [`Invalid key "${key}". Must be one of: ${validKeys.join(', ')}`, undefined];
          }

          /** Mirror the REST memory routes' size guards so inline writes can't
           *  persist values the normal memory UI/API would reject. */
          if (key.length > MEMORY_KEY_CHAR_LIMIT) {
            return [
              `Key exceeds maximum length of ${MEMORY_KEY_CHAR_LIMIT} characters.`,
              undefined,
            ];
          }
          if (charLimit && value.length > charLimit) {
            return [`Value exceeds maximum length of ${charLimit} characters.`, undefined];
          }

          const tokenCount = Tokenizer.getTokenCount(value, 'o200k_base');
          /** Total excluding this key's prior in-instance write, so a same-key
           *  rewrite is measured as a replacement rather than an addition. */
          const baseTotalTokens = currentTotalTokens - (writtenTokensByKey.get(key) ?? 0);
          const remainingTokens = tokenLimit ? tokenLimit - baseTotalTokens : Infinity;

          if (tokenLimit && remainingTokens <= 0) {
            const errorArtifact: MemoryArtifactRecord = {
              [Tools.memory]: {
                key: 'system',
                type: 'error',
                value: JSON.stringify({
                  errorType: 'already_exceeded',
                  tokenCount: Math.abs(remainingTokens),
                  totalTokens: baseTotalTokens,
                  tokenLimit: tokenLimit!,
                }),
                tokenCount: baseTotalTokens,
              },
            };
            return [`Memory storage exceeded. Cannot save new memories.`, errorArtifact];
          }

          const newTotalTokens = baseTotalTokens + tokenCount;

          if (tokenLimit) {
            const newRemainingTokens = tokenLimit - newTotalTokens;

            if (newRemainingTokens < 0) {
              const errorArtifact: MemoryArtifactRecord = {
                [Tools.memory]: {
                  key: 'system',
                  type: 'error',
                  value: JSON.stringify({
                    errorType: 'would_exceed',
                    tokenCount: Math.abs(newRemainingTokens),
                    totalTokens: newTotalTokens,
                    tokenLimit,
                  }),
                  tokenCount: baseTotalTokens,
                },
              };
              return [`Memory storage would exceed limit. Cannot save this memory.`, errorArtifact];
            }
          }

          const artifact: MemoryArtifactRecord = {
            [Tools.memory]: {
              key,
              value,
              tokenCount,
              type: 'update',
            },
          };

          const result = await setMemory({ userId, key, value, tokenCount });
          if (result.ok) {
            if (tokenLimit) {
              currentTotalTokens = newTotalTokens;
              writtenTokensByKey.set(key, tokenCount);
            }
            onWrite?.();
            logger.debug(`Memory set for key "${key}" (${tokenCount} tokens) for user "${userId}"`);
            return [`Memory set for key "${key}" (${tokenCount} tokens)`, artifact];
          }
          logger.warn(`Failed to set memory for key "${key}" for user "${userId}"`);
          return [`Failed to set memory for key "${key}"`, undefined];
        } catch (error) {
          logger.error('Memory Agent failed to set memory', error);
          return [`Error setting memory for key "${key}"`, undefined];
        }
      };

      const resultPromise = writeChain.then(run, run);
      /** Keep the chain alive (and non-rejecting) so the next queued call still
       *  runs even if a prior one threw; `run` already resolves on every path. */
      writeChain = resultPromise.catch(() => undefined);
      return resultPromise;
    },
    {
      name: SET_MEMORY_TOOL_NAME,
      description: SET_MEMORY_DESCRIPTION,
      responseFormat: 'content_and_artifact',
      schema: z.object({
        key: z
          .string()
          .describe(
            validKeys && validKeys.length > 0
              ? `The key of the memory value. Must be one of: ${validKeys.join(', ')}`
              : 'The key identifier for this memory',
          ),
        value: z
          .string()
          .describe(
            'Value MUST be a complete sentence that fully describes relevant user information.',
          ),
      }),
    },
  );
};

/**
 * Creates a delete memory tool instance with user context
 */
export const createDeleteMemoryTool = ({
  userId,
  deleteMemory,
  validKeys,
  onWrite,
}: {
  userId: string | ObjectId;
  deleteMemory: MemoryMethods['deleteMemory'];
  validKeys?: string[];
  onWrite?: () => void;
}): DynamicStructuredTool => {
  return tool(
    async ({ key }) => {
      try {
        if (validKeys && validKeys.length > 0 && !validKeys.includes(key)) {
          logger.warn(
            `Memory Agent failed to delete memory: Invalid key "${key}". Must be one of: ${validKeys.join(
              ', ',
            )}`,
          );
          return [`Invalid key "${key}". Must be one of: ${validKeys.join(', ')}`, undefined];
        }

        const artifact: Record<Tools.memory, MemoryArtifact> = {
          [Tools.memory]: {
            key,
            type: 'delete',
          },
        };

        const result = await deleteMemory({ userId, key });
        if (result.ok) {
          onWrite?.();
          logger.debug(`Memory deleted for key "${key}" for user "${userId}"`);
          return [`Memory deleted for key "${key}"`, artifact];
        }
        logger.warn(`Failed to delete memory for key "${key}" for user "${userId}"`);
        return [`Failed to delete memory for key "${key}"`, undefined];
      } catch (error) {
        logger.error('Memory Agent failed to delete memory', error);
        return [`Error deleting memory for key "${key}"`, undefined];
      }
    },
    {
      name: DELETE_MEMORY_TOOL_NAME,
      description: DELETE_MEMORY_DESCRIPTION,
      responseFormat: 'content_and_artifact',
      schema: z.object({
        key: z
          .string()
          .describe(
            validKeys && validKeys.length > 0
              ? `The key of the memory to delete. Must be one of: ${validKeys.join(', ')}`
              : 'The key identifier of the memory to delete',
          ),
      }),
    },
  );
};
/**
 * Strict usage guard appended to the agent's instructions when the inline
 * memory tools are registered, preserving the memory-agent's explicit-request
 * behavior so the model never stores facts it merely observed.
 */
export const memoryToolUsageGuard = `Only use the \`set_memory\` and \`delete_memory\` tools when the user explicitly asks you to remember, update, or forget something (e.g. "remember that...", "don't forget...", "forget..."). Never store information merely because the user mentioned it in conversation.`;

/**
 * LLM-facing definitions for the inline memory tool pair, used by the
 * event-driven (definitions-only) loader. The `memory` capability string on
 * an agent's `tools` array expands into this pair at initialize time via
 * {@link registerMemoryTools}; the runtime instances created in the tool
 * service enforce `validKeys`/`tokenLimit` and emit memory artifacts.
 * `validKeys` is surfaced in the key descriptions so the model is told the
 * allowed keys up front, matching the runtime `createMemoryTool` schema.
 */
export function getMemoryToolDefinitions(validKeys?: string[]): LCTool[] {
  const hasValidKeys = Array.isArray(validKeys) && validKeys.length > 0;
  return [
    {
      name: SET_MEMORY_TOOL_NAME,
      description: SET_MEMORY_DESCRIPTION,
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: hasValidKeys
              ? `The key of the memory value. Must be one of: ${validKeys!.join(', ')}`
              : 'The key identifier for this memory',
          },
          value: {
            type: 'string',
            description:
              'Value MUST be a complete sentence that fully describes relevant user information.',
          },
        },
        required: ['key', 'value'],
      },
    },
    {
      name: DELETE_MEMORY_TOOL_NAME,
      description: DELETE_MEMORY_DESCRIPTION,
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: hasValidKeys
              ? `The key of the memory to delete. Must be one of: ${validKeys!.join(', ')}`
              : 'The key identifier of the memory to delete',
          },
        },
        required: ['key'],
      },
    },
  ] as LCTool[];
}

/**
 * Idempotently registers the inline memory tool pair (`set_memory` +
 * `delete_memory`) into the run's tool registry and tool-definition list.
 * Mirrors `registerCodeExecutionTools`: the `memory` capability string stays
 * as the `agent.tools` trigger marker and expands into this pair here so the
 * definitions-only loader surfaces both tools to the LLM.
 */
export function registerMemoryTools({
  toolRegistry,
  toolDefinitions,
  validKeys,
}: {
  toolRegistry?: LCToolRegistry;
  toolDefinitions?: LCTool[];
  validKeys?: string[];
}): { toolDefinitions: LCTool[]; registered: string[] } {
  const memoryToolDefinitions = getMemoryToolDefinitions(validKeys);
  const inputDefinitions = toolDefinitions ?? [];
  const newDefs: LCTool[] = [];
  const registered: string[] = [];

  for (const def of memoryToolDefinitions) {
    const inRegistry = toolRegistry?.has(def.name) === true;
    const inDefs = inputDefinitions.some((d) => d.name === def.name);
    if (inRegistry || inDefs) {
      continue;
    }
    toolRegistry?.set(def.name, def);
    newDefs.push(def);
    registered.push(def.name);
  }

  if (newDefs.length === 0) {
    return { toolDefinitions: inputDefinitions, registered };
  }
  return { toolDefinitions: [...inputDefinitions, ...newDefs], registered };
}

type GetRoleByName = (
  roleName: string,
  fieldsToSelect?: string | string[],
) => Promise<IRole | null>;

type InlineMemoryAgent = { tools?: unknown[]; memoryToolsRegistered?: boolean } | null | undefined;

/**
 * Whether an agent carries the inline memory tools. Prefers the LibreChat-only
 * `memoryToolsRegistered` flag set by `initializeAgent`, falling back to the raw
 * `memory` capability marker on `tools`. This works for both the raw agent and
 * the initialized config that may be held in the tool-execution context, and
 * never matches an MCP tool that merely shares the `set_memory`/`delete_memory`
 * name (that name only collides at the tool level, not the capability marker).
 */
export function agentHasInlineMemoryTools(agent: InlineMemoryAgent): boolean {
  if (!agent) {
    return false;
  }
  /** An initialized config carries an explicit boolean: honor it so an agent
   *  whose registration was denied (`false`) is not treated as memory-enabled
   *  just because the raw `memory` marker survives in `tools`. Fall back to the
   *  marker only for the raw agent, where the flag is absent. */
  if (typeof agent.memoryToolsRegistered === 'boolean') {
    return agent.memoryToolsRegistered;
  }
  return (agent.tools ?? []).some(
    (entry) =>
      (typeof entry === 'string' ? entry : (entry as { name?: string })?.name) === Tools.memory,
  );
}

/**
 * Request-scoped cache so that multiple memory-enabled agents in one run (and
 * the run's memory context load) share a single `getFormattedMemories` call
 * instead of each re-fetching the same user's memories.
 */
const requestMemoriesCache = new WeakMap<object, Promise<FormattedMemoriesResult>>();

export function getRequestMemories({
  req,
  userId,
  getFormattedMemories,
}: {
  req: object;
  userId: string | ObjectId;
  getFormattedMemories: MemoryMethods['getFormattedMemories'];
}): Promise<FormattedMemoriesResult> {
  let cached = requestMemoriesCache.get(req);
  if (!cached) {
    cached = getFormattedMemories({ userId });
    requestMemoriesCache.set(req, cached);
  }
  return cached;
}

/**
 * Drops the cached memories for a request so the next {@link getRequestMemories}
 * re-fetches. Inline `set_memory`/`delete_memory` writes call this on success so
 * a later tool round in the same response is seeded with the post-write usage
 * total instead of a stale pre-write one.
 */
export function invalidateRequestMemories(req: object): void {
  requestMemoriesCache.delete(req);
}

/**
 * Re-checks the run-level memory gate at tool-execution time: the agents
 * `memory` capability is enabled, memory is configured, the user hasn't opted
 * out, and the user holds the required (write) permissions. The event-driven
 * executor loads tools by requested name, so this must be re-verified rather
 * than trusted from registration time.
 */
export async function isMemoryToolAllowed({
  req,
  writePermissions = [],
  getRoleByName,
}: {
  req: ServerRequest;
  writePermissions?: Permissions[];
  getRoleByName: GetRoleByName;
}): Promise<boolean> {
  const agentsCapabilities = req?.config?.endpoints?.[EModelEndpoint.agents]?.capabilities;
  if (
    !Array.isArray(agentsCapabilities) ||
    !agentsCapabilities.includes(AgentCapabilities.memory)
  ) {
    return false;
  }
  if (!isMemoryEnabled(req?.config?.memory)) {
    return false;
  }
  if (!req?.user || req.user.personalization?.memories === false) {
    return false;
  }
  try {
    return await checkAccess({
      user: req.user,
      permissionType: PermissionTypes.MEMORIES,
      permissions: [Permissions.USE, ...writePermissions],
      getRoleByName,
    });
  } catch (error) {
    logger.error('[memory] Memory permission check failed', error);
    return false;
  }
}

/**
 * Builds an inline memory tool instance for the event-driven executor, applying
 * the full opt-in + permission + config gate. Returns `null` when the call is
 * not permitted (e.g. a hallucinated/undeclared call, missing write permission,
 * or a disabled capability), so the executor drops the tool.
 */
export async function buildInlineMemoryTool({
  toolName,
  req,
  agent,
  userId,
  memoryMethods,
  getRoleByName,
}: {
  toolName: string;
  req: ServerRequest;
  agent: InlineMemoryAgent;
  userId: string | ObjectId;
  memoryMethods: Pick<MemoryMethods, 'setMemory' | 'deleteMemory' | 'getFormattedMemories'>;
  getRoleByName: GetRoleByName;
}): Promise<DynamicStructuredTool | null> {
  if (!agentHasInlineMemoryTools(agent)) {
    return null;
  }

  const memoryConfig = req?.config?.memory;
  const validKeys = memoryConfig?.validKeys as string[] | undefined;

  if (toolName === DELETE_MEMORY_TOOL_NAME) {
    const allowed = await isMemoryToolAllowed({
      req,
      writePermissions: [Permissions.UPDATE],
      getRoleByName,
    });
    if (!allowed) {
      return null;
    }
    return createDeleteMemoryTool({
      userId,
      deleteMemory: memoryMethods.deleteMemory,
      validKeys,
      onWrite: () => invalidateRequestMemories(req),
    });
  }

  const allowed = await isMemoryToolAllowed({
    req,
    writePermissions: [Permissions.CREATE, Permissions.UPDATE],
    getRoleByName,
  });
  if (!allowed) {
    return null;
  }

  const charLimit = memoryConfig?.charLimit as number | undefined;
  const tokenLimit = memoryConfig?.tokenLimit as number | undefined;
  let totalTokens = 0;
  if (tokenLimit) {
    try {
      const formatted = await getRequestMemories({
        req,
        userId,
        getFormattedMemories: memoryMethods.getFormattedMemories,
      });
      totalTokens = formatted?.totalTokens ?? 0;
    } catch (error) {
      logger.error('[memory] Failed to load memory token count for set_memory', error);
      /** Fail closed: without the current usage total a configured tokenLimit
       *  could be silently bypassed. */
      return null;
    }
  }

  return createMemoryTool({
    userId,
    setMemory: memoryMethods.setMemory,
    validKeys,
    charLimit,
    tokenLimit,
    totalTokens,
    onWrite: () => invalidateRequestMemories(req),
  });
}

export class BasicToolEndHandler implements EventHandler {
  private callback?: ToolEndCallback;
  constructor(callback?: ToolEndCallback) {
    this.callback = callback;
  }

  handle(
    event: string,
    data: StreamEventData | undefined,
    metadata?: Record<string, unknown>,
  ): void {
    if (!metadata) {
      console.warn(`Graph or metadata not found in ${event} event`);
      return;
    }
    const toolEndData = data as ToolEndData | undefined;
    if (!toolEndData?.output) {
      console.warn('No output found in tool_end event');
      return;
    }
    this.callback?.(toolEndData, metadata);
  }
}

export async function processMemory({
  res,
  userId,
  setMemory,
  deleteMemory,
  messages,
  memory,
  messageId,
  conversationId,
  validKeys,
  instructions,
  llmConfig,
  tokenLimit,
  totalTokens = 0,
  streamId = null,
  user,
}: {
  res: ServerResponse;
  setMemory: MemoryMethods['setMemory'];
  deleteMemory: MemoryMethods['deleteMemory'];
  userId: string | ObjectId;
  memory: string;
  messageId: string;
  conversationId: string;
  messages: BaseMessage[];
  validKeys?: string[];
  instructions: string;
  tokenLimit?: number;
  totalTokens?: number;
  llmConfig?: Partial<LLMConfig>;
  streamId?: string | null;
  user?: IUser;
}): Promise<(TAttachment | null)[] | undefined> {
  try {
    const memoryTool = createMemoryTool({
      userId,
      tokenLimit,
      setMemory,
      validKeys,
      totalTokens,
    });
    const deleteMemoryTool = createDeleteMemoryTool({
      userId,
      validKeys,
      deleteMemory,
    });

    const currentMemoryTokens = totalTokens;

    let memoryStatus = `# Existing memory:\n${memory ?? 'No existing memories'}`;

    if (tokenLimit) {
      const remainingTokens = tokenLimit - currentMemoryTokens;
      memoryStatus = `# Memory Status:
Current memory usage: ${currentMemoryTokens} tokens
Token limit: ${tokenLimit} tokens
Remaining capacity: ${remainingTokens} tokens

# Existing memory:
${memory ?? 'No existing memories'}`;
    }

    const defaultLLMConfig: LLMConfig = {
      provider: Providers.OPENAI,
      model: 'gpt-4.1-mini',
      temperature: 0.4,
      streaming: false,
      disableStreaming: true,
    };

    const finalLLMConfig = {
      ...defaultLLMConfig,
      ...normalizeMemoryLLMConfig(llmConfig),
      maxRetries: 0,
      /**
       * Ensure streaming is always disabled for memory processing
       */
      streaming: false,
      disableStreaming: true,
    } as LLMConfig;

    // Handle GPT-5+ models
    if ('model' in finalLLMConfig && /\bgpt-[5-9](?:\.\d+)?\b/i.test(finalLLMConfig.model ?? '')) {
      // Remove temperature for GPT-5+ models
      delete finalLLMConfig.temperature;

      // Move maxTokens to modelKwargs for GPT-5+ models
      if ('maxTokens' in finalLLMConfig && finalLLMConfig.maxTokens != null) {
        const modelKwargs = (finalLLMConfig as OpenAIClientOptions).modelKwargs ?? {};
        const paramName =
          (finalLLMConfig as OpenAIClientOptions).useResponsesApi === true
            ? 'max_output_tokens'
            : 'max_completion_tokens';
        modelKwargs[paramName] = finalLLMConfig.maxTokens;
        delete finalLLMConfig.maxTokens;
        (finalLLMConfig as OpenAIClientOptions).modelKwargs = modelKwargs;
      }
    }

    const bedrockConfig = finalLLMConfig as {
      additionalModelRequestFields?: { thinking?: unknown };
      temperature?: number;
    };
    if (
      llmConfig?.provider === Providers.BEDROCK &&
      bedrockConfig.additionalModelRequestFields?.thinking != null &&
      bedrockConfig.temperature != null
    ) {
      (finalLLMConfig as unknown as Record<string, unknown>).temperature = 1;
    }

    const anthropicConfig = finalLLMConfig as {
      thinking?: { type?: string };
      temperature?: number;
    };
    if (
      llmConfig?.provider === Providers.ANTHROPIC &&
      anthropicConfig.thinking?.type === 'enabled' &&
      anthropicConfig.temperature != null
    ) {
      delete (finalLLMConfig as Record<string, unknown>).temperature;
    }

    /**
     * Resolve request-based headers across provider-specific carriers (OpenAI
     * `configuration.defaultHeaders`, native Anthropic `clientOptions.defaultHeaders`)
     * so gateway-fronted built-in providers receive resolved metadata/auth headers
     * on memory extraction too. Native Google headers are resolved at init.
     */
    resolveConfigHeaders({
      llmConfig: finalLLMConfig as unknown as RunLLMConfig,
      user: user ? createSafeUser(user) : undefined,
      body: { conversationId, messageId },
    });

    const artifactPromises: Promise<TAttachment | null>[] = [];
    const memoryCallback = createMemoryCallback({ res, artifactPromises, streamId });
    const customHandlers = {
      [GraphEvents.TOOL_END]: new BasicToolEndHandler(memoryCallback),
    };

    /**
     * For Bedrock provider, include instructions in the user message instead of as a system prompt.
     * Bedrock's Converse API requires conversations to start with a user message, not a system message.
     * Other providers can use the standard system prompt approach.
     */
    const isBedrock = llmConfig?.provider === Providers.BEDROCK;

    let graphInstructions: string | undefined = instructions;
    let graphAdditionalInstructions: string | undefined = memoryStatus;
    let processedMessages = messages;

    if (isBedrock) {
      const combinedInstructions = [instructions, memoryStatus].filter(Boolean).join('\n\n');

      if (messages.length > 0) {
        const firstMessage = messages[0];
        const originalContent =
          typeof firstMessage.content === 'string' ? firstMessage.content : '';

        if (typeof firstMessage.content !== 'string') {
          logger.warn(
            'Bedrock memory processing: First message has non-string content, using empty string',
          );
        }

        const bedrockUserMessage = new HumanMessage(
          `${combinedInstructions}\n\n${originalContent}`,
        );
        processedMessages = [bedrockUserMessage, ...messages.slice(1)];
      } else {
        processedMessages = [new HumanMessage(combinedInstructions)];
      }

      graphInstructions = undefined;
      graphAdditionalInstructions = undefined;
    }

    const run = await Run.create({
      runId: messageId,
      graphConfig: {
        type: 'standard',
        llmConfig: finalLLMConfig,
        tools: [memoryTool, deleteMemoryTool],
        instructions: graphInstructions,
        additional_instructions: graphAdditionalInstructions,
        toolEnd: true,
      },
      customHandlers,
      returnContent: true,
    });

    const config = {
      runName: 'MemoryRun',
      configurable: {
        user_id: userId,
        thread_id: conversationId,
        provider: llmConfig?.provider,
      },
      streamMode: 'values',
      recursionLimit: 3,
      version: 'v2',
    } as const;

    const inputs = {
      messages: processedMessages,
    };
    const content = await run.processStream(inputs, config);
    if (content) {
      logger.debug('[MemoryAgent] Processed successfully', {
        userId,
        conversationId,
        messageId,
        provider: llmConfig?.provider,
      });
    } else {
      logger.debug('[MemoryAgent] Returned no content', { userId, conversationId, messageId });
    }
    return await Promise.all(artifactPromises);
  } catch (error) {
    logger.error(
      `[MemoryAgent] Failed to process memory | userId: ${userId} | conversationId: ${conversationId} | messageId: ${messageId}`,
      { error },
    );
  }
}

export async function createMemoryProcessor({
  res,
  userId,
  messageId,
  memoryMethods,
  conversationId,
  config = {},
  streamId = null,
  user,
}: {
  res: ServerResponse;
  messageId: string;
  conversationId: string;
  userId: string | ObjectId;
  memoryMethods: RequiredMemoryMethods;
  config?: MemoryConfig;
  streamId?: string | null;
  user?: IUser;
}): Promise<[string, (messages: BaseMessage[]) => Promise<(TAttachment | null)[] | undefined>]> {
  const { validKeys, instructions, llmConfig, tokenLimit } = config;
  const finalInstructions = instructions || getDefaultInstructions(validKeys, tokenLimit);

  const { withKeys, withoutKeys, totalTokens } = await memoryMethods.getFormattedMemories({
    userId,
  });

  return [
    withoutKeys,
    async function (messages: BaseMessage[]): Promise<(TAttachment | null)[] | undefined> {
      try {
        return await processMemory({
          res,
          userId,
          messages,
          validKeys,
          llmConfig,
          messageId,
          tokenLimit,
          streamId,
          conversationId,
          memory: withKeys,
          totalTokens: totalTokens || 0,
          instructions: finalInstructions,
          setMemory: memoryMethods.setMemory,
          deleteMemory: memoryMethods.deleteMemory,
          user,
        });
      } catch (error) {
        logger.error('Memory Agent failed to process memory', error);
      }
    },
  ];
}

async function handleMemoryArtifact({
  res,
  data,
  metadata,
  streamId = null,
}: {
  res: ServerResponse;
  data: ToolEndData;
  metadata?: ToolEndMetadata;
  streamId?: string | null;
}) {
  const output = data?.output as ToolMessage | undefined;
  if (!output) {
    return null;
  }

  if (!output.artifact) {
    return null;
  }

  const memoryArtifact = output.artifact[Tools.memory] as MemoryArtifact | undefined;
  if (!memoryArtifact) {
    return null;
  }

  const attachment: Partial<TAttachment> = {
    type: Tools.memory,
    toolCallId: output.tool_call_id,
    messageId: metadata?.run_id ?? '',
    conversationId: metadata?.thread_id ?? '',
    [Tools.memory]: memoryArtifact,
  };
  if (!res.headersSent) {
    return attachment;
  }
  if (streamId) {
    GenerationJobManager.emitChunk(streamId, { event: 'attachment', data: attachment });
  } else {
    res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
  }
  return attachment;
}

/**
 * Creates a memory callback for handling memory artifacts
 * @param params - The parameters object
 * @param params.res - The server response object
 * @param params.artifactPromises - Array to collect artifact promises
 * @param params.streamId - The stream ID for resumable mode, or null for standard mode
 * @returns The memory callback function
 */
export function createMemoryCallback({
  res,
  artifactPromises,
  streamId = null,
}: {
  res: ServerResponse;
  artifactPromises: Promise<Partial<TAttachment> | null>[];
  streamId?: string | null;
}): ToolEndCallback {
  return async (data: ToolEndData, metadata?: Record<string, unknown>) => {
    const output = data?.output as ToolMessage | undefined;
    const memoryArtifact = output?.artifact?.[Tools.memory] as MemoryArtifact;
    if (memoryArtifact == null) {
      return;
    }
    artifactPromises.push(
      handleMemoryArtifact({ res, data, metadata, streamId }).catch((error) => {
        logger.error('Error processing memory artifact content:', error);
        return null;
      }),
    );
  };
}
