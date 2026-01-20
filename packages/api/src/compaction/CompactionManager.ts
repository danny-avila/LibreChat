import type { TCompactionConfig } from 'librechat-data-provider';
import { getModelMaxTokens, maxTokensMap } from '~/utils/tokens';
import { EModelEndpoint } from 'librechat-data-provider';

/**
 * Models that support context compaction via OpenAI's Responses API
 */
const COMPACTION_SUPPORTED_MODELS = [
  // GPT-5.2 series only
  'gpt-5.2',
];

/**
 * Default compaction configuration values
 */
export const DEFAULT_COMPACTION_CONFIG: Required<TCompactionConfig> = {
  enabled: false,
  thresholdPercent: 0.85,
  minTokensBeforeCompaction: 10000,
  preserveInstructions: true,
  compactionPrompt: undefined,
};

export interface CompactionResult {
  compacted: boolean;
  previousResponseId?: string;
  summary?: string;
  originalTokens?: number;
  compactedTokens?: number;
}

export interface CompactionContext {
  model: string;
  currentTokens: number;
  maxContextTokens?: number;
  endpoint?: EModelEndpoint | string;
  messages?: unknown[];
  previousResponseId?: string;
}

/**
 * CompactionManager handles automatic context compaction for OpenAI's Responses API.
 * It monitors conversation token usage and triggers compaction when approaching context limits.
 */
export class CompactionManager {
  private config: Required<TCompactionConfig>;
  private logger?: { debug: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };

  constructor(
    config?: TCompactionConfig,
    logger?: { debug: (...args: unknown[]) => void; warn: (...args: unknown[]) => void },
  ) {
    this.config = {
      ...DEFAULT_COMPACTION_CONFIG,
      ...config,
    } as Required<TCompactionConfig>;
    this.logger = logger;
  }

  /**
   * Check if a model supports context compaction via the Responses API
   * @param model - The model name to check
   * @returns True if the model supports compaction
   */
  supportsCompaction(model: string): boolean {
    if (!model) {
      return false;
    }

    const lowerModel = model.toLowerCase();

    // Check exact matches and pattern matches
    return COMPACTION_SUPPORTED_MODELS.some((supportedModel) => {
      const pattern = supportedModel.toLowerCase();
      return lowerModel.includes(pattern) || lowerModel.startsWith(pattern);
    });
  }

  /**
   * Estimate token count for a message or array of messages.
   * This is a rough estimation using character count divided by 4 (average chars per token).
   * For more accurate counts, use a proper tokenizer like tiktoken.
   * @param content - The content to estimate tokens for
   * @returns Estimated token count
   */
  estimateTokens(content: string | unknown[] | unknown): number {
    if (typeof content === 'string') {
      // Rough estimation: ~4 characters per token on average
      return Math.ceil(content.length / 4);
    }

    if (Array.isArray(content)) {
      return content.reduce((total: number, item) => {
        if (typeof item === 'string') {
          return total + this.estimateTokens(item);
        }
        if (typeof item === 'object' && item !== null) {
          // Handle message objects
          const messageObj = item as Record<string, unknown>;
          if (typeof messageObj.content === 'string') {
            return total + this.estimateTokens(messageObj.content);
          }
          if (typeof messageObj.text === 'string') {
            return total + this.estimateTokens(messageObj.text);
          }
          // Recursively estimate for complex content
          return total + this.estimateTokens(JSON.stringify(item));
        }
        return total;
      }, 0);
    }

    if (typeof content === 'object' && content !== null) {
      return this.estimateTokens(JSON.stringify(content));
    }

    return 0;
  }

  /**
   * Get the context window size for a model
   * @param model - The model name
   * @param endpoint - The endpoint (default: openAI)
   * @returns The context window size in tokens
   */
  getContextWindowSize(model: string, endpoint: EModelEndpoint | string = EModelEndpoint.openAI): number {
    const maxTokens = getModelMaxTokens(model, endpoint as EModelEndpoint);
    if (maxTokens) {
      return maxTokens;
    }

    // Fallback: check aggregateModels directly
    const aggregateModels = maxTokensMap[EModelEndpoint.openAI] || {};
    for (const [key, value] of Object.entries(aggregateModels)) {
      if (model.toLowerCase().includes(key.toLowerCase())) {
        return value as number;
      }
    }

    // Default fallback for unknown models
    return 128000;
  }

