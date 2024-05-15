/* eslint-disable max-len */
import { z } from 'zod';
import type { ZodError } from 'zod';
import { EModelEndpoint, eModelEndpointSchema } from './schemas';
import { fileConfigSchema } from './file-config';
import { specsConfigSchema } from './models';
import { FileSources } from './types/files';
import { TModelsConfig } from './types';

export const defaultSocialLogins = ['google', 'facebook', 'openid', 'github', 'discord'];

export const defaultRetrievalModels = [
  'gpt-4-turbo-preview',
  'gpt-3.5-turbo-0125',
  'gpt-4-0125-preview',
  'gpt-4-1106-preview',
  'gpt-3.5-turbo-1106',
  'gpt-3.5-turbo-0125',
  'gpt-4-turbo',
  'gpt-4-0125',
  'gpt-4-1106',
];

export enum SettingsViews {
  default = 'default',
  advanced = 'advanced',
}

export const fileSourceSchema = z.nativeEnum(FileSources);

// Helper type to extract the shape of the Zod object schema
type SchemaShape<T> = T extends z.ZodObject<infer U> ? U : never;

// Helper type to determine the default value or undefined based on whether the field has a default
type DefaultValue<T> = T extends z.ZodDefault<z.ZodTypeAny>
  ? ReturnType<T['_def']['defaultValue']>
  : undefined;

// Extract default values or undefined from the schema shape
type ExtractDefaults<T> = {
  [P in keyof T]: DefaultValue<T[P]>;
};

export type SchemaDefaults<T> = ExtractDefaults<SchemaShape<T>>;

export type TConfigDefaults = SchemaDefaults<typeof configSchema>;

export function getSchemaDefaults<Schema extends z.AnyZodObject>(
  schema: Schema,
): ExtractDefaults<SchemaShape<Schema>> {
  const shape = schema.shape;
  const entries = Object.entries(shape).map(([key, value]) => {
    if (value instanceof z.ZodDefault) {
      // Extract default value if it exists
      return [key, value._def.defaultValue()];
    }
    return [key, undefined];
  });

  // Create the object with the right types
  return Object.fromEntries(entries) as ExtractDefaults<SchemaShape<Schema>>;
}

export const modelConfigSchema = z
  .object({
    deploymentName: z.string().optional(),
    version: z.string().optional(),
    assistants: z.boolean().optional(),
  })
  .or(z.boolean());

export type TAzureModelConfig = z.infer<typeof modelConfigSchema>;

export const azureBaseSchema = z.object({
  apiKey: z.string(),
  serverless: z.boolean().optional(),
  instanceName: z.string().optional(),
  deploymentName: z.string().optional(),
  assistants: z.boolean().optional(),
  addParams: z.record(z.any()).optional(),
  dropParams: z.array(z.string()).optional(),
  forcePrompt: z.boolean().optional(),
  version: z.string().optional(),
  baseURL: z.string().optional(),
  additionalHeaders: z.record(z.any()).optional(),
});

export type TAzureBaseSchema = z.infer<typeof azureBaseSchema>;

export const azureGroupSchema = z
  .object({
    group: z.string(),
    models: z.record(z.string(), modelConfigSchema),
  })
  .required()
  .and(azureBaseSchema);

export const azureGroupConfigsSchema = z.array(azureGroupSchema).min(1);
export type TAzureGroup = z.infer<typeof azureGroupSchema>;
export type TAzureGroups = z.infer<typeof azureGroupConfigsSchema>;
export type TAzureModelMapSchema = {
  // deploymentName?: string;
  // version?: string;
  group: string;
};

export type TAzureModelGroupMap = Record<string, TAzureModelMapSchema>;
export type TAzureGroupMap = Record<
  string,
  TAzureBaseSchema & { models: Record<string, TAzureModelConfig> }
>;

export type TValidatedAzureConfig = {
  modelNames: string[];
  modelGroupMap: TAzureModelGroupMap;
  groupMap: TAzureGroupMap;
};

