import { z } from 'zod';
import { Dispatcher } from 'undici';
import { anthropicSchema } from 'librechat-data-provider';
import { AnthropicClientOptions } from '@librechat/agents';
import { BindToolsInput } from '@langchain/core/language_models/chat_models';

export type AnthropicParameters = z.infer<typeof anthropicSchema>;

export interface ThinkingConfigDisabled {
  type: 'disabled';
}

export interface ThinkingConfigEnabled {
  /**
   * Determines how many tokens Claude can use for its internal reasoning process.
   * Larger budgets can enable more thorough analysis for complex problems, improving
   * response quality.
   *
   * Must be ≥1024 and less than `max_tokens`.
   *
   * See
   * [extended thinking](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)
   * for details.
   */
  budget_tokens: number;

  type: 'enabled';
}

/**
 * Configuration for enabling Claude's extended thinking.
 *
 * When enabled, responses include `thinking` content blocks showing Claude's
 * thinking process before the final answer. Requires a minimum budget of 1,024
 * tokens and counts towards your `max_tokens` limit.
 *
 * See
 * [extended thinking](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)
 * for details.
 */
export type ThinkingConfigParam = ThinkingConfigEnabled | ThinkingConfigDisabled;

export type AnthropicModelOptions = Partial<Omit<AnthropicParameters, 'thinking'>> & {
  thinking?: AnthropicParameters['thinking'] | null;
};

/**
 * Configuration options for the getLLMConfig function
 */
export interface AnthropicConfigOptions {
  modelOptions?: AnthropicModelOptions;
  /** The user ID for tracking and personalization */
  userId?: string;
  /** Proxy server URL */
  proxy?: string | null;
  /** URL for a reverse proxy, if used */
  reverseProxyUrl?: string | null;
}

/**
 * Return type for getLLMConfig function
 */
export interface AnthropicLLMConfigResult {
  /** Configuration options for creating an Anthropic LLM instance */
  llmConfig: AnthropicClientOptions & {
    clientOptions?: {
      fetchOptions?: { dispatcher: Dispatcher };
    };
    stream?: boolean;
  };
  /** Array of tools to be used */
  tools?: BindToolsInput[];
}
