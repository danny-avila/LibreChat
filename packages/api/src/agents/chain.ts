import { PromptTemplate } from '@langchain/core/prompts';
import { BaseMessage, getBufferString } from '@langchain/core/messages';
import type { GraphEdge } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import Tokenizer from '~/utils/tokenizer';

const DEFAULT_PROMPT_TEMPLATE = `Based on the following conversation and analysis from previous agents, please provide your insights:\n\n{convo}\n\nPlease add your specific expertise and perspective to this discussion.`;

/** Fallback context window when model context is unknown */
const FALLBACK_MAX_CONTEXT = 100000;
/** Fallback ratio used when per-agent overhead is not available */
const HANDOFF_BUDGET_RATIO = 0.5;
/** Average tokens per tool definition (name + description + JSON Schema params) */
const AVG_TOKENS_PER_TOOL = 500;
/** Safety margin on top of computed overhead to account for runtime framing */
const OVERHEAD_SAFETY_MARGIN = 20000;

export type AgentOverhead = {
  instructionTokens: number;
  toolCount: number;
  maxContextTokens: number;
};

export type CompactionInfo = {
  droppedCount: number;
  remaining: number;
  originalTokens: number;
  handoffBudget: number;
};

export type OnCompactionCallback = (info: CompactionInfo) => void;

/**
 * Passes all messages through, only compacting if they would exceed the handoff budget.
 * Budget is computed per-edge from the receiving agent's live overhead (instruction tokens +
 * tool count), or falls back to 50% of maxContextTokens when overhead data is unavailable.
 * When compacting, uses binary search to quickly find the right slice of recent messages.
 * @param messages - Array of messages to pass through
 * @param handoffBudget - Maximum tokens allowed for the handoff content
 * @param onCompaction - Optional callback fired when compaction occurs
 * @returns Buffer string, compacted only if it would exceed the handoff budget
 */
function compactIfNeeded(
  messages: BaseMessage[],
  handoffBudget: number,
  onCompaction?: OnCompactionCallback,
  overheadLabel?: string,
  overheadTokens?: number,
): string {
  const budget = handoffBudget > 0 ? handoffBudget : FALLBACK_MAX_CONTEXT;
  let bufferString = getBufferString(messages);
  const originalTokens = Tokenizer.getTokenCount(bufferString);
  let tokenCount = originalTokens;

  if (tokenCount <= budget) {
    logger.info(
      `[AgentChain] Passing all ${messages.length} messages (${tokenCount} tokens, budget=${budget})`,
    );
    if (overheadLabel) {
      logger.info(
        `[AgentChain] Next agent: ${overheadLabel} → projected total=${tokenCount + (overheadTokens ?? 0)}`,
      );
    }
    return bufferString;
  }

  // Over budget — use binary search to find how many recent messages fit
  logger.info(
    `[AgentChain] Context exceeded: ${tokenCount} tokens > ${budget} budget. Compacting...`,
  );
  if (overheadLabel) {
    logger.info(
      `[AgentChain] Next agent: ${overheadLabel} → would be ${tokenCount + (overheadTokens ?? 0)} total`,
    );
  }

  // Binary search: find the smallest startIndex where messages.slice(startIndex) fits
  let lo = 0;
  let hi = messages.length - 1;
  let bestStart = hi; // worst case: keep only the last message

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const slice = messages.slice(mid);
    const sliceStr = getBufferString(slice);
    const sliceTokens = Tokenizer.getTokenCount(sliceStr);

    if (sliceTokens <= budget) {
      bestStart = mid; // this slice fits; try to include more (lower startIndex)
      hi = mid - 1;
    } else {
      lo = mid + 1; // too big; need fewer messages (higher startIndex)
    }
  }

  const compactedMessages = messages.slice(bestStart);
  bufferString = getBufferString(compactedMessages);
  tokenCount = Tokenizer.getTokenCount(bufferString);

  // If still over with a single message, truncate the string keeping the end
  if (tokenCount > budget && compactedMessages.length === 1) {
    const ratio = budget / tokenCount;
    const truncateLength = Math.floor(bufferString.length * ratio * 0.9);
    bufferString = '...[truncated]...\n' + bufferString.slice(-truncateLength);
    tokenCount = Tokenizer.getTokenCount(bufferString);
  }

  const droppedCount = messages.length - compactedMessages.length;
  logger.info(
    `[AgentChain] Compacted: ${messages.length} → ${compactedMessages.length} messages, ${tokenCount} tokens (budget=${budget})`,
  );
  if (overheadLabel) {
    logger.info(
      `[AgentChain] Next agent: ${overheadLabel} → projected total=${tokenCount + (overheadTokens ?? 0)}`,
    );
  }

  if (onCompaction) {
    onCompaction({
      droppedCount,
      remaining: compactedMessages.length,
      originalTokens,
      handoffBudget: budget,
    });
  }

  const notice =
    `\n[SYSTEM NOTICE: Context window exceeded (${budget} token handoff budget). ` +
    `Compaction enabled — ${droppedCount} oldest message(s) removed to fit within the budget. ` +
    `Continuing with the ${compactedMessages.length} most recent message(s).]\n\n`;

  return notice + bufferString;
}