export type TAzureConfigValidationResult = TValidatedAzureConfig & {
  isValid: boolean;
  errors: (ZodError | string)[];
};

export enum Capabilities {
  code_interpreter = 'code_interpreter',
  image_vision = 'image_vision',
  retrieval = 'retrieval',
  actions = 'actions',
  tools = 'tools',
}

export const assistantEndpointSchema = z.object({
  /* assistants specific */
  disableBuilder: z.boolean().optional(),
  pollIntervalMs: z.number().optional(),
  timeoutMs: z.number().optional(),
  supportedIds: z.array(z.string()).min(1).optional(),
  excludedIds: z.array(z.string()).min(1).optional(),
  retrievalModels: z.array(z.string()).min(1).optional().default(defaultRetrievalModels),
  capabilities: z
    .array(z.nativeEnum(Capabilities))
    .optional()
    .default([
      Capabilities.code_interpreter,
      Capabilities.image_vision,
      Capabilities.retrieval,
      Capabilities.actions,
      Capabilities.tools,
    ]),
  /* general */
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  models: z
    .object({
      default: z.array(z.string()).min(1),
      fetch: z.boolean().optional(),
      userIdQuery: z.boolean().optional(),
    })
    .optional(),
  titleConvo: z.boolean().optional(),
  titleMethod: z.union([z.literal('completion'), z.literal('functions')]).optional(),
  titleModel: z.string().optional(),
  headers: z.record(z.any()).optional(),
});

export type TAssistantEndpoint = z.infer<typeof assistantEndpointSchema>;

export const endpointSchema = z.object({
  name: z.string().refine((value) => !eModelEndpointSchema.safeParse(value).success, {
    message: `Value cannot be one of the default endpoint (EModelEndpoint) values: ${Object.values(
      EModelEndpoint,
    ).join(', ')}`,
  }),
  apiKey: z.string(),
  baseURL: z.string(),
  models: z.object({
    default: z.array(z.string()).min(1),
    fetch: z.boolean().optional(),
    userIdQuery: z.boolean().optional(),
  }),
  titleConvo: z.boolean().optional(),
  titleMethod: z.union([z.literal('completion'), z.literal('functions')]).optional(),
  titleModel: z.string().optional(),
  summarize: z.boolean().optional(),
  summaryModel: z.string().optional(),
  forcePrompt: z.boolean().optional(),
  modelDisplayLabel: z.string().optional(),
  headers: z.record(z.any()).optional(),
  addParams: z.record(z.any()).optional(),
  dropParams: z.array(z.string()).optional(),
  customOrder: z.number().optional(),
});

export type TEndpoint = z.infer<typeof endpointSchema>;

export const azureEndpointSchema = z
  .object({
    groups: azureGroupConfigsSchema,
    plugins: z.boolean().optional(),
    assistants: z.boolean().optional(),
  })
  .and(
    endpointSchema
      .pick({
        titleConvo: true,
        titleMethod: true,
        titleModel: true,
        summarize: true,
        summaryModel: true,
        customOrder: true,
      })
      .partial(),
  );

export type TAzureConfig = Omit<z.infer<typeof azureEndpointSchema>, 'groups'> &
  TAzureConfigValidationResult;

export const rateLimitSchema = z.object({
  fileUploads: z
    .object({
      ipMax: z.number().optional(),
      ipWindowInMinutes: z.number().optional(),
      userMax: z.number().optional(),
      userWindowInMinutes: z.number().optional(),
    })
    .optional(),
  conversationsImport: z
    .object({
      ipMax: z.number().optional(),
      ipWindowInMinutes: z.number().optional(),
      userMax: z.number().optional(),
      userWindowInMinutes: z.number().optional(),
    })
    .optional(),
});

export enum EImageOutputType {
  PNG = 'png',
  WEBP = 'webp',
  JPEG = 'jpeg',
}

