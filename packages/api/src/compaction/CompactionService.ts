import type { TCompactionConfig } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import type { BaseMessage } from '@langchain/core/messages';

/**
 * Models that support context compaction via OpenAI's Responses API
 */
const COMPACTION_SUPPORTED_MODELS = ['gpt-5.2'];

/**
 * Default compaction configuration
 */
const DEFAULT_CONFIG: Required<TCompactionConfig> = {
  enabled: false,
  thresholdPercent: 0.85,
  minTokensBeforeCompaction: 10000,
  preserveInstructions: true,
  compactionPrompt: undefined,
};

/**
 * Model context window sizes (in tokens)
 */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-5.2': 400000,
  'gpt-5.2-pro': 400000,
  'gpt-5.2-codex': 400000,
};

/**
 * Check if a model supports compaction
 */
export function supportsCompaction(model: string): boolean {
  if (!model) return false;
  const lowerModel = model.toLowerCase();
  return COMPACTION_SUPPORTED_MODELS.some((m) => lowerModel.includes(m));
}

/**
 * Get the context window size for a model
 */
function getContextWindow(model: string): number {
  const lowerModel = model.toLowerCase();
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (lowerModel.includes(key)) {
      return value;
    }
  }
  return 400000; // Default for gpt-5.2
}

/**
 * Rough token estimation (4 chars per token average)
 */
function estimateTokens(content: string | unknown): number {
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4);
  }
  if (typeof content === 'object' && content !== null) {
    return Math.ceil(JSON.stringify(content).length / 4);
  }
  return 0;
}

/**
 * Convert LangChain messages to OpenAI Responses API input format
 */
function convertToResponsesInput(
  messages: BaseMessage[],
  instructions?: string,
): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    const role = msg._getType() === 'human' ? 'user' : msg._getType() === 'ai' ? 'assistant' : 'system';

    if (typeof msg.content === 'string') {
      input.push({
        role,
        content: msg.content,
      });
    } else if (Array.isArray(msg.content)) {
      // Handle complex content (text + images, etc.)
      input.push({
        role,
        content: msg.content,
      });
    }
  }

  return input;
}

export interface CompactionServiceOptions {
  apiKey: string;
  baseURL?: string;
  model: string;
  config?: TCompactionConfig;
}

export interface CompactionResult {
  compacted: boolean;
  messages?: BaseMessage[];
  compactedInput?: Array<Record<string, unknown>>;
  originalTokens?: number;
  compactedTokens?: number;
}

/**
 * CompactionService handles calling OpenAI's /responses/compact endpoint
 * to compress conversation context when approaching token limits.
 */
export class CompactionService {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private config: Required<TCompactionConfig>;

  constructor(options: CompactionServiceOptions) {
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL || 'https://api.openai.com/v1';
    this.model = options.model;
    this.config = {
      ...DEFAULT_CONFIG,
      ...options.config,
    } as Required<TCompactionConfig>;
  }

  /**
   * Check if compaction should be triggered
   */
  shouldCompact(currentTokens: number): boolean {
    if (!this.config.enabled) {
      return false;
    }

    if (!supportsCompaction(this.model)) {
      return false;
    }

    if (currentTokens < this.config.minTokensBeforeCompaction) {
      return false;
    }

    const contextWindow = getContextWindow(this.model);
    const threshold = contextWindow * this.config.thresholdPercent;

    return currentTokens >= threshold;
  }

  /**
   * Estimate total tokens in a conversation
   */
  estimateConversationTokens(messages: BaseMessage[], instructions?: string): number {
    let total = 0;

    if (instructions) {
      total += estimateTokens(instructions);
    }

    for (const msg of messages) {
      total += estimateTokens(msg.content);
    }

    return total;
  }

  /**
   * Call the OpenAI /responses/compact endpoint to compact the conversation
   */
  async compact(
    messages: BaseMessage[],
    instructions?: string,
  ): Promise<CompactionResult> {
    const originalTokens = this.estimateConversationTokens(messages, instructions);

    if (!this.shouldCompact(originalTokens)) {
      return {
        compacted: false,
        originalTokens,
      };
    }

    logger.debug(
      `[CompactionService] Compacting conversation: ${originalTokens} tokens, model: ${this.model}`,
    );

    try {
      const input = convertToResponsesInput(messages, instructions);
      const baseURL = this.baseURL || 'https://api.openai.com/v1';

      // Call the compact endpoint using fetch since SDK may not support it directly
      const response = await fetch(`${baseURL}/responses/compact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input,
          ...(instructions && this.config.preserveInstructions
            ? { instructions }
            : {}),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Compact API error: ${response.status} - ${errorText}`);
      }

      const compactedData = await response.json() as {
        output?: Array<Record<string, unknown>>;
        usage?: { total_tokens?: number };
      };

      const compactedTokens = compactedData?.usage?.total_tokens || estimateTokens(compactedData?.output);

      logger.debug(
        `[CompactionService] Compaction complete: ${originalTokens} -> ${compactedTokens} tokens`,
      );

      return {
        compacted: true,
        compactedInput: compactedData?.output,
        originalTokens,
        compactedTokens,
      };
    } catch (error) {
      logger.error('[CompactionService] Compaction failed:', error);
      // Return original messages on failure
      return {
        compacted: false,
        originalTokens,
      };
    }
  }
}

/**
 * Create a compaction service instance
 */
export function createCompactionService(options: CompactionServiceOptions): CompactionService {
  return new CompactionService(options);
}
