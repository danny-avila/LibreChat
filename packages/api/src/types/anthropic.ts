import { z } from 'zod';
import { Dispatcher } from 'undici';
import { anthropicSchema } from 'librechat-data-provider';
import { AnthropicClientOptions } from '@librechat/agents';
import { BindToolsInput } from '@langchain/core/language_models/chat_models';

export type AnthropicParameters = z.infer<typeof anthropicSchema>;

/**
 * Configuration options for the getLLMConfig function
 */
export interface AnthropicConfigOptions {
  modelOptions?: Partial<AnthropicParameters>;
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
  };
  /** Array of tools to be used */
  tools?: BindToolsInput[];
}
