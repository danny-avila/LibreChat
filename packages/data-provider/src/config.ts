import { z } from 'zod';
import type { ZodError } from 'zod';
import type { TEndpointsConfig, TModelsConfig, TConfig } from './types';
import { EModelEndpoint, eModelEndpointSchema } from './schemas';
import { specsConfigSchema, TSpecsConfig } from './models';
import { fileConfigSchema } from './file-config';
import { apiBaseUrl } from './api-endpoints';
import { FileSources } from './types/files';
import { MCPServersSchema } from './mcp';

export const defaultSocialLogins = ['google', 'facebook', 'openid', 'github', 'discord', 'saml'];

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
  'disableParams',
]);

export enum SettingsViews {
  default = 'default',
  advanced = 'advanced',
}

export const fileSourceSchema = z.nativeEnum(FileSources);

export const fileStrategiesSchema = z
  .object({
    default: fileSourceSchema.optional(),
    avatar: fileSourceSchema.optional(),
    image: fileSourceSchema.optional(),
    document: fileSourceSchema.optional(),
  })
  .optional();

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
  groupMap: TAzureGroupMap;
  assistantModels?: string[];
  assistantGroups?: string[];
  modelGroupMap: TAzureModelGroupMap;
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
  web_search = 'web_search',
  artifacts = 'artifacts',
  actions = 'actions',
  context = 'context',
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
  titleConvo: z.boolean().optional(),
  titleMethod: z
    .union([z.literal('completion'), z.literal('functions'), z.literal('structured')])
    .optional(),
  titleEndpoint: z.string().optional(),
  titlePromptTemplate: z.string().optional(),
});

export type TBaseEndpoint = z.infer<typeof baseEndpointSchema>;

export const bedrockEndpointSchema = baseEndpointSchema.merge(
  z.object({
    availableRegions: z.array(z.string()).optional(),
  }),
);

const modelItemSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    description: z.string().optional(),
  }),
]);

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
        default: z.array(modelItemSchema).min(1),
        fetch: z.boolean().optional(),
        userIdQuery: z.boolean().optional(),
      })
      .optional(),
    headers: z.record(z.any()).optional(),
  }),
);

export type TAssistantEndpoint = z.infer<typeof assistantEndpointSchema>;

export const defaultAgentCapabilities = [
  AgentCapabilities.execute_code,
  AgentCapabilities.file_search,
  AgentCapabilities.web_search,
  AgentCapabilities.artifacts,
  AgentCapabilities.actions,
  AgentCapabilities.context,
  AgentCapabilities.tools,
  AgentCapabilities.chain,
  AgentCapabilities.ocr,
];

export const agentsEndpointSchema = baseEndpointSchema
  .merge(
    z.object({
      /* agents specific */
      recursionLimit: z.number().optional(),
      disableBuilder: z.boolean().optional().default(false),
      maxRecursionLimit: z.number().optional(),
      maxCitations: z.number().min(1).max(50).optional().default(30),
      maxCitationsPerFile: z.number().min(1).max(10).optional().default(7),
      minRelevanceScore: z.number().min(0.0).max(1.0).optional().default(0.45),
      allowedProviders: z.array(z.union([z.string(), eModelEndpointSchema])).optional(),
      capabilities: z
        .array(z.nativeEnum(AgentCapabilities))
        .optional()
        .default(defaultAgentCapabilities),
    }),
  )
  .default({
    disableBuilder: false,
    capabilities: defaultAgentCapabilities,
    maxCitations: 30,
    maxCitationsPerFile: 7,
    minRelevanceScore: 0.45,
  });

export type TAgentsEndpoint = z.infer<typeof agentsEndpointSchema>;

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
      default: z.array(modelItemSchema).min(1),
      fetch: z.boolean().optional(),
      userIdQuery: z.boolean().optional(),
    }),
    summarize: z.boolean().optional(),
    summaryModel: z.string().optional(),
    iconURL: z.string().optional(),
    forcePrompt: z.boolean().optional(),
    modelDisplayLabel: z.string().optional(),
    headers: z.record(z.any()).optional(),
    addParams: z.record(z.any()).optional(),
    dropParams: z.array(z.string()).optional(),
    customParams: z
      .object({
        defaultParamsEndpoint: z.string().default('custom'),
        paramDefinitions: z.array(z.record(z.any())).optional(),
      })
      .strict(),
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
        titlePrompt: true,
        titlePromptTemplate: true,
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

