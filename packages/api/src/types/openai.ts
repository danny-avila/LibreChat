import { z } from 'zod';
import { openAISchema } from 'librechat-data-provider';
import type { TConfig } from 'librechat-data-provider';
import type { OpenAIClientOptions, Providers } from '@librechat/agents';
import type { BindToolsInput } from '@langchain/core/language_models/chat_models';
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

export type OAIClientOptions = OpenAIClientOptions & {
  include_reasoning?: boolean;
  _lc_stream_delay?: number;
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
