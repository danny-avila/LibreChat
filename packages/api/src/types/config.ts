import type {
  TEndpoint,
  FileSources,
  TAzureConfig,
  TCustomConfig,
  TMemoryConfig,
  EModelEndpoint,
  TAgentsEndpoint,
  TCustomEndpoints,
  TAssistantEndpoint,
} from 'librechat-data-provider';
import type { FunctionTool } from './tools';

/**
 * Application configuration object
 * Based on the configuration defined in api/server/services/Config/getAppConfig.js
 */
export interface AppConfig {
  /** The main custom configuration */
  config: TCustomConfig;
  /** OCR configuration */
  ocr?: TCustomConfig['ocr'];
  /** File paths configuration */
  paths: {
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
  fileStrategies: TCustomConfig['fileStrategies'];
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
  turnstileConfig?: TCustomConfig['turnstile'];
  /** Balance configuration */
  balance?: TCustomConfig['balance'];
  /** Transactions configuration */
  transactions?: TCustomConfig['transactions'];
  /** Speech configuration */
  speech?: TCustomConfig['speech'];
  /** MCP server configuration */
  mcpConfig?: TCustomConfig['mcpServers'] | null;
  /** File configuration */
  fileConfig?: TCustomConfig['fileConfig'];
  /** Secure image links configuration */
  secureImageLinks?: TCustomConfig['secureImageLinks'];
  /** Processed model specifications */
  modelSpecs?: TCustomConfig['modelSpecs'];
  /** Available tools */
  availableTools?: Record<string, FunctionTool>;
  endpoints?: {
    /** OpenAI endpoint configuration */
    openAI?: TEndpoint;
    /** Google endpoint configuration */
    google?: TEndpoint;
    /** Bedrock endpoint configuration */
    bedrock?: TEndpoint;
    /** Anthropic endpoint configuration */
    anthropic?: TEndpoint;
    /** GPT plugins endpoint configuration */
    gptPlugins?: TEndpoint;
    /** Azure OpenAI endpoint configuration */
    azureOpenAI?: TAzureConfig;
    /** Assistants endpoint configuration */
    assistants?: TAssistantEndpoint;
    /** Azure assistants endpoint configuration */
    azureAssistants?: TAssistantEndpoint;
    /** Agents endpoint configuration */
    [EModelEndpoint.agents]?: TAgentsEndpoint;
    /** Custom endpoints configuration */
    [EModelEndpoint.custom]?: TCustomEndpoints;
    /** Global endpoint configuration */
    all?: TEndpoint;
  };
}
