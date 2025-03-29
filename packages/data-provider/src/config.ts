import type { ZodError } from 'zod';
import { z } from 'zod';
import { fileConfigSchema } from './file-config';
import { MCPServersSchema } from './mcp';
import { specsConfigSchema, TSpecsConfig } from './models';
import { EModelEndpoint, eModelEndpointSchema } from './schemas';
import type { TModelsConfig } from './types';
import { FileSources } from './types/files';

export const defaultSocialLogins = ['google', 'facebook', 'openid', 'github', 'discord'];

export const defaultRetrievalModels = [
  'gpt-4o',
  'o1-preview-2024-09-12',
  'o1-preview',
  'o1-mini-2024-09-12',
  'o1-mini',
  'o3-mini',
  'chatgpt-4o-latest',
  'gpt-4o-2024-05-13',
  'gpt-4o-2024-08-06',
  'gpt-4o-mini',
  'gpt-4o-mini-2024-07-18',
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

export const excludedKeys = new Set([
  'conversationId',
  'title',
  'iconURL',
  'greeting',
  'endpoint',
  'endpointType',
  'createdAt',
  'updatedAt',
  'expiredAt',
  'messages',
  'isArchived',
  'tags',
  'user',
  '__v',
  '_id',
  'tools',
  'model',
  'files',
  'spec',
]);

export enum SettingsViews {
  default = 'default',
  advanced = 'advanced',
}

export const fileSourceSchema = z.nativeEnum(FileSources);

// Helper type to extract the shape of the Zod object schema
type SchemaShape<T> = T extends z.ZodObject<infer U> ? U : never;

// Helper type to determine the default value or undefined based on whether the field has a default
type DefaultValue<T> =
  T extends z.ZodDefault<z.ZodTypeAny> ? ReturnType<T['_def']['defaultValue']> : undefined;

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

export type TAzureModelGroupMap = Record<string, TAzureModelMapSchema | undefined>;
export type TAzureGroupMap = Record<
  string,
  (TAzureBaseSchema & { models: Record<string, TAzureModelConfig | undefined> }) | undefined
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

export enum AgentCapabilities {
  hide_sequential_outputs = 'hide_sequential_outputs',
  end_after_tools = 'end_after_tools',
  execute_code = 'execute_code',
  file_search = 'file_search',
  artifacts = 'artifacts',
  actions = 'actions',
  tools = 'tools',
  chain = 'chain',
  ocr = 'ocr',
}

export const defaultAssistantsVersion = {
  [EModelEndpoint.assistants]: 2,
  [EModelEndpoint.azureAssistants]: 1,
};

export const baseEndpointSchema = z.object({
  streamRate: z.number().optional(),
  baseURL: z.string().optional(),
  titlePrompt: z.string().optional(),
  titleModel: z.string().optional(),
});

export type TBaseEndpoint = z.infer<typeof baseEndpointSchema>;

export const bedrockEndpointSchema = baseEndpointSchema.merge(
  z.object({
    availableRegions: z.array(z.string()).optional(),
  }),
);

export const assistantEndpointSchema = baseEndpointSchema.merge(
  z.object({
    /* assistants specific */
    disableBuilder: z.boolean().optional(),
    pollIntervalMs: z.number().optional(),
    timeoutMs: z.number().optional(),
    version: z.union([z.string(), z.number()]).default(2),
    supportedIds: z.array(z.string()).min(1).optional(),
    excludedIds: z.array(z.string()).min(1).optional(),
    privateAssistants: z.boolean().optional(),
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
    models: z
      .object({
        default: z.array(z.string()).min(1),
        fetch: z.boolean().optional(),
        userIdQuery: z.boolean().optional(),
      })
      .optional(),
    titleConvo: z.boolean().optional(),
    titleMethod: z.union([z.literal('completion'), z.literal('functions')]).optional(),
    headers: z.record(z.any()).optional(),
  }),
);

export type TAssistantEndpoint = z.infer<typeof assistantEndpointSchema>;

export const agentsEndpointSChema = baseEndpointSchema.merge(
  z.object({
    /* agents specific */
    recursionLimit: z.number().optional(),
    disableBuilder: z.boolean().optional(),
    maxRecursionLimit: z.number().optional(),
    capabilities: z
      .array(z.nativeEnum(AgentCapabilities))
      .optional()
      .default([
        AgentCapabilities.execute_code,
        AgentCapabilities.file_search,
        AgentCapabilities.artifacts,
        AgentCapabilities.actions,
        AgentCapabilities.tools,
        AgentCapabilities.ocr,
        AgentCapabilities.chain,
      ]),
  }),
);

export type TAgentsEndpoint = z.infer<typeof agentsEndpointSChema>;

export const endpointSchema = baseEndpointSchema.merge(
  z.object({
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
    summarize: z.boolean().optional(),
    summaryModel: z.string().optional(),
    forcePrompt: z.boolean().optional(),
    modelDisplayLabel: z.string().optional(),
    headers: z.record(z.any()).optional(),
    addParams: z.record(z.any()).optional(),
    dropParams: z.array(z.string()).optional(),
    customOrder: z.number().optional(),
    directEndpoint: z.boolean().optional(),
    titleMessageRole: z.string().optional(),
  }),
);

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
        streamRate: true,
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

const ttsOpenaiSchema = z.object({
  url: z.string().optional(),
  apiKey: z.string(),
  model: z.string(),
  voices: z.array(z.string()),
});

const ttsAzureOpenAISchema = z.object({
  instanceName: z.string(),
  apiKey: z.string(),
  deploymentName: z.string(),
  apiVersion: z.string(),
  model: z.string(),
  voices: z.array(z.string()),
});

const ttsElevenLabsSchema = z.object({
  url: z.string().optional(),
  websocketUrl: z.string().optional(),
  apiKey: z.string(),
  model: z.string(),
  voices: z.array(z.string()),
  voice_settings: z
    .object({
      similarity_boost: z.number().optional(),
      stability: z.number().optional(),
      style: z.number().optional(),
      use_speaker_boost: z.boolean().optional(),
    })
    .optional(),
  pronunciation_dictionary_locators: z.array(z.string()).optional(),
});

const ttsLocalaiSchema = z.object({
  url: z.string(),
  apiKey: z.string().optional(),
  voices: z.array(z.string()),
  backend: z.string(),
});

const ttsSchema = z.object({
  openai: ttsOpenaiSchema.optional(),
  azureOpenAI: ttsAzureOpenAISchema.optional(),
  elevenlabs: ttsElevenLabsSchema.optional(),
  localai: ttsLocalaiSchema.optional(),
});

const sttOpenaiSchema = z.object({
  url: z.string().optional(),
  apiKey: z.string(),
  model: z.string(),
});

const sttAzureOpenAISchema = z.object({
  instanceName: z.string(),
  apiKey: z.string(),
  deploymentName: z.string(),
  apiVersion: z.string(),
});

const sttSchema = z.object({
  openai: sttOpenaiSchema.optional(),
  azureOpenAI: sttAzureOpenAISchema.optional(),
});

const speechTab = z
  .object({
    conversationMode: z.boolean().optional(),
    advancedMode: z.boolean().optional(),
    speechToText: z
      .boolean()
      .optional()
      .or(
        z.object({
          engineSTT: z.string().optional(),
          languageSTT: z.string().optional(),
          autoTranscribeAudio: z.boolean().optional(),
          decibelValue: z.number().optional(),
          autoSendText: z.number().optional(),
        }),
      )
      .optional(),
    textToSpeech: z
      .boolean()
      .optional()
      .or(
        z.object({
          engineTTS: z.string().optional(),
          voice: z.string().optional(),
          languageTTS: z.string().optional(),
          automaticPlayback: z.boolean().optional(),
          playbackRate: z.number().optional(),
          cacheTTS: z.boolean().optional(),
        }),
      )
      .optional(),
  })
  .optional();

export enum RateLimitPrefix {
  FILE_UPLOAD = 'FILE_UPLOAD',
  IMPORT = 'IMPORT',
  TTS = 'TTS',
  STT = 'STT',
}

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
  tts: z
    .object({
      ipMax: z.number().optional(),
      ipWindowInMinutes: z.number().optional(),
      userMax: z.number().optional(),
      userWindowInMinutes: z.number().optional(),
    })
    .optional(),
  stt: z
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

const termsOfServiceSchema = z.object({
  externalUrl: z.string().optional(),
  openNewTab: z.boolean().optional(),
  modalAcceptance: z.boolean().optional(),
  modalTitle: z.string().optional(),
  modalContent: z.string().or(z.array(z.string())).optional(),
});

export type TTermsOfService = z.infer<typeof termsOfServiceSchema>;

export const intefaceSchema = z
  .object({
    privacyPolicy: z
      .object({
        externalUrl: z.string().optional(),
        openNewTab: z.boolean().optional(),
      })
      .optional(),
    termsOfService: termsOfServiceSchema.optional(),
    customWelcome: z.string().optional(),
    endpointsMenu: z.boolean().optional(),
    modelSelect: z.boolean().optional(),
    parameters: z.boolean().optional(),
    sidePanel: z.boolean().optional(),
    multiConvo: z.boolean().optional(),
    bookmarks: z.boolean().optional(),
    presets: z.boolean().optional(),
    prompts: z.boolean().optional(),
    agents: z.boolean().optional(),
    temporaryChat: z.boolean().optional(),
    runCode: z.boolean().optional(),
  })
  .default({
    endpointsMenu: true,
    modelSelect: true,
    parameters: true,
    sidePanel: true,
    presets: true,
    multiConvo: true,
    bookmarks: true,
    prompts: true,
    agents: true,
    temporaryChat: true,
    runCode: true,
  });

export type TInterfaceConfig = z.infer<typeof intefaceSchema>;
export type TBalanceConfig = z.infer<typeof balanceSchema>;

export type TStartupConfig = {
  appTitle: string;
  socialLogins?: string[];
  interface?: TInterfaceConfig;
  balance?: TBalanceConfig;
  discordLoginEnabled: boolean;
  facebookLoginEnabled: boolean;
  githubLoginEnabled: boolean;
  googleLoginEnabled: boolean;
  openidLoginEnabled: boolean;
  appleLoginEnabled: boolean;
  openidLabel: string;
  openidImageUrl: string;
  openidAutoRedirect: boolean;
  /** LDAP Auth Configuration */
  ldap?: {
    /** LDAP enabled */
    enabled: boolean;
    /** Whether LDAP uses username vs. email */
    username?: boolean;
  };
  serverDomain: string;
  emailLoginEnabled: boolean;
  registrationEnabled: boolean;
  socialLoginEnabled: boolean;
  passwordResetEnabled: boolean;
  emailEnabled: boolean;
  showBirthdayIcon: boolean;
  helpAndFaqURL: string;
  customFooter?: string;
  modelSpecs?: TSpecsConfig;
  sharedLinksEnabled: boolean;
  publicSharedLinksEnabled: boolean;
  analyticsGtmId?: string;
  instanceProjectId: string;
  bundlerURL?: string;
};

export enum OCRStrategy {
  MISTRAL_OCR = 'mistral_ocr',
  CUSTOM_OCR = 'custom_ocr',
}

export const ocrSchema = z.object({
  mistralModel: z.string().optional(),
  apiKey: z.string().optional().default('OCR_API_KEY'),
  baseURL: z.string().optional().default('OCR_BASEURL'),
  strategy: z.nativeEnum(OCRStrategy).default(OCRStrategy.MISTRAL_OCR),
});

export const balanceSchema = z.object({
  enabled: z.boolean().optional().default(false),
  startBalance: z.number().optional().default(20000),
  autoRefillEnabled: z.boolean().optional().default(false),
  refillIntervalValue: z.number().optional().default(30),
  refillIntervalUnit: z
    .enum(['seconds', 'minutes', 'hours', 'days', 'weeks', 'months'])
    .optional()
    .default('days'),
  refillAmount: z.number().optional().default(10000),
});

export const configSchema = z.object({
  version: z.string(),
  cache: z.boolean().default(true),
  ocr: ocrSchema.optional(),
  secureImageLinks: z.boolean().optional(),
  imageOutputType: z.nativeEnum(EImageOutputType).default(EImageOutputType.PNG),
  includedTools: z.array(z.string()).optional(),
  filteredTools: z.array(z.string()).optional(),
  mcpServers: MCPServersSchema.optional(),
  interface: intefaceSchema,
  fileStrategy: fileSourceSchema.default(FileSources.local),
  actions: z
    .object({
      allowedDomains: z.array(z.string()).optional(),
    })
    .optional(),
  registration: z
    .object({
      socialLogins: z.array(z.string()).optional(),
      allowedDomains: z.array(z.string()).optional(),
    })
    .default({ socialLogins: defaultSocialLogins }),
  balance: balanceSchema.optional(),
  speech: z
    .object({
      tts: ttsSchema.optional(),
      stt: sttSchema.optional(),
      speechTab: speechTab.optional(),
    })
    .optional(),
  rateLimits: rateLimitSchema.optional(),
  fileConfig: fileConfigSchema.optional(),
  modelSpecs: specsConfigSchema.optional(),
  endpoints: z
    .object({
      all: baseEndpointSchema.optional(),
      [EModelEndpoint.openAI]: baseEndpointSchema.optional(),
      [EModelEndpoint.google]: baseEndpointSchema.optional(),
      [EModelEndpoint.anthropic]: baseEndpointSchema.optional(),
      [EModelEndpoint.gptPlugins]: baseEndpointSchema.optional(),
      [EModelEndpoint.azureOpenAI]: azureEndpointSchema.optional(),
      [EModelEndpoint.azureAssistants]: assistantEndpointSchema.optional(),
      [EModelEndpoint.assistants]: assistantEndpointSchema.optional(),
      [EModelEndpoint.agents]: agentsEndpointSChema.optional(),
      [EModelEndpoint.custom]: z.array(endpointSchema.partial()).optional(),
      [EModelEndpoint.bedrock]: baseEndpointSchema.optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one `endpoints` field must be provided.',
    })
    .optional(),
});

export const getConfigDefaults = () => getSchemaDefaults(configSchema);

export type TCustomConfig = z.infer<typeof configSchema>;

export type TProviderSchema =
  | z.infer<typeof ttsOpenaiSchema>
  | z.infer<typeof ttsElevenLabsSchema>
  | z.infer<typeof ttsLocalaiSchema>
  | undefined;

export enum KnownEndpoints {
  anyscale = 'anyscale',
  apipie = 'apipie',
  cohere = 'cohere',
  fireworks = 'fireworks',
  deepseek = 'deepseek',
  groq = 'groq',
  huggingface = 'huggingface',
  mistral = 'mistral',
  mlx = 'mlx',
  ollama = 'ollama',
  openrouter = 'openrouter',
  perplexity = 'perplexity',
  requesty = 'requesty',
  shuttleai = 'shuttleai',
  'together.ai' = 'together.ai',
  unify = 'unify',
  xai = 'xai',
}

export enum FetchTokenConfig {
  openrouter = KnownEndpoints.openrouter,
  requesty = KnownEndpoints.requesty,
}

export const defaultEndpoints: EModelEndpoint[] = [
  EModelEndpoint.openAI,
  EModelEndpoint.assistants,
  EModelEndpoint.azureAssistants,
  EModelEndpoint.azureOpenAI,
  EModelEndpoint.agents,
  EModelEndpoint.chatGPTBrowser,
  EModelEndpoint.gptPlugins,
  EModelEndpoint.google,
  EModelEndpoint.anthropic,
  EModelEndpoint.custom,
  EModelEndpoint.bedrock,
];

export const alternateName = {
  [EModelEndpoint.openAI]: 'OpenAI',
  [EModelEndpoint.assistants]: 'Assistants',
  [EModelEndpoint.agents]: 'Agents',
  [EModelEndpoint.azureAssistants]: 'Azure Assistants',
  [EModelEndpoint.azureOpenAI]: 'Azure OpenAI',
  [EModelEndpoint.chatGPTBrowser]: 'ChatGPT',
  [EModelEndpoint.gptPlugins]: 'Plugins',
  [EModelEndpoint.google]: 'Google',
  [EModelEndpoint.anthropic]: 'Anthropic',
  [EModelEndpoint.custom]: 'Custom',
  [EModelEndpoint.bedrock]: 'AWS Bedrock',
  [KnownEndpoints.ollama]: 'Ollama',
  [KnownEndpoints.deepseek]: 'DeepSeek',
  [KnownEndpoints.xai]: 'xAI',
};

const sharedOpenAIModels = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.5-preview',
  'gpt-4.5-preview-2025-02-27',
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
];