export const configSchema = z.object({
  version: z.string(),
  cache: z.boolean().default(true),
  secureImageLinks: z.boolean().optional(),
  imageOutputType: z.nativeEnum(EImageOutputType).default(EImageOutputType.PNG),
  includedTools: z.array(z.string()).optional(),
  filteredTools: z.array(z.string()).optional(),
  interface: z
    .object({
      privacyPolicy: z
        .object({
          externalUrl: z.string().optional(),
          openNewTab: z.boolean().optional(),
        })
        .optional(),
      termsOfService: z
        .object({
          externalUrl: z.string().optional(),
          openNewTab: z.boolean().optional(),
        })
        .optional(),
      endpointsMenu: z.boolean().optional(),
      modelSelect: z.boolean().optional(),
      parameters: z.boolean().optional(),
      sidePanel: z.boolean().optional(),
      presets: z.boolean().optional(),
    })
    .default({
      endpointsMenu: true,
      modelSelect: true,
      parameters: true,
      sidePanel: true,
      presets: true,
    }),
  fileStrategy: fileSourceSchema.default(FileSources.local),
  registration: z
    .object({
      socialLogins: z.array(z.string()).optional(),
      allowedDomains: z.array(z.string()).optional(),
    })
    .default({ socialLogins: defaultSocialLogins }),
  rateLimits: rateLimitSchema.optional(),
  fileConfig: fileConfigSchema.optional(),
  modelSpecs: specsConfigSchema.optional(),
  endpoints: z
    .object({
      [EModelEndpoint.azureOpenAI]: azureEndpointSchema.optional(),
      [EModelEndpoint.assistants]: assistantEndpointSchema.optional(),
      custom: z.array(endpointSchema.partial()).optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one `endpoints` field must be provided.',
    })
    .optional(),
});

export const getConfigDefaults = () => getSchemaDefaults(configSchema);

export type TCustomConfig = z.infer<typeof configSchema>;

export enum KnownEndpoints {
  anyscale = 'anyscale',
  apipie = 'apipie',
  cohere = 'cohere',
  fireworks = 'fireworks',
  groq = 'groq',
  huggingface = 'huggingface',
  mistral = 'mistral',
  mlx = 'mlx',
  ollama = 'ollama',
  openrouter = 'openrouter',
  perplexity = 'perplexity',
  shuttleai = 'shuttleai',
  'together.ai' = 'together.ai',
}

export enum FetchTokenConfig {
  openrouter = KnownEndpoints.openrouter,
}

export const defaultEndpoints: EModelEndpoint[] = [
  EModelEndpoint.openAI,
  EModelEndpoint.assistants,
  EModelEndpoint.azureOpenAI,
  EModelEndpoint.bingAI,
  EModelEndpoint.chatGPTBrowser,
  EModelEndpoint.gptPlugins,
  EModelEndpoint.google,
  EModelEndpoint.anthropic,
  EModelEndpoint.custom,
];

export const alternateName = {
  [EModelEndpoint.openAI]: 'OpenAI',
  [EModelEndpoint.assistants]: 'Assistants',
  [EModelEndpoint.azureOpenAI]: 'Azure OpenAI',
  [EModelEndpoint.bingAI]: 'Bing',
  [EModelEndpoint.chatGPTBrowser]: 'ChatGPT',
  [EModelEndpoint.gptPlugins]: 'Plugins',
  [EModelEndpoint.google]: 'Google',
  [EModelEndpoint.anthropic]: 'Anthropic',
  [EModelEndpoint.custom]: 'Custom',
};

