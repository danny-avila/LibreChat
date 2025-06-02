import { z } from 'zod';
import { openAISchema } from 'librechat-data-provider';
import type { OpenAIClientOptions } from '@librechat/agents';
import type { AzureOptions } from './azure';

export type OpenAIParameters = z.infer<typeof openAISchema>;

/**
 * Configuration options for the getLLMConfig function
 */
export interface LLMConfigOptions {
  modelOptions?: Partial<OpenAIParameters>;
  reverseProxyUrl?: string;
  defaultQuery?: Record<string, string | undefined>;
  headers?: Record<string, string>;
  proxy?: string;
  azure?: AzureOptions;
  streaming?: boolean;
  addParams?: Record<string, unknown>;
  dropParams?: string[];
}

export type OpenAIConfiguration = OpenAIClientOptions['configuration'];

export type ClientOptions = OpenAIClientOptions & {
  include_reasoning?: boolean;
};

/**
 * Return type for getLLMConfig function
 */
export interface LLMConfigResult {
  llmConfig: ClientOptions;
  configOptions: OpenAIConfiguration;
}