const sharedAnthropicModels = [
  'claude-3-7-sonnet-latest',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-haiku-20241022',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620',
  'claude-3-5-sonnet-latest',
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
];

export const bedrockModels = [
  'anthropic.claude-3-5-sonnet-20241022-v2:0',
  'anthropic.claude-3-5-sonnet-20240620-v1:0',
  'anthropic.claude-3-5-haiku-20241022-v1:0',
  'anthropic.claude-3-haiku-20240307-v1:0',
  'anthropic.claude-3-opus-20240229-v1:0',
  'anthropic.claude-3-sonnet-20240229-v1:0',
  'anthropic.claude-v2',
  'anthropic.claude-v2:1',
  'anthropic.claude-instant-v1',
  // 'cohere.command-text-v14', // no conversation history
  // 'cohere.command-light-text-v14', // no conversation history
  'cohere.command-r-v1:0',
  'cohere.command-r-plus-v1:0',
  'meta.llama2-13b-chat-v1',
  'meta.llama2-70b-chat-v1',
  'meta.llama3-8b-instruct-v1:0',
  'meta.llama3-70b-instruct-v1:0',
  'meta.llama3-1-8b-instruct-v1:0',
  'meta.llama3-1-70b-instruct-v1:0',
  'meta.llama3-1-405b-instruct-v1:0',
  'mistral.mistral-7b-instruct-v0:2',
  'mistral.mixtral-8x7b-instruct-v0:1',
  'mistral.mistral-large-2402-v1:0',
  'mistral.mistral-large-2407-v1:0',
  'mistral.mistral-small-2402-v1:0',
  'ai21.jamba-instruct-v1:0',
  // 'ai21.j2-mid-v1', // no streaming
  // 'ai21.j2-ultra-v1', no conversation history
  'amazon.titan-text-lite-v1',
  'amazon.titan-text-express-v1',
  'amazon.titan-text-premier-v1:0',
];

