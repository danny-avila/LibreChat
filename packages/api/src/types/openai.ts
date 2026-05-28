import { z } from 'zod';
import { openAISchema } from 'librechat-data-provider';
import type { BindToolsInput } from '@librechat/agents/langchain/language_models/chat_models';
import type { OpenAIClientOptions, Providers } from '@librechat/agents';
import type { TConfig } from 'librechat-data-provider';
import type { AzureOptions } from './azure';

export type OpenAIParameters = z.infer<typeof openAISchema>;

export type OpenAIModelOptions = Partial<OpenAIParameters>;

/**
 * Configuration options for the getLLMConfig function
 */
export interface OpenAIConfigOptions {
  modelOptions?: OpenAIModelOptions;
  directEndpoint?: boolean;
  reverseProxyUrl?: string | null;
  defaultQuery?: Record<string, string | undefined>;
  headers?: Record<string, string>;
  proxy?: string | null;
  azure?: false | AzureOptions;
  streaming?: boolean;
  addParams?: Record<string, unknown>;
  dropParams?: string[];
  customParams?: Partial<TConfig['customParams']>;
}

export type OpenAIConfiguration = OpenAIClientOptions['configuration'];

export type OAIClientOptions = Omit<OpenAIClientOptions, 'verbosity'> & {
  include_reasoning?: boolean;
  /**
   * LibreChat-extension flag honored by `LibreChatOpenAICompletions`
   * (`@librechat/agents`): when true, replays
   * `additional_kwargs.reasoning_content` on tool-bearing assistant
   * messages as a top-level `reasoning_content` field in the OpenAI
   * request body. Required by DeepSeek thinking-mode tool-calling, which
   * 400s without it. Direct `ChatDeepSeek` hardcodes the flag; the
   * OpenRouter path opts in via this option.
   *
   * @see https://api-docs.deepseek.com/guides/thinking_mode#tool-calls
   */
  includeReasoningContent?: boolean;
  promptCache?: boolean;
  _lc_stream_delay?: number;
  verbosity?: string | null;
};

/**
 * Return type for getLLMConfig function
 */
export interface LLMConfigResult<T = OAIClientOptions> {
  llmConfig: T;
  provider?: Providers;
  tools?: BindToolsInput[];
}

export type OpenAIConfigResult = LLMConfigResult<OAIClientOptions> & {
  configOptions?: OpenAIConfiguration;
};
