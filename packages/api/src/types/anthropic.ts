import { z } from 'zod';
import { AnthropicClientOptions } from '@librechat/agents';
import { anthropicSchema } from 'librechat-data-provider';

export type AnthropicParameters = z.infer<typeof anthropicSchema>;

/**
 * Configuration options for the getLLMConfig function
 */
export interface AnthropicConfigOptions {
  modelOptions?: Partial<AnthropicParameters>;
  /** The user ID for tracking and personalization */
  userId?: string;
  /** Proxy server URL */
  proxy?: string;
  /** URL for a reverse proxy, if used */
  reverseProxyUrl?: string;
}

/**
 * Return type for getLLMConfig function
 */
export interface AnthropicLLMConfigResult {
  /** Configuration options for creating an Anthropic LLM instance */
  llmConfig: AnthropicClientOptions;
  /** Array of tools to be used */
  tools: Array<{
    type: string;
    name?: string;
  }>;
}