export const defaultModels = {
  [EModelEndpoint.azureAssistants]: sharedOpenAIModels,
  [EModelEndpoint.assistants]: [...sharedOpenAIModels, 'chatgpt-4o-latest'],
  [EModelEndpoint.agents]: sharedOpenAIModels, // TODO: Add agent models (agentsModels)
  [EModelEndpoint.google]: [
    // Shared Google Models between Vertex AI & Gen AI
    // Gemini 2.0 Models
    'gemini-2.0-flash-001',
    'gemini-2.0-flash-exp',
    'gemini-2.0-flash-lite',
    'gemini-2.0-pro-exp-02-05',
    // Gemini 1.5 Models
    'gemini-1.5-flash-001',
    'gemini-1.5-flash-002',
    'gemini-1.5-pro-001',
    'gemini-1.5-pro-002',
    // Gemini 1.0 Models
    'gemini-1.0-pro-001',
  ],
  [EModelEndpoint.anthropic]: sharedAnthropicModels,
  [EModelEndpoint.openAI]: [
    ...sharedOpenAIModels,
    'chatgpt-4o-latest',
    'gpt-4-vision-preview',
    'gpt-3.5-turbo-instruct-0914',
    'gpt-3.5-turbo-instruct',
  ],
  [EModelEndpoint.bedrock]: bedrockModels,
};