const mcpServersSchema = z.object({
  placeholder: z.string().optional(),
});

export type TMcpServersConfig = z.infer<typeof mcpServersSchema>;

export const interfaceSchema = z
  .object({
    privacyPolicy: z
      .object({
        externalUrl: z.string().optional(),
        openNewTab: z.boolean().optional(),
      })
      .optional(),
    termsOfService: termsOfServiceSchema.optional(),
    customWelcome: z.string().optional(),
    mcpServers: mcpServersSchema.optional(),
    endpointsMenu: z.boolean().optional(),
    modelSelect: z.boolean().optional(),
    parameters: z.boolean().optional(),
    sidePanel: z.boolean().optional(),
    multiConvo: z.boolean().optional(),
    bookmarks: z.boolean().optional(),
    memories: z.boolean().optional(),
    presets: z.boolean().optional(),
    prompts: z.boolean().optional(),
    agents: z.boolean().optional(),
    temporaryChat: z.boolean().optional(),
    temporaryChatRetention: z.number().min(1).max(8760).optional(),
    runCode: z.boolean().optional(),
    webSearch: z.boolean().optional(),
    peoplePicker: z
      .object({
        users: z.boolean().optional(),
        groups: z.boolean().optional(),
        roles: z.boolean().optional(),
      })
      .optional(),
    marketplace: z
      .object({
        use: z.boolean().optional(),
      })
      .optional(),
    fileSearch: z.boolean().optional(),
    fileCitations: z.boolean().optional(),
  })
  .default({
    endpointsMenu: true,
    modelSelect: true,
    parameters: true,
    sidePanel: true,
    presets: true,
    multiConvo: true,
    bookmarks: true,
    memories: true,
    prompts: true,
    agents: true,
    temporaryChat: true,
    runCode: true,
    webSearch: true,
    peoplePicker: {
      users: true,
      groups: true,
      roles: true,
    },
    marketplace: {
      use: false,
    },
    fileSearch: true,
    fileCitations: true,
  });

export type TInterfaceConfig = z.infer<typeof interfaceSchema>;
export type TBalanceConfig = z.infer<typeof balanceSchema>;
export type TTransactionsConfig = z.infer<typeof transactionsSchema>;

export const turnstileOptionsSchema = z
  .object({
    language: z.string().default('auto'),
    size: z.enum(['normal', 'compact', 'flexible', 'invisible']).default('normal'),
  })
  .default({
    language: 'auto',
    size: 'normal',
  });

export const turnstileSchema = z.object({
  siteKey: z.string(),
  options: turnstileOptionsSchema.optional(),
});

export type TTurnstileConfig = z.infer<typeof turnstileSchema>;

export type TStartupConfig = {
  appTitle: string;
  socialLogins?: string[];
  interface?: TInterfaceConfig;
  turnstile?: TTurnstileConfig;
  balance?: TBalanceConfig;
  transactions?: TTransactionsConfig;
  discordLoginEnabled: boolean;
  facebookLoginEnabled: boolean;
  githubLoginEnabled: boolean;
  googleLoginEnabled: boolean;
  openidLoginEnabled: boolean;
  appleLoginEnabled: boolean;
  samlLoginEnabled: boolean;
  openidLabel: string;
  openidImageUrl: string;
  openidAutoRedirect: boolean;
  samlLabel: string;
  samlImageUrl: string;
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
  modelDescriptions?: Record<string, Record<string, string>>;
  sharedLinksEnabled: boolean;
  publicSharedLinksEnabled: boolean;
  analyticsGtmId?: string;
  instanceProjectId: string;
  bundlerURL?: string;
  staticBundlerURL?: string;
  sharePointFilePickerEnabled?: boolean;
  sharePointBaseUrl?: string;
  sharePointPickerGraphScope?: string;
  sharePointPickerSharePointScope?: string;
  openidReuseTokens?: boolean;
  minPasswordLength?: number;
  webSearch?: {
    searchProvider?: SearchProviders;
    scraperProvider?: ScraperProviders;
    rerankerType?: RerankerTypes;
  };
  mcpServers?: Record<
    string,
    {
      customUserVars: Record<
        string,
        {
          title: string;
          description: string;
        }
      >;
      chatMenu?: boolean;
      isOAuth?: boolean;
      startup?: boolean;
    }
  >;
  mcpPlaceholder?: string;
  conversationImportMaxFileSize?: number;
};

