/* eslint-disable max-len */
import { z } from 'zod';
import { EModelEndpoint, eModelEndpointSchema } from './schemas';
import { fileConfigSchema } from './file-config';
import { FileSources } from './types/files';

export const defaultSocialLogins = ['google', 'facebook', 'openid', 'github', 'discord'];

export const fileSourceSchema = z.nativeEnum(FileSources);

export const modelConfigSchema = z
  .object({
    deploymentName: z.string().optional(),
    version: z.string().optional(),
  })
  .or(z.boolean());

export type TAzureModelConfig = z.infer<typeof modelConfigSchema>;

export const azureBaseSchema = z.object({
  apiKey: z.string(),
  serverless: z.boolean().optional(),
  instanceName: z.string().optional(),
  deploymentName: z.string().optional(),
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

export const assistantEndpointSchema = z.object({
  /* assistants specific */
  disableBuilder: z.boolean().optional(),
  pollIntervalMs: z.number().optional(),
  timeoutMs: z.number().optional(),
  supportedIds: z.array(z.string()).min(1).optional(),
  excludedIds: z.array(z.string()).min(1).optional(),
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

export const azureEndpointSchema = z
  .object({
    groups: azureGroupConfigsSchema,
    plugins: z.boolean().optional(),
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
  TValidatedAzureConfig;

export const rateLimitSchema = z.object({
  fileUploads: z
    .object({
      ipMax: z.number().optional(),
      ipWindowInMinutes: z.number().optional(),
      userMax: z.number().optional(),
      userWindowInMinutes: z.number().optional(),
    })
    .optional(),
});

export const configSchema = z.object({
  version: z.string(),
  cache: z.boolean(),
  fileStrategy: fileSourceSchema.optional(),
  registration: z
    .object({
      socialLogins: z.array(z.string()).optional(),
      allowedDomains: z.array(z.string()).optional(),
    })
    .optional(),
  rateLimits: rateLimitSchema.optional(),
  fileConfig: fileConfigSchema.optional(),
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

export type TCustomConfig = z.infer<typeof configSchema>;

export enum KnownEndpoints {
  mistral = 'mistral',
  openrouter = 'openrouter',
  groq = 'groq',
  anyscale = 'anyscale',
  fireworks = 'fireworks',
  ollama = 'ollama',
  perplexity = 'perplexity',
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
    'gpt-3.5-turbo-0125',
    'gpt-4-0125-preview',
    'gpt-4-turbo-preview',
    'gpt-4-1106-preview',
    'gpt-3.5-turbo-1106',
    'gpt-3.5-turbo-16k-0613',
    'gpt-3.5-turbo-16k',
    'gpt-3.5-turbo',
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
    'claude-2.1',
    'claude-2',
    'claude-1.2',
    'claude-1',
    'claude-1-100k',
    'claude-instant-1',
    'claude-instant-1-100k',
  ],
  [EModelEndpoint.openAI]: [
    'gpt-3.5-turbo-0125',
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

export const supportsRetrieval = new Set([
  'gpt-3.5-turbo-0125',
  'gpt-4-0125-preview',
  'gpt-4-turbo-preview',
  'gpt-4-1106-preview',
  'gpt-3.5-turbo-1106',
]);

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
  [EModelEndpoint.openAI]: true,
  [EModelEndpoint.anthropic]: true,
  [EModelEndpoint.azureOpenAI]: true,
  [EModelEndpoint.gptPlugins]: true,
  [EModelEndpoint.custom]: true,
};

export const visionModels = ['gpt-4-vision', 'llava-13b', 'gemini-pro-vision', 'claude-3'];

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

/**
 * Enum for app-wide constants
 */
export enum Constants {
  /**
   * Key for the app's version.
   */
  VERSION = 'v0.6.10',
  /**
   * Key for the Custom Config's version (librechat.yaml).
   */
  CONFIG_VERSION = '1.0.4',
  /**
   * Standard value for the first message's `parentMessageId` value, to indicate no parent exists.
   */
  NO_PARENT = '00000000-0000-0000-0000-000000000000',
}

export const defaultOrderQuery: {
  order: 'asc';
} = {
  order: 'asc',
};