const fitlerAssistantModels = (str: string) => {
  return /gpt-4|gpt-3\\.5/i.test(str) && !/vision|instruct/i.test(str);
};

const openAIModels = defaultModels[EModelEndpoint.openAI];

export const initialModelsConfig: TModelsConfig = {
  initial: [],
  [EModelEndpoint.openAI]: openAIModels,
  [EModelEndpoint.assistants]: openAIModels.filter(fitlerAssistantModels),
  [EModelEndpoint.agents]: openAIModels, // TODO: Add agent models (agentsModels)
  [EModelEndpoint.gptPlugins]: openAIModels,
  [EModelEndpoint.azureOpenAI]: openAIModels,
  [EModelEndpoint.chatGPTBrowser]: ['text-davinci-002-render-sha'],
  [EModelEndpoint.google]: defaultModels[EModelEndpoint.google],
  [EModelEndpoint.anthropic]: defaultModels[EModelEndpoint.anthropic],
  [EModelEndpoint.bedrock]: defaultModels[EModelEndpoint.bedrock],
};

export const EndpointURLs: { [key in EModelEndpoint]: string } = {
  [EModelEndpoint.openAI]: `/api/ask/${EModelEndpoint.openAI}`,
  [EModelEndpoint.google]: `/api/ask/${EModelEndpoint.google}`,
  [EModelEndpoint.custom]: `/api/ask/${EModelEndpoint.custom}`,
  [EModelEndpoint.anthropic]: `/api/ask/${EModelEndpoint.anthropic}`,
  [EModelEndpoint.gptPlugins]: `/api/ask/${EModelEndpoint.gptPlugins}`,
  [EModelEndpoint.azureOpenAI]: `/api/ask/${EModelEndpoint.azureOpenAI}`,
  [EModelEndpoint.chatGPTBrowser]: `/api/ask/${EModelEndpoint.chatGPTBrowser}`,
  [EModelEndpoint.azureAssistants]: '/api/assistants/v1/chat',
  [EModelEndpoint.assistants]: '/api/assistants/v2/chat',
  [EModelEndpoint.agents]: `/api/${EModelEndpoint.agents}/chat`,
  [EModelEndpoint.bedrock]: `/api/${EModelEndpoint.bedrock}/chat`,
};

