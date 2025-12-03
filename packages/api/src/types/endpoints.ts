import type { ClientOptions, OpenAIClientOptions } from '@librechat/agents';
import type { TEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { EndpointTokenConfig } from '~/types';

export type TCustomEndpointsConfig = Partial<{ [key: string]: Omit<TEndpoint, 'order'> }>;

/**
 * Minimal user data required for endpoint initialization
 */
export interface EndpointUser {
  id: string;
  email?: string;
  name?: string;
  username?: string;
}

/**
 * Minimal request body data required for endpoint initialization
 */
export interface EndpointRequestBody {
  model?: string;
  endpoint?: string;
  /** User key expiration timestamp */
  key?: string;
}

/**
 * Minimal request data required for endpoint initialization
 * This abstracts away Express-specific types while providing necessary data
 */
export interface EndpointRequest {
  user: EndpointUser;
  body: EndpointRequestBody;
}

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
 * Function type for checking user key expiry
 * @throws Error if the key has expired
 */
export type CheckUserKeyExpiryFunction = (expiresAt: string, endpoint: string) => void;

/**
 * Database methods required for endpoint initialization
 * These are passed in at invocation time to allow for dependency injection
 */
export interface EndpointDbMethods {
  /** Get single decrypted key value (used for simple API keys) */
  getUserKey: GetUserKeyFunction;
  /** Get parsed key values object (used for apiKey + baseURL combinations) */
  getUserKeyValues: GetUserKeyValuesFunction;
  /** Check if user key has expired */
  checkUserKeyExpiry: CheckUserKeyExpiryFunction;
}

/**
 * Function type for fetching models (used by custom endpoints)
 */
export type FetchModelsFunction = (params: {
  apiKey: string;
  baseURL: string;
  name: string;
  user: string;
  tokenKey: string;
}) => Promise<void>;

/**
 * Cache store interface for token config
 */
export interface TokenConfigCache {
  get: (key: string) => Promise<EndpointTokenConfig | undefined>;
  set: (key: string, value: EndpointTokenConfig) => Promise<void>;
}

/**
 * Function type for getting cache stores (used by custom endpoints)
 */
export type GetLogStoresFunction = (key: string) => TokenConfigCache;

/**
 * Base parameters for all endpoint initialization functions
 */
export interface BaseInitializeParams {
  /** Request data containing user and body information */
  req: EndpointRequest;
  /** Application configuration */
  appConfig?: AppConfig;
  /** Model parameters from the request (temperature, topP, etc.) */
  model_parameters?: Record<string, unknown>;
  /** Database methods for user key operations */
  db: EndpointDbMethods;
  /** Override the model from request */
  overrideModel?: string;
  /** Override the endpoint from request */
  overrideEndpoint?: string;
  /** Function to fetch models from the endpoint (required for custom endpoints) */
  fetchModels?: FetchModelsFunction;
  /** Function to get cache stores (required for custom endpoints) */
  getLogStores?: GetLogStoresFunction;
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
