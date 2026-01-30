/**
 * API Registry Types
 * Extends MCP Server types to support OpenAPI/Swagger-based API registration
 */

import type { MCPOptions } from '../mcp';

/**
 * OpenAPI authentication security scheme types
 */
export type OpenAPISecuritySchemeType = 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';

export type OpenAPIAuthType = 'apiKey' | 'bearer' | 'basic' | 'oauth2';

/**
 * API authentication configuration
 */
export interface APIAuthConfig {
  /** Authentication type */
  type: OpenAPIAuthType;
  /** Whether auth is provided by admin or each user */
  source: 'admin' | 'user';
  /** For apiKey auth: header name */
  headerName?: string;
  /** For apiKey auth: the key value (encrypted in DB) */
  apiKey?: string;
  /** For bearer auth: the token (encrypted in DB) */
  token?: string;
  /** For basic auth: username */
  username?: string;
  /** For basic auth: password (encrypted in DB) */
  password?: string;
  /** For OAuth2: configuration */
  oauth?: {
    authorizationUrl: string;
    tokenUrl: string;
    clientId: string;
    clientSecret?: string;
    scopes?: string[];
  };
}

/**
 * OpenAPI endpoint definition
 */
export interface OpenAPIEndpoint {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Endpoint path */
  path: string;
  /** Operation ID from OpenAPI spec */
  operationId: string;
  /** Summary/description */
  summary?: string;
  /** Full description */
  description?: string;
  /** Parameters */
  parameters?: Array<{
    name: string;
    in: 'path' | 'query' | 'header' | 'cookie';
    required?: boolean;
    schema: any;
    description?: string;
  }>;
  /** Request body schema */
  requestBody?: {
    required?: boolean;
    content: {
      [mediaType: string]: {
        schema: any;
      };
    };
  };
  /** Response schemas */
  responses?: {
    [statusCode: string]: {
      description?: string;
      content?: {
        [mediaType: string]: {
          schema: any;
        };
      };
    };
  };
}

/**
 * API Registry configuration (extends MCP config)
 */
export interface APIRegistryConfig {
  /** Swagger/OpenAPI spec URL */
  swaggerUrl: string;
  /** Base URL for API calls (extracted from spec or manually provided) */
  baseUrl: string;
  /** Selected endpoints to expose as tools */
  selectedEndpoints: string[]; // Format: "METHOD /path"
  /** Parsed endpoint definitions */
  endpoints?: Record<string, OpenAPIEndpoint>;
  /** Authentication configuration */
  auth?: APIAuthConfig;
  /** Custom headers to include in all requests */
  customHeaders?: Record<string, string>;
}

/**
 * API Registry entry (stored in DB, extends MCPServer)
 */
export interface IAPIRegistry {
  _id?: string;
  serverName: string;
  sourceType: 'api'; // Distinguishes from regular MCP servers
  config: MCPOptions & {
    apiConfig: APIRegistryConfig;
  };
  author?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Parameters for creating a new API Registry entry
 */
export interface APIRegistryCreateParams {
  swaggerUrl: string;
  title?: string;
  description?: string;
  auth?: APIAuthConfig;
  customHeaders?: Record<string, string>;
}

/**
 * Parameters for updating an API Registry entry
 */
export interface APIRegistryUpdateParams {
  title?: string;
  description?: string;
  selectedEndpoints?: string[];
  auth?: APIAuthConfig;
  customHeaders?: Record<string, string>;
}

/**
 * Response from parsing OpenAPI spec
 */
export interface OpenAPIParseResult {
  /** API title from spec */
  title: string;
  /** API description from spec */
  description?: string;
  /** Base URL from servers array */
  baseUrl: string;
  /** Detected authentication schemes */
  authSchemes: Array<{
    name: string;
    type: OpenAPISecuritySchemeType;
    scheme?: string;
    in?: string;
    bearerFormat?: string;
  }>;
  /** All available endpoints */
  endpoints: Record<string, OpenAPIEndpoint>;
  /** OpenAPI version */
  version: string;
}

/**
 * API Registry list response
 */
export interface APIRegistryListResponse {
  apis: IAPIRegistry[];
  total: number;
  hasMore: boolean;
}

/**
 * Tool definition generated from API endpoint
 */
export interface APIToolDefinition {
  /** Tool name (generated from operationId) */
  name: string;
  /** Tool description */
  description: string;
  /** Input schema for the tool */
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  /** Metadata for execution */
  metadata: {
    apiId: string;
    method: string;
    path: string;
    operationId: string;
  };
}