export const modularEndpoints = new Set<EModelEndpoint | string>([
  EModelEndpoint.gptPlugins,
  EModelEndpoint.anthropic,
  EModelEndpoint.google,
  EModelEndpoint.openAI,
  EModelEndpoint.azureOpenAI,
  EModelEndpoint.custom,
  EModelEndpoint.agents,
  EModelEndpoint.bedrock,
]);

export const supportsBalanceCheck = {
  [EModelEndpoint.custom]: true,
  [EModelEndpoint.openAI]: true,
  [EModelEndpoint.anthropic]: true,
  [EModelEndpoint.gptPlugins]: true,
  [EModelEndpoint.assistants]: true,
  [EModelEndpoint.agents]: true,
  [EModelEndpoint.azureAssistants]: true,
  [EModelEndpoint.azureOpenAI]: true,
  [EModelEndpoint.bedrock]: true,
};

export const visionModels = [
  'qwen-vl',
  'grok-vision',
  'grok-2-vision',
  'grok-3',
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-4-vision',
  'o1',
  'gpt-4.5',
  'llava',
  'llava-13b',
  'gemini-pro-vision',
  'claude-3',
  'gemini-exp',
  'gemini-1.5',
  'gemini-2.0',
  'moondream',
  'llama3.2-vision',
  'llama-3.2-11b-vision',
  'llama-3-2-11b-vision',
  'llama-3.2-90b-vision',
  'llama-3-2-90b-vision',
];
export enum VisionModes {
  generative = 'generative',
  agents = 'agents',
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

