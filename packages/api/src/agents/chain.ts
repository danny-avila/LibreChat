import { PromptTemplate } from '@langchain/core/prompts';
import { BaseMessage, getBufferString } from '@langchain/core/messages';
import type { GraphEdge } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import Tokenizer from '~/utils/tokenizer';

const DEFAULT_PROMPT_TEMPLATE = `Based on the following conversation and analysis from previous agents, please provide your insights:\n\n{convo}\n\nPlease add your specific expertise and perspective to this discussion.`;

/** Fallback context window when model context is unknown */
const FALLBACK_MAX_CONTEXT = 100000;

export type CompactionInfo = {
  droppedCount: number;
  remaining: number;
  originalTokens: number;
  contextLimit: number;
};

export type OnCompactionCallback = (info: CompactionInfo) => void;

/**
 * Passes all messages through, only compacting if they would exceed the context window.
 * When compacting, removes oldest messages first to keep the most recent context.
 * @param messages - Array of messages to pass through
 * @param maxContextTokens - Model's usable context window (after output/safety reserves)
 * @param onCompaction - Optional callback fired when compaction occurs
 * @returns Buffer string, compacted only if it would exceed the context window
 */
function compactIfNeeded(
  messages: BaseMessage[],
  maxContextTokens: number,
  onCompaction?: OnCompactionCallback,
): string {
  const contextLimit = maxContextTokens > 0 ? maxContextTokens : FALLBACK_MAX_CONTEXT;
  let bufferString = getBufferString(messages);
  const originalTokens = Tokenizer.getTokenCount(bufferString);
  let tokenCount = originalTokens;

  if (tokenCount <= contextLimit) {
    logger.info(
      `[AgentChain] Passing all ${messages.length} messages (${tokenCount} tokens, limit=${contextLimit})`,
    );
    return bufferString;
  }

  // Over the context window — remove oldest messages until within limit
  logger.info(
    `[AgentChain] Context exceeded: ${tokenCount} tokens > ${contextLimit} limit. Compacting...`,
  );
  let compactedMessages = [...messages];
  while (tokenCount > contextLimit && compactedMessages.length > 1) {
    compactedMessages = compactedMessages.slice(1);
    bufferString = getBufferString(compactedMessages);
    tokenCount = Tokenizer.getTokenCount(bufferString);
  }

  // If still over with a single message, truncate the string keeping the end
  if (tokenCount > contextLimit && compactedMessages.length === 1) {
    const ratio = contextLimit / tokenCount;
    const truncateLength = Math.floor(bufferString.length * ratio * 0.9);
    bufferString = '...[truncated]...\n' + bufferString.slice(-truncateLength);
  }

  const droppedCount = messages.length - compactedMessages.length;
  logger.info(
    `[AgentChain] Compacted: ${messages.length} → ${compactedMessages.length} messages, ${tokenCount} tokens`,
  );

  if (onCompaction) {
    onCompaction({
      droppedCount,
      remaining: compactedMessages.length,
      originalTokens,
      contextLimit,
    });
  }

  const notice =
    `\n[SYSTEM NOTICE: Context window exceeded (${contextLimit} token limit). ` +
    `Compaction enabled — ${droppedCount} oldest message(s) removed to fit within the window. ` +
    `Continuing with the ${compactedMessages.length} most recent message(s).]\n\n`;

  return notice + bufferString;
}

/**
 * Helper function to create sequential chain edges with buffer string prompts
 *
 * @deprecated Agent Chain helper
 * @param agentIds - Array of agent IDs in order of execution
 * @param promptTemplate - Optional prompt template string; defaults to a predefined template if not provided
 * @param maxContextTokens - Model's usable context window (after output/safety reserves)
 * @param onCompaction - Optional callback fired when context compaction occurs (for UI notifications)
 * @returns Array of edges configured for sequential chain with buffer prompts
 */
export async function createSequentialChainEdges(
  agentIds: string[],
  promptTemplate = DEFAULT_PROMPT_TEMPLATE,
  maxContextTokens?: number,
  onCompaction?: OnCompactionCallback,
): Promise<GraphEdge[]> {
  const contextLimit =
    maxContextTokens && maxContextTokens > 0 ? maxContextTokens : FALLBACK_MAX_CONTEXT;
  logger.info(
    `[AgentChain] Creating chain edges: maxContext=${contextLimit}, agents=${agentIds.length}`,
  );
  const edges: GraphEdge[] = [];

  for (let i = 0; i < agentIds.length - 1; i++) {
    const fromAgent = agentIds[i];
    const toAgent = agentIds[i + 1];

    edges.push({
      from: fromAgent,
      to: toAgent,
      edgeType: 'direct',
      // Use a prompt function to create the buffer string from previous results
      prompt: async (messages: BaseMessage[], startIndex: number) => {
        /** Only the messages from this run (after startIndex) are passed in */
        const runMessages = messages.slice(startIndex);
        /** Pass all messages; compact only if exceeding context window */
        const bufferString = compactIfNeeded(runMessages, contextLimit, onCompaction);
        const template = PromptTemplate.fromTemplate(promptTemplate);
        const result = await template.invoke({
          convo: bufferString,
        });
        return result.value;
      },
      /** Critical: exclude previous results so only the prompt is passed */
      excludeResults: true,
      description: `Sequential chain from ${fromAgent} to ${toAgent}`,
    });
  }

  return edges;
}