export const defaultModels = {
  [EModelEndpoint.assistants]: [
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-0125',
    'gpt-4-turbo',
    'gpt-4-turbo-2024-04-09',
    'gpt-4-0125-preview',
    'gpt-4-turbo-preview',
    'gpt-4-1106-preview',
    'gpt-3.5-turbo-1106',
    'gpt-3.5-turbo-16k-0613',
    'gpt-3.5-turbo-16k',
    'gpt-4',
    'gpt-4-0314',
    'gpt-4-32k-0314',
    'gpt-4-0613',
    'gpt-3.5-turbo-0613',
  ],
  [EModelEndpoint.google]: [
    'gemini-pro',
    'gemini-pro-vision',
    'chat-bison',
    'chat-bison-32k',
    'codechat-bison',
    'codechat-bison-32k',
    'text-bison',
    'text-bison-32k',
    'text-unicorn',
    'code-gecko',
    'code-bison',
    'code-bison-32k',
  ],
  [EModelEndpoint.anthropic]: [
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-2.1',
    'claude-2',
    'claude-1.2',
    'claude-1',
    'claude-1-100k',
    'claude-instant-1',
    'claude-instant-1-100k',
  ],
  [EModelEndpoint.openAI]: [
    'gpt-4o',
    'gpt-3.5-turbo-0125',
    'gpt-4-turbo',
    'gpt-4-turbo-2024-04-09',
    'gpt-3.5-turbo-16k-0613',
    'gpt-3.5-turbo-16k',
    'gpt-4-turbo-preview',
    'gpt-4-0125-preview',
    'gpt-4-1106-preview',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-1106',
    'gpt-4-vision-preview',
    'gpt-4',
    'gpt-3.5-turbo-instruct-0914',
    'gpt-3.5-turbo-0613',
    'gpt-3.5-turbo-0301',
    'gpt-3.5-turbo-instruct',
    'gpt-4-0613',
    'text-davinci-003',
    'gpt-4-0314',
  ],
};

const fitlerAssistantModels = (str: string) => {
  return /gpt-4|gpt-3\\.5/i.test(str) && !/vision|instruct/i.test(str);
};

const openAIModels = defaultModels[EModelEndpoint.openAI];

export const initialModelsConfig: TModelsConfig = {
  initial: [],
  [EModelEndpoint.openAI]: openAIModels,
  [EModelEndpoint.assistants]: openAIModels.filter(fitlerAssistantModels),
  [EModelEndpoint.gptPlugins]: openAIModels,
  [EModelEndpoint.azureOpenAI]: openAIModels,
  [EModelEndpoint.bingAI]: ['BingAI', 'Sydney'],
  [EModelEndpoint.chatGPTBrowser]: ['text-davinci-002-render-sha'],
  [EModelEndpoint.google]: defaultModels[EModelEndpoint.google],
  [EModelEndpoint.anthropic]: defaultModels[EModelEndpoint.anthropic],
};

export const EndpointURLs: { [key in EModelEndpoint]: string } = {
  [EModelEndpoint.openAI]: `/api/ask/${EModelEndpoint.openAI}`,
  [EModelEndpoint.bingAI]: `/api/ask/${EModelEndpoint.bingAI}`,
  [EModelEndpoint.google]: `/api/ask/${EModelEndpoint.google}`,
  [EModelEndpoint.custom]: `/api/ask/${EModelEndpoint.custom}`,
  [EModelEndpoint.anthropic]: `/api/ask/${EModelEndpoint.anthropic}`,
  [EModelEndpoint.gptPlugins]: `/api/ask/${EModelEndpoint.gptPlugins}`,
  [EModelEndpoint.azureOpenAI]: `/api/ask/${EModelEndpoint.azureOpenAI}`,
  [EModelEndpoint.chatGPTBrowser]: `/api/ask/${EModelEndpoint.chatGPTBrowser}`,
  [EModelEndpoint.assistants]: '/api/assistants/chat',
};

export const modularEndpoints = new Set<EModelEndpoint | string>([
  EModelEndpoint.gptPlugins,
  EModelEndpoint.anthropic,
  EModelEndpoint.google,
  EModelEndpoint.openAI,
  EModelEndpoint.azureOpenAI,
  EModelEndpoint.custom,
]);