  if (model.includes('gpt-4-turbo-preview') || model.includes('o1-mini')) {
    return false;
  }

  if (availableModels && !availableModels.includes(model)) {
    return false;
  }

  return visionModels.concat(additionalModels).some((visionModel) => model.includes(visionModel));
}

export const imageGenTools = new Set(['dalle', 'dall-e', 'stable-diffusion', 'flux']);

/**
 * Enum for collections using infinite queries
 */
export enum InfiniteCollections {
  /**
   * Collection for Prompt Groups
   */
  PROMPT_GROUPS = 'promptGroups',
  /**
   * Collection for Shared Links
   */
  SHARED_LINKS = 'sharedLinks',
}

/**
 * Enum for time intervals
 */
export enum Time {
  ONE_HOUR = 3600000,
  THIRTY_MINUTES = 1800000,
  TEN_MINUTES = 600000,
  FIVE_MINUTES = 300000,
  TWO_MINUTES = 120000,
  ONE_MINUTE = 60000,
  THIRTY_SECONDS = 30000,
}

/**
 * Enum for cache keys.
 */
export enum CacheKeys {
  /**
   * Key for the config store namespace.
   */
  CONFIG_STORE = 'configStore',
  /**
   * Key for the config store namespace.
   */
  ROLES = 'roles',
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
   * Key for the default startup config cache.
   */
  STARTUP_CONFIG = 'startupConfig',
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
  /**
   * Key for the cached audio run Ids.
   */
  AUDIO_RUNS = 'audioRuns',
  /**
   * Key for in-progress messages.
   */
  MESSAGES = 'messages',
  /**
   * Key for in-progress flow states.
   */
  FLOWS = 'flows',
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
  /**
   * TTS Request Limit Violation.
   */
  TTS_LIMIT = 'tts_limit',
  /**
   * STT Request Limit Violation.
   */
  STT_LIMIT = 'stt_limit',
  /**
   * Reset Password Limit Violation.
   */
  RESET_PASSWORD_LIMIT = 'reset_password_limit',
  /**
   * Verify Email Limit Violation.
   */
  VERIFY_EMAIL_LIMIT = 'verify_email_limit',
  /**
   * Verify Conversation Access violation.
   */
  CONVO_ACCESS = 'convo_access',
  /**
   * Tool Call Limit Violation.
   */
  TOOL_CALL_LIMIT = 'tool_call_limit',
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
  /**
   * Prompt exceeds max length
   */
  INPUT_LENGTH = 'INPUT_LENGTH',
  /**
   * Invalid request error, API rejected request
   */
  INVALID_REQUEST = 'invalid_request_error',
  /**
   * Invalid action request error, likely not on list of allowed domains
   */
  INVALID_ACTION = 'invalid_action_error',
  /**
   * Invalid request error, API rejected request
   */
  NO_SYSTEM_MESSAGES = 'no_system_messages',
  /**
   * Google provider returned an error
   */
  GOOGLE_ERROR = 'google_error',
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
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
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
   * Tab for Chat Settings
   */
  CHAT = 'chat',
  /**
   * Tab for Speech Settings
   */
  SPEECH = 'speech',
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
  /**
   * Chat input commands
   */
  COMMANDS = 'commands',
}