  /**
   * Check if compaction should be triggered based on current token usage
   * @param context - The compaction context containing current state
   * @returns True if compaction should be triggered
   */
  shouldCompact(context: CompactionContext): boolean {
    if (!this.config.enabled) {
      this.logger?.debug('[CompactionManager] Compaction is disabled');
      return false;
    }

    if (!this.supportsCompaction(context.model)) {
      this.logger?.debug(`[CompactionManager] Model ${context.model} does not support compaction`);
      return false;
    }

    if (context.currentTokens < this.config.minTokensBeforeCompaction) {
      this.logger?.debug(
        `[CompactionManager] Current tokens (${context.currentTokens}) below minimum threshold (${this.config.minTokensBeforeCompaction})`,
      );
      return false;
    }

    const maxTokens = context.maxContextTokens || this.getContextWindowSize(context.model, context.endpoint);
    const threshold = maxTokens * this.config.thresholdPercent;

    const shouldCompact = context.currentTokens >= threshold;
    this.logger?.debug(
      `[CompactionManager] Token usage: ${context.currentTokens}/${maxTokens} (threshold: ${threshold}) - shouldCompact: ${shouldCompact}`,
    );

    return shouldCompact;
  }

  /**
   * Perform context compaction using OpenAI's Responses API /responses/compact endpoint.
   * This method should be called before making an API request when shouldCompact returns true.
   *
   * Note: The actual API call to /responses/compact should be implemented in the OpenAI client.
   * This method prepares the compaction request parameters.
   *
   * @param context - The compaction context
   * @returns Compaction configuration to be passed to the API
   */
  async prepareCompaction(context: CompactionContext): Promise<{
    truncation: {
      type: 'auto';
      preserve_instructions?: boolean;
    };
    previousResponseId?: string;
  } | null> {
    if (!this.shouldCompact(context)) {
      return null;
    }

    this.logger?.debug('[CompactionManager] Preparing compaction request');

    return {
      truncation: {
        type: 'auto',
        preserve_instructions: this.config.preserveInstructions,
      },
      previousResponseId: context.previousResponseId,
    };
  }

  /**
   * Build compaction parameters for the OpenAI Responses API request.
   * These parameters enable automatic truncation/compaction when the context is too long.
   * @param context - The compaction context
   * @returns Parameters to include in the API request, or null if compaction not needed
   */
  buildCompactionParams(context: CompactionContext): Record<string, unknown> | null {
    if (!this.shouldCompact(context)) {
      return null;
    }

    const params: Record<string, unknown> = {
      truncation: 'auto',
    };

    if (context.previousResponseId) {
      params.previous_response_id = context.previousResponseId;
    }

    return params;
  }

  /**
   * Get the current compaction configuration
   */
  getConfig(): Required<TCompactionConfig> {
    return { ...this.config };
  }

  /**
   * Update the compaction configuration
   * @param config - Partial configuration to merge
   */
  updateConfig(config: Partial<TCompactionConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    } as Required<TCompactionConfig>;
  }

  /**
   * Check if compaction is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Create a CompactionManager instance with the given configuration
 * @param config - Optional compaction configuration
 * @param logger - Optional logger for debug output
 * @returns A new CompactionManager instance
 */
export function createCompactionManager(
  config?: TCompactionConfig,
  logger?: { debug: (...args: unknown[]) => void; warn: (...args: unknown[]) => void },
): CompactionManager {
  return new CompactionManager(config, logger);
}

/**
 * Check if a model supports compaction (utility function)
 * @param model - The model name to check
 * @returns True if the model supports compaction
 */
export function supportsCompaction(model: string): boolean {
  const manager = new CompactionManager();
  return manager.supportsCompaction(model);
}

/**
 * Estimate tokens for content (utility function)
 * @param content - The content to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(content: string | unknown[] | unknown): number {
  const manager = new CompactionManager();
  return manager.estimateTokens(content);
}
