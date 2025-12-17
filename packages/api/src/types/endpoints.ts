import type { ClientOptions, OpenAIClientOptions } from '@librechat/agents';
import type { TConfig } from 'librechat-data-provider';
import type { EndpointTokenConfig, ServerRequest } from '~/types';

export type TCustomEndpointsConfig = Partial<{ [key: string]: Omit<TConfig, 'order'> }>;

/**
 * Interface for user key values retrieved from the database
 */
export interface UserKeyValues {
  apiKey?: string;
  baseURL?: string;
}

/**
 * Function type for getting user key (single decrypted value)
 */
export type GetUserKeyFunction = (params: { userId: string; name: string }) => Promise<string>;

/**
 * Function type for getting user key values (parsed JSON object with apiKey/baseURL)
 */
export type GetUserKeyValuesFunction = (params: {
  userId: string;
  name: string;
}) => Promise<UserKeyValues>;

/**
 * Database methods required for endpoint initialization
 * These are passed in at invocation time to allow for dependency injection
 */
export interface EndpointDbMethods {
  /** Get single decrypted key value (used for simple API keys) */
  getUserKey: GetUserKeyFunction;
  /** Get parsed key values object (used for apiKey + baseURL combinations) */
  getUserKeyValues: GetUserKeyValuesFunction;
}

/**
 * Base parameters for all endpoint initialization functions
 */
export interface BaseInitializeParams {
  /** Request data containing user and body information (includes req.config) */
  req: ServerRequest;
  /** The endpoint name/identifier (e.g., 'openAI', 'anthropic', 'custom-endpoint-name') */
  endpoint: string;
  /** Model parameters from the request (includes model, temperature, topP, etc.) */
  model_parameters?: Record<string, unknown>;
  /** Database methods for user key operations */
  db: EndpointDbMethods;
}

/**
 * Base result type that all initialize functions return
 * Using a more permissive type to accommodate different provider-specific results
 */
export interface InitializeResultBase {
  llmConfig: ClientOptions;
  configOptions?: OpenAIClientOptions['configuration'];
  endpointTokenConfig?: EndpointTokenConfig;
  useLegacyContent?: boolean;
  provider?: string;
  tools?: unknown[];
}