/**
 * Computes the handoff token budget for a receiving agent.
 * Uses live overhead data when available, falls back to a ratio of maxContextTokens.
 */
function computeHandoffBudget(
  fallbackMaxContext: number,
  receivingAgentOverhead?: AgentOverhead,
): number {
  if (receivingAgentOverhead) {
    const { instructionTokens, toolCount, maxContextTokens } = receivingAgentOverhead;
    const ctx = maxContextTokens > 0 ? maxContextTokens : fallbackMaxContext;
    const estimatedOverhead =
      instructionTokens + toolCount * AVG_TOKENS_PER_TOOL + OVERHEAD_SAFETY_MARGIN;
    const budget = ctx - estimatedOverhead;
    logger.info(
      `[AgentChain] Live overhead: instructions=${instructionTokens}, tools=${toolCount}×${AVG_TOKENS_PER_TOOL}, safety=${OVERHEAD_SAFETY_MARGIN}, total overhead=${estimatedOverhead}, budget=${budget}/${ctx}`,
    );
    return Math.max(budget, Math.floor(ctx * 0.2)); // never go below 20% of context
  }
  return Math.floor(fallbackMaxContext * HANDOFF_BUDGET_RATIO);
}

/**
 * Helper function to create sequential chain edges with buffer string prompts
 *
 * @deprecated Agent Chain helper
 * @param agentIds - Array of agent IDs in order of execution
 * @param promptTemplate - Optional prompt template string; defaults to a predefined template if not provided
 * @param maxContextTokens - Model's usable context window (after output/safety reserves)
 * @param onCompaction - Optional callback fired when context compaction occurs (for UI notifications)
 * @param agentOverheads - Optional map of agentId → overhead data for live per-edge budget computation
 * @returns Array of edges configured for sequential chain with buffer prompts
 */
export async function createSequentialChainEdges(
  agentIds: string[],
  promptTemplate = DEFAULT_PROMPT_TEMPLATE,
  maxContextTokens?: number,
  onCompaction?: OnCompactionCallback,
  agentOverheads?: Map<string, AgentOverhead>,
): Promise<GraphEdge[]> {
  const fallbackMaxContext =
    maxContextTokens && maxContextTokens > 0 ? maxContextTokens : FALLBACK_MAX_CONTEXT;
  logger.info(
    `[AgentChain] Creating chain edges: maxContext=${fallbackMaxContext}, liveOverhead=${agentOverheads ? 'yes' : 'no'}, agents=${agentIds.length}`,
  );
  const edges: GraphEdge[] = [];

  for (let i = 0; i < agentIds.length - 1; i++) {
    const fromAgent = agentIds[i];
    const toAgent = agentIds[i + 1];
    const toOverhead = agentOverheads?.get(toAgent);
    const edgeBudget = computeHandoffBudget(fallbackMaxContext, toOverhead);
    const totalOverhead = toOverhead
      ? toOverhead.instructionTokens +
        toOverhead.toolCount * AVG_TOKENS_PER_TOOL +
        OVERHEAD_SAFETY_MARGIN
      : undefined;
    const overheadLabel = toOverhead
      ? `instructions=${toOverhead.instructionTokens}, tools=${toOverhead.toolCount}, overhead=${totalOverhead}`
      : undefined;

    edges.push({
      from: fromAgent,
      to: toAgent,
      edgeType: 'direct',
      // Use a prompt function to create the buffer string from previous results
      prompt: async (messages: BaseMessage[], startIndex: number) => {
        /** Only the messages from this run (after startIndex) are passed in */
        const runMessages = messages.slice(startIndex);
        /** Pass all messages; compact only if exceeding per-edge handoff budget */
        const bufferString = compactIfNeeded(
          runMessages,
          edgeBudget,
          onCompaction,
          overheadLabel,
          totalOverhead,
        );
        const template = PromptTemplate.fromTemplate(promptTemplate);
        const result = await template.invoke({
          convo: bufferString,
        });
        return result.value;
      },
      /** Critical: exclude previous results so only the prompt is passed */
      excludeResults: true,
      description: `Sequential chain from ${fromAgent} to ${toAgent} (budget=${edgeBudget})`,
    });
  }

  return edges;
}