export enum STTProviders {
  /**
   * Provider for OpenAI STT
   */
  OPENAI = 'openai',
  /**
   * Provider for Microsoft Azure STT
   */
  AZURE_OPENAI = 'azureOpenAI',
}

export enum TTSProviders {
  /**
   * Provider for OpenAI TTS
   */
  OPENAI = 'openai',
  /**
   * Provider for Microsoft Azure OpenAI TTS
   */
  AZURE_OPENAI = 'azureOpenAI',
  /**
   * Provider for ElevenLabs TTS
   */
  ELEVENLABS = 'elevenlabs',
  /**
   * Provider for LocalAI TTS
   */
  LOCALAI = 'localai',
}

/** Enum for app-wide constants */
export enum Constants {
  /** Key for the app's version. */
  VERSION = 'v0.7.7',
  /** Key for the Custom Config's version (librechat.yaml). */
  CONFIG_VERSION = '1.2.3',
  /** Standard value for the first message's `parentMessageId` value, to indicate no parent exists. */
  NO_PARENT = '00000000-0000-0000-0000-000000000000',
  /** Standard value for the initial conversationId before a request is sent */
  NEW_CONVO = 'new',
  /** Standard value for the conversationId used for search queries */
  SEARCH = 'search',
  /** Fixed, encoded domain length for Azure OpenAI Assistants Function name parsing. */
  ENCODED_DOMAIN_LENGTH = 10,
  /** Identifier for using current_model in multi-model requests. */
  CURRENT_MODEL = 'current_model',
  /** Common divider for text values */
  COMMON_DIVIDER = '__',
  /** Max length for commands */
  COMMANDS_MAX_LENGTH = 56,
  /** Default Stream Rate (ms) */
  DEFAULT_STREAM_RATE = 1,
  /** Saved Tag */
  SAVED_TAG = 'Saved',
  /** Max number of Conversation starters for Agents/Assistants */
  MAX_CONVO_STARTERS = 4,
  /** Global/instance Project Name */
  GLOBAL_PROJECT_NAME = 'instance',
  /** Delimiter for MCP tools */
  mcp_delimiter = '_mcp_',
}