export enum OCRStrategy {
  MISTRAL_OCR = 'mistral_ocr',
  CUSTOM_OCR = 'custom_ocr',
  AZURE_MISTRAL_OCR = 'azure_mistral_ocr',
  VERTEXAI_MISTRAL_OCR = 'vertexai_mistral_ocr',
}

export enum SearchCategories {
  PROVIDERS = 'providers',
  SCRAPERS = 'scrapers',
  RERANKERS = 'rerankers',
}

export enum SearchProviders {
  SERPER = 'serper',
  SEARXNG = 'searxng',
}

export enum ScraperProviders {
  FIRECRAWL = 'firecrawl',
  SERPER = 'serper',
}

export enum RerankerTypes {
  JINA = 'jina',
  COHERE = 'cohere',
}

export enum SafeSearchTypes {
  OFF = 0,
  MODERATE = 1,
  STRICT = 2,
}

export const webSearchSchema = z.object({
  serperApiKey: z.string().optional().default('${SERPER_API_KEY}'),
  searxngInstanceUrl: z.string().optional().default('${SEARXNG_INSTANCE_URL}'),
  searxngApiKey: z.string().optional().default('${SEARXNG_API_KEY}'),
  firecrawlApiKey: z.string().optional().default('${FIRECRAWL_API_KEY}'),
  firecrawlApiUrl: z.string().optional().default('${FIRECRAWL_API_URL}'),
  firecrawlVersion: z.string().optional().default('${FIRECRAWL_VERSION}'),
  jinaApiKey: z.string().optional().default('${JINA_API_KEY}'),
  jinaApiUrl: z.string().optional().default('${JINA_API_URL}'),
  cohereApiKey: z.string().optional().default('${COHERE_API_KEY}'),
  searchProvider: z.nativeEnum(SearchProviders).optional(),
  scraperProvider: z.nativeEnum(ScraperProviders).optional(),
  rerankerType: z.nativeEnum(RerankerTypes).optional(),
  scraperTimeout: z.number().optional(),
  safeSearch: z.nativeEnum(SafeSearchTypes).default(SafeSearchTypes.MODERATE),
  firecrawlOptions: z
    .object({
      formats: z.array(z.string()).optional(),
      includeTags: z.array(z.string()).optional(),
      excludeTags: z.array(z.string()).optional(),
      headers: z.record(z.string()).optional(),
      waitFor: z.number().optional(),
      timeout: z.number().optional(),
      maxAge: z.number().optional(),
      mobile: z.boolean().optional(),
      skipTlsVerification: z.boolean().optional(),
      blockAds: z.boolean().optional(),
      removeBase64Images: z.boolean().optional(),
      parsePDF: z.boolean().optional(),
      storeInCache: z.boolean().optional(),
      zeroDataRetention: z.boolean().optional(),
      location: z
        .object({
          country: z.string().optional(),
          languages: z.array(z.string()).optional(),
        })
        .optional(),
      onlyMainContent: z.boolean().optional(),
      changeTrackingOptions: z
        .object({
          modes: z.array(z.string()).optional(),
          schema: z.record(z.unknown()).optional(),
          prompt: z.string().optional(),
          tag: z.string().nullable().optional(),
        })
        .optional(),
    })
    .optional(),
});

export type TWebSearchConfig = DeepPartial<z.infer<typeof webSearchSchema>>;