export const supportsBalanceCheck = {
  [EModelEndpoint.custom]: true,
  [EModelEndpoint.openAI]: true,
  [EModelEndpoint.anthropic]: true,
  [EModelEndpoint.gptPlugins]: true,
  [EModelEndpoint.assistants]: true,
  [EModelEndpoint.azureOpenAI]: true,
};

export const visionModels = [
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-4-vision',
  'llava',
  'llava-13b',
  'gemini-pro-vision',
  'claude-3',
  'gemini-1.5',
];
export enum VisionModes {
  generative = 'generative',
}

export function validateVisionModel({
  model,
  additionalModels = [],
  availableModels,
}: {
  model: string;
  additionalModels?: string[];
  availableModels?: string[];
}) {
  if (!model) {
    return false;
  }

  if (model === 'gpt-4-turbo-preview') {
    return false;
  }

  if (availableModels && !availableModels.includes(model)) {
    return false;
  }

  return visionModels.concat(additionalModels).some((visionModel) => model.includes(visionModel));
}

export const imageGenTools = new Set(['dalle', 'dall-e', 'stable-diffusion']);

/**
 * Enum for cache keys.
 */
export enum CacheKeys {
  /**
   * Key for the config store namespace.
   */
  CONFIG_STORE = 'configStore',
  /**
   * Key for the plugins cache.
   */
  PLUGINS = 'plugins',
  /**
   * Key for the title generation cache.
   */
  GEN_TITLE = 'genTitle',
  /**
  /**
   * Key for the tools cache.
   */
  TOOLS = 'tools',
  /**
   * Key for the model config cache.
   */
  MODELS_CONFIG = 'modelsConfig',
  /**
   * Key for the model queries cache.
   */
  MODEL_QUERIES = 'modelQueries',
  /**
   * Key for the default endpoint config cache.
   */
  ENDPOINT_CONFIG = 'endpointsConfig',
  /**
   * Key for accessing the model token config cache.
   */
  TOKEN_CONFIG = 'tokenConfig',
  /**
   * Key for the custom config cache.
   */
  CUSTOM_CONFIG = 'customConfig',
  /**
   * Key for accessing Abort Keys
   */
  ABORT_KEYS = 'abortKeys',
  /**
   * Key for the override config cache.
   */
  OVERRIDE_CONFIG = 'overrideConfig',
  /**
   * Key for the bans cache.
   */
  BANS = 'bans',
  /**
   * Key for the encoded domains cache.
   * Used by Azure OpenAI Assistants.
   */
  ENCODED_DOMAINS = 'encoded_domains',
}

/**
 * Enum for violation types, used to identify, log, and cache violations.
 */
export enum ViolationTypes {
  /**
   * File Upload Violations (exceeding limit).
   */
  FILE_UPLOAD_LIMIT = 'file_upload_limit',
  /**
   * Illegal Model Request (not available).
   */
  ILLEGAL_MODEL_REQUEST = 'illegal_model_request',
  /**
   * Token Limit Violation.
   */
  TOKEN_BALANCE = 'token_balance',
  /**
   * An issued ban.
   */
  BAN = 'ban',
}

/**
 * Enum for error message types that are not "violations" as above, used to identify client-facing errors.
 */
export enum ErrorTypes {
  /**
   * No User-provided Key.
   */
  NO_USER_KEY = 'no_user_key',
  /**
   * Expired User-provided Key.
   */
  EXPIRED_USER_KEY = 'expired_user_key',
  /**
   * Invalid User-provided Key.
   */
  INVALID_USER_KEY = 'invalid_user_key',
  /**
   * No Base URL Provided.
   */
  NO_BASE_URL = 'no_base_url',
  /**
   * Moderation error
   */
  MODERATION = 'moderation',
}

/**
 * Enum for authentication keys.
 */
export enum AuthKeys {
  /**
   * Key for the Service Account to use Vertex AI.
   */
  GOOGLE_SERVICE_KEY = 'GOOGLE_SERVICE_KEY',
  /**
   * API key to use Google Generative AI.
   *
   * Note: this is not for Environment Variables, but to access encrypted object values.
   */
  GOOGLE_API_KEY = 'GOOGLE_API_KEY',
}