export enum LocalStorageKeys {
  /** Key for the admin defined App Title */
  APP_TITLE = 'appTitle',
  /** Key for the last conversation setup. */
  LAST_CONVO_SETUP = 'lastConversationSetup',
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
  /** Prefix key for the last selected agent ID by index */
  AGENT_ID_PREFIX = 'agent_id__',
  /** Key for the last selected fork setting */
  FORK_SETTING = 'forkSetting',
  /** Key for remembering the last selected option, instead of manually selecting */
  REMEMBER_FORK_OPTION = 'rememberDefaultFork',
  /** Key for remembering the split at target fork option modifier */
  FORK_SPLIT_AT_TARGET = 'splitAtTarget',
  /** Key for saving text drafts */
  TEXT_DRAFT = 'textDraft_',
  /** Key for saving file drafts */
  FILES_DRAFT = 'filesDraft_',
  /** Key for last Selected Prompt Category */
  LAST_PROMPT_CATEGORY = 'lastPromptCategory',
  /** Key for rendering User Messages as Markdown */
  ENABLE_USER_MSG_MARKDOWN = 'enableUserMsgMarkdown',
  /** Key for displaying analysis tool code input */
  SHOW_ANALYSIS_CODE = 'showAnalysisCode',
}

export enum ForkOptions {
  /** Key for direct path option */
  DIRECT_PATH = 'directPath',
  /** Key for including branches */
  INCLUDE_BRANCHES = 'includeBranches',
  /** Key for target level fork (default) */
  TARGET_LEVEL = 'targetLevel',
  /** Default option */
  DEFAULT = 'default',
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

export enum SystemCategories {
  ALL = 'sys__all__sys',
  MY_PROMPTS = 'sys__my__prompts__sys',
  NO_CATEGORY = 'sys__no__category__sys',
  SHARED_PROMPTS = 'sys__shared__prompts__sys',
}

export const providerEndpointMap = {
  [EModelEndpoint.openAI]: EModelEndpoint.openAI,
  [EModelEndpoint.bedrock]: EModelEndpoint.bedrock,
  [EModelEndpoint.anthropic]: EModelEndpoint.anthropic,
  [EModelEndpoint.azureOpenAI]: EModelEndpoint.azureOpenAI,
};
