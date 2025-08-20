import { z } from 'zod';
import { openAISchema, EModelEndpoint } from 'librechat-data-provider';
import type { TEndpointOption, TAzureConfig, TEndpoint } from 'librechat-data-provider';
import type { BindToolsInput } from '@langchain/core/language_models/chat_models';
import type { OpenAIClientOptions, Providers } from '@librechat/agents';
import type { AzureOptions } from './azure';

export type OpenAIParameters = z.infer<typeof openAISchema>;

/**
 * Configuration options for the getLLMConfig function
 */
export interface OpenAIConfigOptions {
  modelOptions?: Partial<OpenAIParameters>;
  directEndpoint?: boolean;
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
  tools?: BindToolsInput[];
  provider?: Providers;
}

/**
 * Interface for user values retrieved from the database
 */
export interface UserKeyValues {
  apiKey?: string;
  baseURL?: string;
}

/**
 * Request interface with only the properties we need (avoids Express typing conflicts)
 */
export interface RequestData {
  user: {
    id: string;
  };
  body: {
    model?: string;
    endpoint?: string;
    key?: string;
  };
  app: {
    locals: {
      [EModelEndpoint.azureOpenAI]?: TAzureConfig;
      [EModelEndpoint.openAI]?: TEndpoint;
      all?: TEndpoint;
    };
  };
}

/**
 * Function type for getting user key values
 */
export type GetUserKeyValuesFunction = (params: {
  userId: string;
  name: string;
}) => Promise<UserKeyValues>;

/**
 * Function type for checking user key expiry
 */
export type CheckUserKeyExpiryFunction = (expiresAt: string, endpoint: string) => void;

/**
 * Parameters for the initializeOpenAI function
 */
export interface InitializeOpenAIOptionsParams {
  req: RequestData;
  overrideModel?: string;
  overrideEndpoint?: string;
  endpointOption: Partial<TEndpointOption>;
  getUserKeyValues: GetUserKeyValuesFunction;
  checkUserKeyExpiry: CheckUserKeyExpiryFunction;
}

/**
 * Extended LLM config result with stream rate handling
 */
export interface OpenAIOptionsResult extends LLMConfigResult {
  streamRate?: number;
}