export const ocrSchema = z.object({
  mistralModel: z.string().optional(),
  apiKey: z.string().optional().default('${OCR_API_KEY}'),
  baseURL: z.string().optional().default('${OCR_BASEURL}'),
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

export const transactionsSchema = z.object({
  enabled: z.boolean().optional().default(true),
});

export const memorySchema = z.object({
  disabled: z.boolean().optional(),
  validKeys: z.array(z.string()).optional(),
  tokenLimit: z.number().optional(),
  charLimit: z.number().optional().default(10000),
  personalize: z.boolean().default(true),
  messageWindowSize: z.number().optional().default(5),
  agent: z
    .union([
      z.object({
        id: z.string(),
      }),
      z.object({
        provider: z.string(),
        model: z.string(),
        instructions: z.string().optional(),
        model_parameters: z.record(z.any()).optional(),
      }),
    ])
    .optional(),
});

export type TMemoryConfig = DeepPartial<z.infer<typeof memorySchema>>;

const customEndpointsSchema = z.array(endpointSchema.partial()).optional();

export const configSchema = z.object({
  version: z.string(),
  cache: z.boolean().default(true),
  ocr: ocrSchema.optional(),
  webSearch: webSearchSchema.optional(),
  memory: memorySchema.optional(),
  secureImageLinks: z.boolean().optional(),
  imageOutputType: z.nativeEnum(EImageOutputType).default(EImageOutputType.PNG),
  includedTools: z.array(z.string()).optional(),
  filteredTools: z.array(z.string()).optional(),
  mcpServers: MCPServersSchema.optional(),
  interface: interfaceSchema,
  turnstile: turnstileSchema.optional(),
  fileStrategy: fileSourceSchema.default(FileSources.local),
  fileStrategies: fileStrategiesSchema,
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
  transactions: transactionsSchema.optional(),
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
      [EModelEndpoint.agents]: agentsEndpointSchema.optional(),
      [EModelEndpoint.custom]: customEndpointsSchema.optional(),
      [EModelEndpoint.bedrock]: baseEndpointSchema.optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one `endpoints` field must be provided.',
    })
    .optional(),
});

/**
 * Recursively makes all properties of T optional, including nested objects.
 * Handles arrays, primitives, functions, and Date objects correctly.
 */
export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepPartial<U>>
    : // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      T extends Function
      ? T
      : T extends Date
        ? T
        : T extends object
          ? {
              [P in keyof T]?: DeepPartial<T[P]>;
            }
          : T;

export const getConfigDefaults = () => getSchemaDefaults(configSchema);
export type TCustomConfig = DeepPartial<z.infer<typeof configSchema>>;
export type TCustomEndpoints = z.infer<typeof customEndpointsSchema>;

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
  helicone = 'helicone',
  huggingface = 'huggingface',
  mistral = 'mistral',
  mlx = 'mlx',
  ollama = 'ollama',
  openrouter = 'openrouter',
  perplexity = 'perplexity',
  shuttleai = 'shuttleai',
  'together.ai' = 'together.ai',
  unify = 'unify',
  vercel = 'vercel',
  xai = 'xai',
}

export enum FetchTokenConfig {
  openrouter = KnownEndpoints.openrouter,
  helicone = KnownEndpoints.helicone,
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
  [EModelEndpoint.agents]: 'My Agents',
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
  [KnownEndpoints.vercel]: 'Vercel',
  [KnownEndpoints.helicone]: 'Helicone',
};