/**
 * Enum for Image Detail Cost.
 *
 * **Low Res Fixed Cost:** `85`
 *
 * **High Res Calculation:**
 *
 * Number of `512px` Tiles * `170` + `85` (Additional Cost)
 */
export enum ImageDetailCost {
  /**
   * Low resolution is a fixed value.
   */
  LOW = 85,
  /**
   * High resolution Cost Per Tile
   */
  HIGH = 170,
  /**
   * Additional Cost added to High Resolution Total Cost
   */
  ADDITIONAL = 85,
}

/**
 * Tab values for Settings Dialog
 */
export enum SettingsTabValues {
  /**
   * Tab for General Settings
   */
  GENERAL = 'general',
  /**
   * Tab for Messages Settings
   */
  MESSAGES = 'messages',
  /**
   * Tab for Beta Features
   */
  BETA = 'beta',
  /**
   * Tab for Data Controls
   */
  DATA = 'data',
  /**
   * Tab for Account Settings
   */
  ACCOUNT = 'account',
}

/** Enum for app-wide constants */
export enum Constants {
  /** Key for the app's version. */
  VERSION = 'v0.7.2',
  /** Key for the Custom Config's version (librechat.yaml). */
  CONFIG_VERSION = '1.1.0',
  /** Standard value for the first message's `parentMessageId` value, to indicate no parent exists. */
  NO_PARENT = '00000000-0000-0000-0000-000000000000',
  /** Fixed, encoded domain length for Azure OpenAI Assistants Function name parsing. */
  ENCODED_DOMAIN_LENGTH = 10,
  /** Identifier for using current_model in multi-model requests. */
  CURRENT_MODEL = 'current_model',
}

export enum LocalStorageKeys {
  /** Key for the admin defined App Title */
  APP_TITLE = 'appTitle',
  /** Key for the last conversation setup. */
  LAST_CONVO_SETUP = 'lastConversationSetup',
  /** Key for the last BingAI Settings */
  LAST_BING = 'lastBingSettings',
  /** Key for the last selected model. */
  LAST_MODEL = 'lastSelectedModel',
  /** Key for the last selected tools. */
  LAST_TOOLS = 'lastSelectedTools',
  /** Key for the last selected spec by name*/
  LAST_SPEC = 'lastSelectedSpec',
  /** Key for temporary files to delete */
  FILES_TO_DELETE = 'filesToDelete',
  /** Prefix key for the last selected assistant ID by index */
  ASST_ID_PREFIX = 'assistant_id__',
  /** Key for the last selected fork setting */
  FORK_SETTING = 'forkSetting',
  /** Key for remembering the last selected option, instead of manually selecting */
  REMEMBER_FORK_OPTION = 'rememberForkOption',
  /** Key for remembering the split at target fork option modifier */
  FORK_SPLIT_AT_TARGET = 'splitAtTarget',
}

export enum ForkOptions {
  /** Key for direct path option */
  DIRECT_PATH = 'directPath',
  /** Key for including branches */
  INCLUDE_BRANCHES = 'includeBranches',
  /** Key for target level fork (default) */
  TARGET_LEVEL = '',
}

/**
 * Enum for Cohere related constants
 */
export enum CohereConstants {
  /**
   * Cohere API Endpoint, for special handling
   */
  API_URL = 'https://api.cohere.ai/v1',
  /**
   * Role for "USER" messages
   */
  ROLE_USER = 'USER',
  /**
   * Role for "SYSTEM" messages
   */
  ROLE_SYSTEM = 'SYSTEM',
  /**
   * Role for "CHATBOT" messages
   */
  ROLE_CHATBOT = 'CHATBOT',
  /**
   * Title message as required by Cohere
   */
  TITLE_MESSAGE = 'TITLE:',
}
