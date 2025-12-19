import { z } from 'zod';
import { Dispatcher } from 'undici';
import { anthropicSchema } from 'librechat-data-provider';
import type { AnthropicClientOptions } from '@librechat/agents';
import type { LLMConfigResult } from './openai';

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
  user?: string;
};

/**
 * Configuration options for the getLLMConfig function
 */
export interface AnthropicConfigOptions {
  modelOptions?: AnthropicModelOptions;
  /** Proxy server URL */
  proxy?: string | null;
  /** URL for a reverse proxy, if used */
  reverseProxyUrl?: string | null;
  /** Default parameters to apply only if fields are undefined */
  defaultParams?: Record<string, unknown>;
  /** Additional parameters to add to the configuration */
  addParams?: Record<string, unknown>;
  /** Parameters to drop/exclude from the configuration */
  dropParams?: string[];
}

/**
 * Return type for getLLMConfig function
 */
export type AnthropicLLMConfigResult = LLMConfigResult<
  AnthropicClientOptions & {
    clientOptions?: {
      fetchOptions?: { dispatcher: Dispatcher };
    };
    stream?: boolean;
  }
>;