const sharedOpenAIModels = [
  'gpt-5.1',
  'gpt-5.1-chat-latest',
  'gpt-5.1-codex',
  'gpt-5.1-codex-mini',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-5-chat-latest',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
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
  'claude-sonnet-4-5',
  'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-1',
  'claude-opus-4-1-20250805',
  'claude-opus-4-5',
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-0',
  'claude-opus-4-20250514',
  'claude-opus-4-0',
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
  'anthropic.claude-sonnet-4-5-20250929-v1:0',
  'anthropic.claude-haiku-4-5-20251001-v1:0',
  'anthropic.claude-opus-4-1-20250805-v1:0',
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
    // Gemini 2.5 Models
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    // Gemini 2.0 Models
    'gemini-2.0-flash-001',
    'gemini-2.0-flash-lite',
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

export const EndpointURLs = {
  [EModelEndpoint.assistants]: `${apiBaseUrl()}/api/assistants/v2/chat`,
  [EModelEndpoint.azureAssistants]: `${apiBaseUrl()}/api/assistants/v1/chat`,
  [EModelEndpoint.agents]: `${apiBaseUrl()}/api/${EModelEndpoint.agents}/chat`,
} as const;

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
  [EModelEndpoint.google]: true,
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
  'o4-mini',
  'o3',
  'o1',
  'gpt-4.1',
  'gpt-4.5',
  'llava',
  'llava-13b',
  'gemini-pro-vision',
  'claude-3',
  'gemma',
  'gemini-exp',
  'gemini-1.5',
  'gemini-2',
  'gemini-2.5',
  'gemini-3',
  'moondream',
  'llama3.2-vision',
  'llama-3.2-11b-vision',
  'llama-3-2-11b-vision',
  'llama-3.2-90b-vision',
  'llama-3-2-90b-vision',
  'llama-4',
  'claude-opus-4',
  'claude-sonnet-4',
  'claude-haiku-4',
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
  ONE_DAY = 86400000,
  ONE_HOUR = 3600000,
  THIRTY_MINUTES = 1800000,
  TEN_MINUTES = 600000,
  FIVE_MINUTES = 300000,
  THREE_MINUTES = 180000,
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
  CONFIG_STORE = 'CONFIG_STORE',
  /**
   * Key for the roles cache.
   */
  ROLES = 'ROLES',
  /**
   * Key for the plugins cache.
   */
  PLUGINS = 'PLUGINS',
  /**
   * Key for the title generation cache.
   */
  GEN_TITLE = 'GEN_TITLE',
  /**
   * Key for the tools cache.
   */
  TOOLS = 'TOOLS',
  /**
   * Key for the model config cache.
   */
  MODELS_CONFIG = 'MODELS_CONFIG',
  /**
   * Key for the model queries cache.
   */
  MODEL_QUERIES = 'MODEL_QUERIES',
  /**
   * Key for the default startup config cache.
   */
  STARTUP_CONFIG = 'STARTUP_CONFIG',
  /**
   * Key for the default endpoint config cache.
   */
  ENDPOINT_CONFIG = 'ENDPOINT_CONFIG',
  /**
   * Key for accessing the model token config cache.
   */
  TOKEN_CONFIG = 'TOKEN_CONFIG',
  /**
   * Key for the app config namespace.
   */
  APP_CONFIG = 'APP_CONFIG',
  /**
   * Key for accessing Abort Keys
   */
  ABORT_KEYS = 'ABORT_KEYS',
  /**
   * Key for the bans cache.
   */
  BANS = 'BANS',
  /**
   * Key for the encoded domains cache.
   * Used by Azure OpenAI Assistants.
   */
  ENCODED_DOMAINS = 'ENCODED_DOMAINS',
  /**
   * Key for the cached audio run Ids.
   */
  AUDIO_RUNS = 'AUDIO_RUNS',
  /**
   * Key for in-progress messages.
   */
  MESSAGES = 'MESSAGES',
  /**
   * Key for in-progress flow states.
   */
  FLOWS = 'FLOWS',
  /**
   * Key for pending chat requests (concurrency check)
   */
  PENDING_REQ = 'PENDING_REQ',
  /**
   * Key for s3 check intervals per user
   */
  S3_EXPIRY_INTERVAL = 'S3_EXPIRY_INTERVAL',
  /**
   * key for open id exchanged tokens
   */
  OPENID_EXCHANGED_TOKENS = 'OPENID_EXCHANGED_TOKENS',
  /**
   * Key for OpenID session.
   */
  OPENID_SESSION = 'OPENID_SESSION',
  /**
   * Key for SAML session.
   */
  SAML_SESSION = 'SAML_SESSION',
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
  /**
   * General violation (catch-all).
   */
  GENERAL = 'general',
  /**
   * Login attempt violations.
   */
  LOGINS = 'logins',
  /**
   * Concurrent request violations.
   */
  CONCURRENT = 'concurrent',
  /**
   * Non-browser access violations.
   */
  NON_BROWSER = 'non_browser',
  /**
   * Message limit violations.
   */
  MESSAGE_LIMIT = 'message_limit',
  /**
   * Registration violations.
   */
  REGISTRATIONS = 'registrations',
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
  /**
   * Google provider does not allow custom tools with built-in tools
   */
  GOOGLE_TOOL_CONFLICT = 'google_tool_conflict',
  /**
   * Invalid Agent Provider (excluded by Admin)
   */
  INVALID_AGENT_PROVIDER = 'invalid_agent_provider',
  /**
   * Missing model selection
   */
  MISSING_MODEL = 'missing_model',
  /**
   * Models configuration not loaded
   */
  MODELS_NOT_LOADED = 'models_not_loaded',
  /**
   * Endpoint models not loaded
   */
  ENDPOINT_MODELS_NOT_LOADED = 'endpoint_models_not_loaded',
  /**
   * Generic Authentication failure
   */
  AUTH_FAILED = 'auth_failed',
  /**
   * Model refused to respond (content policy violation)
   */
  REFUSAL = 'refusal',
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
   * Tab for Balance Settings
   */
  BALANCE = 'balance',
  /**
   * Tab for Account Settings
   */
  ACCOUNT = 'account',
  /**
   * Chat input commands
   */
  COMMANDS = 'commands',
  /**
   * Tab for Personalization Settings
   */
  PERSONALIZATION = 'personalization',
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
  VERSION = 'v0.8.1',
  /** Key for the Custom Config's version (librechat.yaml). */
  CONFIG_VERSION = '1.3.1',
  /** Standard value for the first message's `parentMessageId` value, to indicate no parent exists. */
  NO_PARENT = '00000000-0000-0000-0000-000000000000',
  /** Standard value to use whatever the submission prelim. `responseMessageId` is */
  USE_PRELIM_RESPONSE_MESSAGE_ID = 'USE_PRELIM_RESPONSE_MESSAGE_ID',
  /** Standard value for the initial conversationId before a request is sent */
  NEW_CONVO = 'new',
  /** Standard value for the temporary conversationId after a request is sent and before the server responds */
  PENDING_CONVO = 'PENDING',
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
  /** Prefix for MCP plugins */
  mcp_prefix = 'mcp_',
  /** Unique value to indicate all MCP servers. For backend use only. */
  mcp_all = 'sys__all__sys',
  /** Unique value to indicate clearing MCP servers from UI state. For frontend use only. */
  mcp_clear = 'sys__clear__sys',
  /**
   * Unique value to indicate the MCP tool was added to an agent.
   * This helps inform the UI if the mcp server was previously added.
   * */
  mcp_server = 'sys__server__sys',
  /**
   * Handoff Tool Name Prefix
   */
  LC_TRANSFER_TO_ = 'lc_transfer_to_',
  /** Placeholder Agent ID for Ephemeral Agents */
  EPHEMERAL_AGENT_ID = 'ephemeral',
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
  /** Last selected MCP values per conversation ID */
  LAST_MCP_ = 'LAST_MCP_',
  /** Last checked toggle for Code Interpreter API per conversation ID */
  LAST_CODE_TOGGLE_ = 'LAST_CODE_TOGGLE_',
  /** Last checked toggle for Web Search per conversation ID */
  LAST_WEB_SEARCH_TOGGLE_ = 'LAST_WEB_SEARCH_TOGGLE_',
  /** Last checked toggle for File Search per conversation ID */
  LAST_FILE_SEARCH_TOGGLE_ = 'LAST_FILE_SEARCH_TOGGLE_',
  /** Last checked toggle for Artifacts per conversation ID */
  LAST_ARTIFACTS_TOGGLE_ = 'LAST_ARTIFACTS_TOGGLE_',
  /** Key for the last selected agent provider */
  LAST_AGENT_PROVIDER = 'lastAgentProvider',
  /** Key for the last selected agent model */
  LAST_AGENT_MODEL = 'lastAgentModel',
  /** Pin state for MCP tools per conversation ID */
  PIN_MCP_ = 'PIN_MCP_',
  /** Pin state for Web Search per conversation ID */
  PIN_WEB_SEARCH_ = 'PIN_WEB_SEARCH_',
  /** Pin state for Code Interpreter per conversation ID */
  PIN_CODE_INTERPRETER_ = 'PIN_CODE_INTERPRETER_',
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

export const specialVariables = {
  current_date: true,
  current_user: true,
  iso_datetime: true,
  current_datetime: true,
};

export type TSpecialVarLabel = `com_ui_special_var_${keyof typeof specialVariables}`;

/**
 * Retrieves a specific field from the endpoints configuration for a given endpoint key.
 * Does not infer or default any endpoint type when absent.
 */
export function getEndpointField<
  K extends TConfig[keyof TConfig] extends never ? never : keyof TConfig,
>(
  endpointsConfig: TEndpointsConfig | undefined | null,
  endpoint: EModelEndpoint | string | null | undefined,
  property: K,
): TConfig[K] | undefined {
  if (!endpointsConfig || endpoint === null || endpoint === undefined) {
    return undefined;
  }
  const config = endpointsConfig[endpoint];
  if (!config) {
    return undefined;
  }
  return config[property];
}
