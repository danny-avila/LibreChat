/** Memories */
import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { Tools } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import { Run, Providers, GraphEvents } from '@librechat/agents';
import type {
  StreamEventData,
  ToolEndCallback,
  EventHandler,
  ToolEndData,
  LLMConfig,
} from '@librechat/agents';
import type { TAttachment, MemoryArtifact } from 'librechat-data-provider';
import type { ObjectId, MemoryMethods } from '@librechat/data-schemas';
import type { BaseMessage } from '@langchain/core/messages';
import type { Response as ServerResponse } from 'express';
import { Tokenizer } from '~/utils';

type RequiredMemoryMethods = Pick<
  MemoryMethods,
  'setMemory' | 'deleteMemory' | 'getFormattedMemories'
>;

type ToolEndMetadata = Record<string, unknown> & {
  run_id?: string;
  thread_id?: string;
};

export interface MemoryConfig {
  validKeys?: string[];
  instructions?: string;
  llmConfig?: Partial<LLMConfig>;
  tokenLimit?: number;
}

export const memoryInstructions =
  'The system automatically stores important user information and can update or delete memories based on user requests, enabling dynamic memory management.';

const getDefaultInstructions = (
  validKeys?: string[],
  tokenLimit?: number,
) => `Use the \`set_memory\` tool to save important information about the user, but ONLY when the user has explicitly provided this information. If there is nothing to note about the user specifically, END THE TURN IMMEDIATELY.

  The \`delete_memory\` tool should only be used in two scenarios:
  1. When the user explicitly asks to forget or remove specific information
  2. When updating existing memories, use the \`set_memory\` tool instead of deleting and re-adding the memory.
  
  ${
    validKeys && validKeys.length > 0
      ? `CRITICAL INSTRUCTION: Only the following keys are valid for storing memories:
  ${validKeys.map((key) => `- ${key}`).join('\n  ')}`
      : 'You can use any appropriate key to store memories about the user.'
  }

  ${
    tokenLimit
      ? `⚠️ TOKEN LIMIT: Each memory value must not exceed ${tokenLimit} tokens. Be concise and store only essential information.`
      : ''
  }

  ⚠️ WARNING ⚠️
  DO NOT STORE ANY INFORMATION UNLESS THE USER HAS EXPLICITLY PROVIDED IT.
  ONLY store information the user has EXPLICITLY shared.
  NEVER guess or assume user information.
  ALL memory values must be factual statements about THIS specific user.
  If nothing needs to be stored, DO NOT CALL any memory tools.
  If you're unsure whether to store something, DO NOT store it.
  If nothing needs to be stored, END THE TURN IMMEDIATELY.`;

/**
 * Creates a memory tool instance with user context
 */
