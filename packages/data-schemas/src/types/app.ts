import type {
  TEndpoint,
  FileSources,
  TFileConfig,
  TAzureConfig,
  TCustomConfig,
  TMemoryConfig,
  EModelEndpoint,
  TVertexAIConfig,
  TAgentsEndpoint,
  TCustomEndpoints,
  TAssistantEndpoint,
  TAnthropicEndpoint,
} from 'librechat-data-provider';

export type JsonSchemaType = {
  type: 'string' | 'number' | 'integer' | 'float' | 'boolean' | 'array' | 'object';
  enum?: string[];
  items?: JsonSchemaType;
  properties?: Record<string, JsonSchemaType>;
  required?: string[];
  description?: string;
  additionalProperties?: boolean | JsonSchemaType;
};

export type ConvertJsonSchemaToZodOptions = {
  allowEmptyObject?: boolean;
  dropFields?: string[];
  transformOneOfAnyOf?: boolean;
};

export interface FunctionTool {
  type: 'function';
  function: {
    description: string;
    name: string;
    parameters: JsonSchemaType;
  };
}

/**
 * Application configuration object
 * Based on the configuration defined in api/server/services/Config/getAppConfig.js
 */
export interface AppConfig {
  /** The main custom configuration */
  config: Partial<TCustomConfig>;
  /** OCR configuration */
  ocr?: TCustomConfig['ocr'];
  /** File paths configuration */
  paths?: {
    uploads: string;
    imageOutput: string;
    publicPath: string;
    [key: string]: string;
  };
  /** Memory configuration */
  memory?: TMemoryConfig;
  /** Web search configuration */
  webSearch?: TCustomConfig['webSearch'];
  /** File storage strategy ('local', 's3', 'firebase', 'azure_blob') */
  fileStrategy: FileSources.local | FileSources.s3 | FileSources.firebase | FileSources.azure_blob;
  /** File strategies configuration */
  fileStrategies?: TCustomConfig['fileStrategies'];
  /** Registration configurations */
  registration?: TCustomConfig['registration'];
  /** Actions configurations */
  actions?: TCustomConfig['actions'];
  /** Admin-filtered tools */
  filteredTools?: string[];
  /** Admin-included tools */
  includedTools?: string[];
  /** Image output type configuration */
  imageOutputType: string;
  /** Interface configuration */
  interfaceConfig?: TCustomConfig['interface'];
  /** Turnstile configuration */
  turnstileConfig?: Partial<TCustomConfig['turnstile']>;
  /** Balance configuration */
  balance?: Partial<TCustomConfig['balance']>;
  /** Transactions configuration */
  transactions?: TCustomConfig['transactions'];
  /** Speech configuration */
  speech?: TCustomConfig['speech'];
  /** MCP server configuration */
  mcpConfig?: TCustomConfig['mcpServers'] | null;
  /** MCP settings (domain allowlist, etc.) */
  mcpSettings?: TCustomConfig['mcpSettings'] | null;
  /** File configuration */
  fileConfig?: TFileConfig;
  /** Secure image links configuration */
  secureImageLinks?: TCustomConfig['secureImageLinks'];
  /** Processed model specifications */
  modelSpecs?: TCustomConfig['modelSpecs'];
  /** Available tools */
  availableTools?: Record<string, FunctionTool>;
  endpoints?: {
    /** OpenAI endpoint configuration */
    openAI?: Partial<TEndpoint>;
    /** Google endpoint configuration */
    google?: Partial<TEndpoint>;
    /** Bedrock endpoint configuration */
    bedrock?: Partial<TEndpoint>;
    /** Anthropic endpoint configuration with optional Vertex AI support */
    anthropic?: Partial<TAnthropicEndpoint> & {
      /** Validated Vertex AI configuration */
      vertexConfig?: TVertexAIConfig;
    };
    /** Azure OpenAI endpoint configuration */
    azureOpenAI?: TAzureConfig;
    /** Assistants endpoint configuration */
    assistants?: Partial<TAssistantEndpoint>;
    /** Azure assistants endpoint configuration */
    azureAssistants?: Partial<TAssistantEndpoint>;
    /** Agents endpoint configuration */
    [EModelEndpoint.agents]?: Partial<TAgentsEndpoint>;
    /** Custom endpoints configuration */
    [EModelEndpoint.custom]?: TCustomEndpoints;
    /** Global endpoint configuration */
    all?: Partial<TEndpoint>;
  };
}
