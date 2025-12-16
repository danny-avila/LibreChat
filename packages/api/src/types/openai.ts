import { z } from 'zod';
import { openAISchema, EModelEndpoint } from 'librechat-data-provider';
import type { TEndpointOption, TAzureConfig, TEndpoint, TConfig } from 'librechat-data-provider';
import type { BindToolsInput } from '@langchain/core/language_models/chat_models';
import type { OpenAIClientOptions, Providers } from '@librechat/agents';
import type { AppConfig } from '@librechat/data-schemas';
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
  appConfig: AppConfig;
  overrideModel?: string;
  overrideEndpoint?: string;
  endpointOption: Partial<TEndpointOption>;
  getUserKeyValues: GetUserKeyValuesFunction;
  checkUserKeyExpiry: CheckUserKeyExpiryFunction;
}