const createMemoryTool = ({
  userId,
  setMemory,
  validKeys,
  tokenLimit,
  totalTokens = 0,
}: {
  userId: string | ObjectId;
  setMemory: MemoryMethods['setMemory'];
  validKeys?: string[];
  tokenLimit?: number;
  totalTokens?: number;
}) => {
  return tool(
    async ({ key, value }) => {
      try {
        if (validKeys && validKeys.length > 0 && !validKeys.includes(key)) {
          logger.warn(
            `Memory Agent failed to set memory: Invalid key "${key}". Must be one of: ${validKeys.join(
              ', ',
            )}`,
          );
          return `Invalid key "${key}". Must be one of: ${validKeys.join(', ')}`;
        }

        const tokenCount = Tokenizer.getTokenCount(value, 'o200k_base');

        if (tokenLimit && tokenCount > tokenLimit) {
          logger.warn(
            `Memory Agent failed to set memory: Value exceeds token limit. Value has ${tokenCount} tokens, but limit is ${tokenLimit}`,
          );
          return `Memory value too large: ${tokenCount} tokens exceeds limit of ${tokenLimit}`;
        }

        if (tokenLimit && totalTokens + tokenCount > tokenLimit) {
          const remainingCapacity = tokenLimit - totalTokens;
          logger.warn(
            `Memory Agent failed to set memory: Would exceed total token limit. Current usage: ${totalTokens}, new memory: ${tokenCount} tokens, limit: ${tokenLimit}`,
          );
          return `Cannot add memory: would exceed token limit. Current usage: ${totalTokens}/${tokenLimit} tokens. This memory requires ${tokenCount} tokens, but only ${remainingCapacity} tokens available.`;
        }

        const artifact: Record<Tools.memory, MemoryArtifact> = {
          [Tools.memory]: {
            key,
            value,
            tokenCount,
            type: 'update',
          },
        };

        const result = await setMemory({ userId, key, value, tokenCount });
        if (result.ok) {
          logger.debug(`Memory set for key "${key}" (${tokenCount} tokens) for user "${userId}"`);
          return [`Memory set for key "${key}" (${tokenCount} tokens)`, artifact];
        }
        logger.warn(`Failed to set memory for key "${key}" for user "${userId}"`);
        return [`Failed to set memory for key "${key}"`, undefined];
      } catch (error) {
        logger.error('Memory Agent failed to set memory', error);
        return [`Error setting memory for key "${key}"`, undefined];
      }
    },
    {
      name: 'set_memory',
      description: 'Saves important information about the user into memory.',
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
const createDeleteMemoryTool = ({
  userId,
  deleteMemory,
  validKeys,
}: {
  userId: string | ObjectId;
  deleteMemory: MemoryMethods['deleteMemory'];
  validKeys?: string[];
}) => {
  return tool(
    async ({ key }) => {
      try {
        if (validKeys && validKeys.length > 0 && !validKeys.includes(key)) {
          logger.warn(
            `Memory Agent failed to delete memory: Invalid key "${key}". Must be one of: ${validKeys.join(
              ', ',
            )}`,
          );
          return `Invalid key "${key}". Must be one of: ${validKeys.join(', ')}`;
        }

        const artifact: Record<Tools.memory, MemoryArtifact> = {
          [Tools.memory]: {
            key,
            type: 'delete',
          },
        };

        const result = await deleteMemory({ userId, key });
        if (result.ok) {
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
      name: 'delete_memory',
      description:
        'Deletes specific memory data about the user using the provided key. For updating existing memories, use the `set_memory` tool instead',
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
}): Promise<(TAttachment | null)[] | undefined> {
  try {
    const memoryTool = createMemoryTool({ userId, tokenLimit, setMemory, validKeys, totalTokens });
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
      ...llmConfig,
      /**
       * Ensure streaming is always disabled for memory processing
       */
      streaming: false,
      disableStreaming: true,
    };

    const artifactPromises: Promise<TAttachment | null>[] = [];
    const memoryCallback = createMemoryCallback({ res, artifactPromises });
    const customHandlers = {
      [GraphEvents.TOOL_END]: new BasicToolEndHandler(memoryCallback),
    };

    const run = await Run.create({
      runId: messageId,
      graphConfig: {
        type: 'standard',
        llmConfig: finalLLMConfig,
        tools: [memoryTool, deleteMemoryTool],
        instructions,
        additional_instructions: memoryStatus,
        toolEnd: true,
      },
      customHandlers,
      returnContent: true,
    });

    const config = {
      configurable: {
        provider: llmConfig?.provider,
        thread_id: `memory-run-${conversationId}`,
      },
      streamMode: 'values',
      version: 'v2',
    } as const;

    const inputs = {
      messages,
    };
    const content = await run.processStream(inputs, config);
    if (content) {
      logger.debug('Memory Agent processed memory successfully', content);
    } else {
      logger.warn('Memory Agent processed memory but returned no content');
    }
    return await Promise.all(artifactPromises);
  } catch (error) {
    logger.error('Memory Agent failed to process memory', error);
  }
}

export async function createMemoryProcessor({
  res,
  userId,
  messageId,
  memoryMethods,
  conversationId,
  config = {},
}: {
  res: ServerResponse;
  messageId: string;
  conversationId: string;
  userId: string | ObjectId;
  memoryMethods: RequiredMemoryMethods;
  config?: MemoryConfig;
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
          conversationId,
          memory: withKeys,
          totalTokens: totalTokens || 0,
          instructions: finalInstructions,
          setMemory: memoryMethods.setMemory,
          deleteMemory: memoryMethods.deleteMemory,
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
}: {
  res: ServerResponse;
  data: ToolEndData;
  metadata?: ToolEndMetadata;
}) {
  const output = data?.output;
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
  res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
  return attachment;
}

/**
 * Creates a memory callback for handling memory artifacts
 * @param params - The parameters object
 * @param params.res - The server response object
 * @param params.artifactPromises - Array to collect artifact promises
 * @returns The memory callback function
 */
export function createMemoryCallback({
  res,
  artifactPromises,
}: {
  res: ServerResponse;
  artifactPromises: Promise<Partial<TAttachment> | null>[];
}): ToolEndCallback {
  return async (data: ToolEndData, metadata?: Record<string, unknown>) => {
    const output = data?.output;
    const memoryArtifact = output?.artifact?.[Tools.memory] as MemoryArtifact;
    if (memoryArtifact == null) {
      return;
    }
    artifactPromises.push(
      handleMemoryArtifact({ res, data, metadata }).catch((error) => {
        logger.error('Error processing memory artifact content:', error);
        return null;
      }),
    );
  };
}
