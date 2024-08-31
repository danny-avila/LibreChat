import { z } from 'zod';
import { Tools } from './types/assistants';
import type { TMessageContentParts, FunctionTool, FunctionToolCall } from './types/assistants';
import type { TFile } from './types/files';

export const isUUID = z.string().uuid();

export enum AuthType {
  OVERRIDE_AUTH = 'override_auth',
  USER_PROVIDED = 'user_provided',
  SYSTEM_DEFINED = 'SYSTEM_DEFINED',
}

export const authTypeSchema = z.nativeEnum(AuthType);

export enum EModelEndpoint {
  azureOpenAI = 'azureOpenAI',
  openAI = 'openAI',
  bingAI = 'bingAI',
  chatGPTBrowser = 'chatGPTBrowser',
  google = 'google',
  gptPlugins = 'gptPlugins',
  anthropic = 'anthropic',
  assistants = 'assistants',
  azureAssistants = 'azureAssistants',
  agents = 'agents',
  custom = 'custom',
}

export type AssistantsEndpoint = EModelEndpoint.assistants | EModelEndpoint.azureAssistants;

export const isAssistantsEndpoint = (endpoint?: AssistantsEndpoint | null | string): boolean => {
  if (!endpoint) {
    return false;
  }
  return endpoint.toLowerCase().endsWith(EModelEndpoint.assistants);
};

export type AgentProvider = Exclude<keyof typeof EModelEndpoint, EModelEndpoint.agents> | string;

export const isAgentsEndpoint = (endpoint?: EModelEndpoint.agents | null | string): boolean => {
  if (!endpoint) {
    return false;
  }
  return endpoint === EModelEndpoint.agents;
};

export enum ImageDetail {
  low = 'low',
  auto = 'auto',
  high = 'high',
}

export const imageDetailNumeric = {
  [ImageDetail.low]: 0,
  [ImageDetail.auto]: 1,
  [ImageDetail.high]: 2,
};

export const imageDetailValue = {
  0: ImageDetail.low,
  1: ImageDetail.auto,
  2: ImageDetail.high,
};

export const eImageDetailSchema = z.nativeEnum(ImageDetail);

export const defaultAssistantFormValues = {
  assistant: '',
  id: '',
  name: '',
  description: '',
  instructions: '',
  conversation_starters: [],
  model: '',
  functions: [],
  code_interpreter: false,
  image_vision: false,
  retrieval: false,
};

export const defaultAgentFormValues = {
  agent: {},
  id: '',
  name: '',
  description: '',
  instructions: '',
  model: '',
  model_parameters: {},
  tools: [],
  provider: {},
  code_interpreter: false,
  image_vision: false,
  retrieval: false,
};

export const ImageVisionTool: FunctionTool = {
  type: Tools.function,
  [Tools.function]: {
    name: 'image_vision',
    description: 'Get detailed text descriptions for all current image attachments.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

export const isImageVisionTool = (tool: FunctionTool | FunctionToolCall) =>
  tool.type === 'function' && tool.function?.name === ImageVisionTool.function?.name;

export const openAISettings = {
  model: {
    default: 'gpt-4o',
  },
  temperature: {
    min: 0,
    max: 1,
    step: 0.01,
    default: 1,
  },
  top_p: {
    min: 0,
    max: 1,
    step: 0.01,
    default: 1,
  },
  presence_penalty: {
    min: 0,
    max: 2,
    step: 0.01,
    default: 0,
  },
  frequency_penalty: {
    min: 0,
    max: 2,
    step: 0.01,
    default: 0,
  },
  resendFiles: {
    default: true,
  },
  maxContextTokens: {
    default: undefined,
  },
  max_tokens: {
    default: undefined,
  },
  imageDetail: {
    default: ImageDetail.auto,
    min: 0,
    max: 2,
    step: 1,
  },
};

export const googleSettings = {
  model: {
    default: 'gemini-1.5-flash-latest',
  },
  maxOutputTokens: {
    min: 1,
    max: 8192,
    step: 1,
    default: 8192,
  },
  temperature: {
    min: 0,
    max: 2,
    step: 0.01,
    default: 1,
  },
  topP: {
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.95,
  },
  topK: {
    min: 1,
    max: 40,
    step: 0.01,
    default: 40,
  },
};

const ANTHROPIC_MAX_OUTPUT = 8192;
const LEGACY_ANTHROPIC_MAX_OUTPUT = 4096;
export const anthropicSettings = {
  model: {
    default: 'claude-3-5-sonnet-20240620',
  },
  temperature: {
    min: 0,
    max: 1,
    step: 0.01,
    default: 1,
  },
  promptCache: {
    default: true,
  },
  maxOutputTokens: {
    min: 1,
    max: ANTHROPIC_MAX_OUTPUT,
    step: 1,
    default: ANTHROPIC_MAX_OUTPUT,
    reset: (modelName: string) => {
      if (modelName.includes('claude-3-5-sonnet')) {
        return ANTHROPIC_MAX_OUTPUT;
      }

      return 4096;
    },
    set: (value: number, modelName: string) => {
      if (!modelName.includes('claude-3-5-sonnet') && value > LEGACY_ANTHROPIC_MAX_OUTPUT) {
        return LEGACY_ANTHROPIC_MAX_OUTPUT;
      }

      return value;
    },
  },
  topP: {
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.7,
  },
  topK: {
    min: 1,
    max: 40,
    step: 1,
    default: 5,
  },
  resendFiles: {
    default: true,
  },
  maxContextTokens: {
    default: undefined,
  },
  legacy: {
    maxOutputTokens: {
      min: 1,
      max: LEGACY_ANTHROPIC_MAX_OUTPUT,
      step: 1,
      default: LEGACY_ANTHROPIC_MAX_OUTPUT,
    },
  },
};

export const agentsSettings = {
  model: {
    default: 'gpt-3.5-turbo-test',
  },
  temperature: {
    min: 0,
    max: 1,
    step: 0.01,
    default: 1,
  },
  top_p: {
    min: 0,
    max: 1,
    step: 0.01,
    default: 1,
  },
  presence_penalty: {
    min: 0,
    max: 2,
    step: 0.01,
    default: 0,
  },
  frequency_penalty: {
    min: 0,
    max: 2,
    step: 0.01,
    default: 0,
  },
  resendFiles: {
    default: true,
  },
  maxContextTokens: {
    default: undefined,
  },
  max_tokens: {
    default: undefined,
  },
  imageDetail: {
    default: ImageDetail.auto,
  },
};

export const endpointSettings = {
  [EModelEndpoint.openAI]: openAISettings,
  [EModelEndpoint.google]: googleSettings,
  [EModelEndpoint.anthropic]: anthropicSettings,
  [EModelEndpoint.agents]: agentsSettings,
};

const google = endpointSettings[EModelEndpoint.google];

export const eModelEndpointSchema = z.nativeEnum(EModelEndpoint);

export const extendedModelEndpointSchema = z.union([eModelEndpointSchema, z.string()]);

export const tPluginAuthConfigSchema = z.object({
  authField: z.string(),
  label: z.string(),
  description: z.string(),
});

export type TPluginAuthConfig = z.infer<typeof tPluginAuthConfigSchema>;

export const tPluginSchema = z.object({
  name: z.string(),
  pluginKey: z.string(),
  description: z.string(),
  icon: z.string(),
  authConfig: z.array(tPluginAuthConfigSchema),
  authenticated: z.boolean().optional(),
  isButton: z.boolean().optional(),
});

export type TPlugin = z.infer<typeof tPluginSchema>;

export type TInput = {
  inputStr: string;
};

export type TResPlugin = {
  plugin: string;
  input: string;
  thought: string;
  loading?: boolean;
  outputs?: string;
  latest?: string;
  inputs?: TInput[];
};

export const tExampleSchema = z.object({
  input: z.object({
    content: z.string(),
  }),
  output: z.object({
    content: z.string(),
  }),
});

export type TExample = z.infer<typeof tExampleSchema>;

export enum EAgent {
  functions = 'functions',
  classic = 'classic',
}

export const agentOptionSettings = {
  model: {
    default: 'gpt-4o-mini',
  },
  temperature: {
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
  },
  agent: {
    default: EAgent.functions,
    options: [EAgent.functions, EAgent.classic],
  },
  skipCompletion: {
    default: true,
  },
};

export const eAgentOptionsSchema = z.nativeEnum(EAgent);

export const tAgentOptionsSchema = z.object({
  agent: z.string().default(EAgent.functions),
  skipCompletion: z.boolean().default(agentOptionSettings.skipCompletion.default),
  model: z.string(),
  temperature: z.number().default(agentOptionSettings.temperature.default),
});

export const tMessageSchema = z.object({
  messageId: z.string(),
  endpoint: z.string().optional(),
  clientId: z.string().nullable().optional(),
  conversationId: z.string().nullable(),
  parentMessageId: z.string().nullable(),
  responseMessageId: z.string().nullable().optional(),
  overrideParentMessageId: z.string().nullable().optional(),
  bg: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  title: z.string().nullable().or(z.literal('New Chat')).default('New Chat'),
  sender: z.string(),
  text: z.string(),
  generation: z.string().nullable().optional(),
  isEdited: z.boolean().optional(),
  isCreatedByUser: z.boolean(),
  error: z.boolean(),
  createdAt: z
    .string()
    .optional()
    .default(() => new Date().toISOString()),
  updatedAt: z
    .string()
    .optional()
    .default(() => new Date().toISOString()),
  current: z.boolean().optional(),
  unfinished: z.boolean().optional(),
  searchResult: z.boolean().optional(),
  finish_reason: z.string().optional(),
  /* assistant */
  thread_id: z.string().optional(),
  /* frontend components */
  iconURL: z.string().optional(),
});

export type TMessage = z.input<typeof tMessageSchema> & {
  children?: TMessage[];
  plugin?: TResPlugin | null;
  plugins?: TResPlugin[];
  content?: TMessageContentParts[];
  files?: Partial<TFile>[];
  depth?: number;
  siblingIndex?: number;
};

export const coerceNumber = z.union([z.number(), z.string()]).transform((val) => {
  if (typeof val === 'string') {
    return val.trim() === '' ? undefined : parseFloat(val);
  }
  return val;
});

export const tConversationSchema = z.object({
  conversationId: z.string().nullable(),
  endpoint: eModelEndpointSchema.nullable(),
  endpointType: eModelEndpointSchema.optional(),
  title: z.string().nullable().or(z.literal('New Chat')).default('New Chat'),
  user: z.string().optional(),
  messages: z.array(z.string()).optional(),
  tools: z.union([z.array(tPluginSchema), z.array(z.string())]).optional(),
  modelLabel: z.string().nullable().optional(),
  userLabel: z.string().optional(),
  model: z.string().nullable().optional(),
  promptPrefix: z.string().nullable().optional(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
  top_p: z.number().optional(),
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
  parentMessageId: z.string().optional(),
  maxOutputTokens: z.number().optional(),
  maxContextTokens: coerceNumber.optional(),
  max_tokens: coerceNumber.optional(),
  /* Anthropic */
  promptCache: z.boolean().optional(),
  /* artifacts */
  artifacts: z.string().optional(),
  /* google */
  context: z.string().nullable().optional(),
  examples: z.array(tExampleSchema).optional(),
  /* DB */
  tags: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /* Files */
  file_ids: z.array(z.string()).optional(),
  /* vision */
  resendFiles: z.boolean().optional(),
  imageDetail: eImageDetailSchema.optional(),
  /* assistant */
  assistant_id: z.string().optional(),
  /* agents */
  agent_id: z.string().optional(),
  /* assistant + agents */
  instructions: z.string().optional(),
  additional_instructions: z.string().optional(),
  /** Used to overwrite active conversation settings when saving a Preset */
  presetOverride: z.record(z.unknown()).optional(),
  stop: z.array(z.string()).optional(),
  /* frontend components */
  iconURL: z.string().optional(),
  greeting: z.string().optional(),
  spec: z.string().optional(),
  /*
  Deprecated fields
  */
  /** @deprecated */
  suggestions: z.array(z.string()).optional(),
  /** @deprecated */
  systemMessage: z.string().nullable().optional(),
  /** @deprecated */
  jailbreak: z.boolean().optional(),
  /** @deprecated */
  jailbreakConversationId: z.string().nullable().optional(),
  /** @deprecated */
  conversationSignature: z.string().nullable().optional(),
  /** @deprecated */
  clientId: z.string().nullable().optional(),
  /** @deprecated */
  invocationId: z.number().nullable().optional(),
  /** @deprecated */
  toneStyle: z.string().nullable().optional(),
  /** @deprecated */
  resendImages: z.boolean().optional(),
  /** @deprecated */
  agentOptions: tAgentOptionsSchema.nullable().optional(),
  /** @deprecated Prefer `modelLabel` over `chatGptLabel` */
  chatGptLabel: z.string().nullable().optional(),
});

export const tPresetSchema = tConversationSchema
  .omit({
    conversationId: true,
    createdAt: true,
    updatedAt: true,
    title: true,
  })
  .merge(
    z.object({
      conversationId: z.string().nullable().optional(),
      presetId: z.string().nullable().optional(),
      title: z.string().nullable().optional(),
      defaultPreset: z.boolean().optional(),
      order: z.number().optional(),
      endpoint: extendedModelEndpointSchema.nullable(),
    }),
  );

export const tConvoUpdateSchema = tConversationSchema.merge(
  z.object({
    endpoint: extendedModelEndpointSchema.nullable(),
  }),
);

export const tPresetUpdateSchema = tConversationSchema.merge(
  z.object({
    endpoint: extendedModelEndpointSchema.nullable(),
  }),
);

export type TPreset = z.infer<typeof tPresetSchema>;

export type TSetOption = (
  param: number | string,
) => (newValue: number | string | boolean | string[] | Partial<TPreset>) => void;

export type TConversation = z.infer<typeof tConversationSchema> & {
  presetOverride?: Partial<TPreset>;
};

export const tSharedLinkSchema = z.object({
  conversationId: z.string(),
  shareId: z.string(),
  messages: z.array(z.string()),
  isAnonymous: z.boolean(),
  isPublic: z.boolean(),
  isVisible: z.boolean(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TSharedLink = z.infer<typeof tSharedLinkSchema>;

export const tConversationTagSchema = z.object({
  _id: z.string(),
  user: z.string(),
  tag: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  count: z.number(),
  position: z.number(),
});
export type TConversationTag = z.infer<typeof tConversationTagSchema>;

export const openAISchema = tConversationSchema
  .pick({
    model: true,
    modelLabel: true,
    chatGptLabel: true,
    promptPrefix: true,
    temperature: true,
    top_p: true,
    presence_penalty: true,
    frequency_penalty: true,
    resendFiles: true,
    artifacts: true,
    imageDetail: true,
    stop: true,
    iconURL: true,
    greeting: true,
    spec: true,
    maxContextTokens: true,
    max_tokens: true,
  })
  .transform((obj) => {
    const result = {
      ...obj,
      model: obj.model ?? openAISettings.model.default,
      chatGptLabel: obj.chatGptLabel ?? obj.modelLabel ?? null,
      promptPrefix: obj.promptPrefix ?? null,
      temperature: obj.temperature ?? openAISettings.temperature.default,
      top_p: obj.top_p ?? openAISettings.top_p.default,
      presence_penalty: obj.presence_penalty ?? openAISettings.presence_penalty.default,
      frequency_penalty: obj.frequency_penalty ?? openAISettings.frequency_penalty.default,
      resendFiles:
        typeof obj.resendFiles === 'boolean' ? obj.resendFiles : openAISettings.resendFiles.default,
      imageDetail: obj.imageDetail ?? openAISettings.imageDetail.default,
      stop: obj.stop ?? undefined,
      iconURL: obj.iconURL ?? undefined,
      greeting: obj.greeting ?? undefined,
      spec: obj.spec ?? undefined,
      maxContextTokens: obj.maxContextTokens ?? undefined,
      max_tokens: obj.max_tokens ?? undefined,
    };

    if (obj.modelLabel) {
      result.modelLabel = null;
    }

    return result;
  })
  .catch(() => ({
    model: openAISettings.model.default,
    chatGptLabel: null,
    promptPrefix: null,
    temperature: openAISettings.temperature.default,
    top_p: openAISettings.top_p.default,
    presence_penalty: openAISettings.presence_penalty.default,
    frequency_penalty: openAISettings.frequency_penalty.default,
    resendFiles: openAISettings.resendFiles.default,
    imageDetail: openAISettings.imageDetail.default,
    stop: undefined,
    iconURL: undefined,
    greeting: undefined,
    spec: undefined,
    maxContextTokens: undefined,
    max_tokens: undefined,
  }));

export const googleSchema = tConversationSchema
  .pick({
    model: true,
    modelLabel: true,
    promptPrefix: true,
    examples: true,
    temperature: true,
    maxOutputTokens: true,
    artifacts: true,
    topP: true,
    topK: true,
    iconURL: true,
    greeting: true,
    spec: true,
    maxContextTokens: true,
  })
  .transform((obj) => {
    return {
      ...obj,
      model: obj.model ?? google.model.default,
      modelLabel: obj.modelLabel ?? null,
      promptPrefix: obj.promptPrefix ?? null,
      examples: obj.examples ?? [{ input: { content: '' }, output: { content: '' } }],
      temperature: obj.temperature ?? google.temperature.default,
      maxOutputTokens: obj.maxOutputTokens ?? google.maxOutputTokens.default,
      topP: obj.topP ?? google.topP.default,
      topK: obj.topK ?? google.topK.default,
      iconURL: obj.iconURL ?? undefined,
      greeting: obj.greeting ?? undefined,
      spec: obj.spec ?? undefined,
      maxContextTokens: obj.maxContextTokens ?? undefined,
    };
  })
  .catch(() => ({
    model: google.model.default,
    modelLabel: null,
    promptPrefix: null,
    examples: [{ input: { content: '' }, output: { content: '' } }],
    temperature: google.temperature.default,
    maxOutputTokens: google.maxOutputTokens.default,
    topP: google.topP.default,
    topK: google.topK.default,
    iconURL: undefined,
    greeting: undefined,
    spec: undefined,
    maxContextTokens: undefined,
  }));

export const bingAISchema = tConversationSchema
  .pick({
    jailbreak: true,
    systemMessage: true,
    context: true,
    toneStyle: true,
    jailbreakConversationId: true,
    conversationSignature: true,
    clientId: true,
    invocationId: true,
  })
  .transform((obj) => ({
    ...obj,
    model: '',
    jailbreak: obj.jailbreak ?? false,
    systemMessage: obj.systemMessage ?? null,
    context: obj.context ?? null,
    toneStyle: obj.toneStyle ?? 'creative',
    jailbreakConversationId: obj.jailbreakConversationId ?? null,
    conversationSignature: obj.conversationSignature ?? null,
    clientId: obj.clientId ?? null,
    invocationId: obj.invocationId ?? 1,
  }))
  .catch(() => ({
    model: '',
    jailbreak: false,
    systemMessage: null,
    context: null,
    toneStyle: 'creative',
    jailbreakConversationId: null,
    conversationSignature: null,
    clientId: null,
    invocationId: 1,
  }));

export const anthropicSchema = tConversationSchema
  .pick({
    model: true,
    modelLabel: true,
    promptPrefix: true,
    temperature: true,
    maxOutputTokens: true,
    topP: true,
    topK: true,
    resendFiles: true,
    promptCache: true,
    artifacts: true,
    iconURL: true,
    greeting: true,
    spec: true,
    maxContextTokens: true,
  })
  .transform((obj) => {
    const model = obj.model ?? anthropicSettings.model.default;
    return {
      ...obj,
      model,
      modelLabel: obj.modelLabel ?? null,
      promptPrefix: obj.promptPrefix ?? null,
      temperature: obj.temperature ?? anthropicSettings.temperature.default,
      maxOutputTokens: obj.maxOutputTokens ?? anthropicSettings.maxOutputTokens.reset(model),
      topP: obj.topP ?? anthropicSettings.topP.default,
      topK: obj.topK ?? anthropicSettings.topK.default,
      promptCache:
        typeof obj.promptCache === 'boolean'
          ? obj.promptCache
          : anthropicSettings.promptCache.default,
      resendFiles:
        typeof obj.resendFiles === 'boolean'
          ? obj.resendFiles
          : anthropicSettings.resendFiles.default,
      iconURL: obj.iconURL ?? undefined,
      greeting: obj.greeting ?? undefined,
      spec: obj.spec ?? undefined,
      maxContextTokens: obj.maxContextTokens ?? anthropicSettings.maxContextTokens.default,
    };
  })
  .catch(() => ({
    model: anthropicSettings.model.default,
    modelLabel: null,
    promptPrefix: null,
    temperature: anthropicSettings.temperature.default,
    maxOutputTokens: anthropicSettings.maxOutputTokens.default,
    topP: anthropicSettings.topP.default,
    topK: anthropicSettings.topK.default,
    resendFiles: anthropicSettings.resendFiles.default,
    promptCache: anthropicSettings.promptCache.default,
    iconURL: undefined,
    greeting: undefined,
    spec: undefined,
    maxContextTokens: anthropicSettings.maxContextTokens.default,
  }));

export const chatGPTBrowserSchema = tConversationSchema
  .pick({
    model: true,
  })
  .transform((obj) => ({
    ...obj,
    model: obj.model ?? 'text-davinci-002-render-sha',
  }))
  .catch(() => ({
    model: 'text-davinci-002-render-sha',
  }));

export const gptPluginsSchema = tConversationSchema
  .pick({
    model: true,
    modelLabel: true,
    chatGptLabel: true,
    promptPrefix: true,
    temperature: true,
    artifacts: true,
    top_p: true,
    presence_penalty: true,
    frequency_penalty: true,
    tools: true,
    agentOptions: true,
    iconURL: true,
    greeting: true,
    spec: true,
    maxContextTokens: true,
  })
  .transform((obj) => {
    const result = {
      ...obj,
      model: obj.model ?? 'gpt-3.5-turbo',
      chatGptLabel: obj.chatGptLabel ?? obj.modelLabel ?? null,
      promptPrefix: obj.promptPrefix ?? null,
      temperature: obj.temperature ?? 0.8,
      top_p: obj.top_p ?? 1,
      presence_penalty: obj.presence_penalty ?? 0,
      frequency_penalty: obj.frequency_penalty ?? 0,
      tools: obj.tools ?? [],
      agentOptions: obj.agentOptions ?? {
        agent: EAgent.functions,
        skipCompletion: true,
        model: 'gpt-3.5-turbo',
        temperature: 0,
      },
      iconURL: obj.iconURL ?? undefined,
      greeting: obj.greeting ?? undefined,
      spec: obj.spec ?? undefined,
      maxContextTokens: obj.maxContextTokens ?? undefined,
    };

    if (obj.modelLabel) {
      result.modelLabel = null;
    }

    return result;
  })
  .catch(() => ({
    model: 'gpt-3.5-turbo',
    chatGptLabel: null,
    promptPrefix: null,
    temperature: 0.8,
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
    tools: [],
    agentOptions: {
      agent: EAgent.functions,
      skipCompletion: true,
      model: 'gpt-3.5-turbo',
      temperature: 0,
    },
    iconURL: undefined,
    greeting: undefined,
    spec: undefined,
    maxContextTokens: undefined,
  }));

export function removeNullishValues<T extends object>(obj: T): T {
  const newObj: Partial<T> = { ...obj };

  (Object.keys(newObj) as Array<keyof T>).forEach((key) => {
    if (newObj[key] === undefined || newObj[key] === null || newObj[key] === '') {
      delete newObj[key];
    }
  });

  return newObj as T;
}

export const assistantSchema = tConversationSchema
  .pick({
    model: true,
    assistant_id: true,
    instructions: true,
    artifacts: true,
    promptPrefix: true,
    iconURL: true,
    greeting: true,
    spec: true,
  })
  .transform((obj) => ({
    ...obj,
    model: obj.model ?? openAISettings.model.default,
    assistant_id: obj.assistant_id ?? undefined,
    instructions: obj.instructions ?? undefined,
    promptPrefix: obj.promptPrefix ?? null,
    iconURL: obj.iconURL ?? undefined,
    greeting: obj.greeting ?? undefined,
    spec: obj.spec ?? undefined,
  }))
  .catch(() => ({
    model: openAISettings.model.default,
    assistant_id: undefined,
    instructions: undefined,
    promptPrefix: null,
    iconURL: undefined,
    greeting: undefined,
    spec: undefined,
  }));

export const compactAssistantSchema = tConversationSchema
  .pick({
    model: true,
    assistant_id: true,
    instructions: true,
    promptPrefix: true,
    artifacts: true,
    iconURL: true,
    greeting: true,
    spec: true,
  })
  // will change after adding temperature
  .transform(removeNullishValues)
  .catch(() => ({}));

export const agentsSchema = tConversationSchema
  .pick({
    model: true,
    modelLabel: true,
    temperature: true,
    top_p: true,
    presence_penalty: true,
    frequency_penalty: true,
    resendFiles: true,
    imageDetail: true,
    agent_id: true,
    instructions: true,
    promptPrefix: true,
    iconURL: true,
    greeting: true,
    maxContextTokens: true,
  })
  .transform((obj) => ({
    ...obj,
    model: obj.model ?? agentsSettings.model.default,
    modelLabel: obj.modelLabel ?? null,
    temperature: obj.temperature ?? 1,
    top_p: obj.top_p ?? 1,
    presence_penalty: obj.presence_penalty ?? 0,
    frequency_penalty: obj.frequency_penalty ?? 0,
    resendFiles:
      typeof obj.resendFiles === 'boolean' ? obj.resendFiles : agentsSettings.resendFiles.default,
    imageDetail: obj.imageDetail ?? ImageDetail.auto,
    agent_id: obj.agent_id ?? undefined,
    instructions: obj.instructions ?? undefined,
    promptPrefix: obj.promptPrefix ?? null,
    iconURL: obj.iconURL ?? undefined,
    greeting: obj.greeting ?? undefined,
    maxContextTokens: obj.maxContextTokens ?? undefined,
  }))
  .catch(() => ({
    model: agentsSettings.model.default,
    modelLabel: null,
    temperature: 1,
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
    resendFiles: agentsSettings.resendFiles.default,
    imageDetail: ImageDetail.auto,
    agent_id: undefined,
    instructions: undefined,
    promptPrefix: null,
    iconURL: undefined,
    greeting: undefined,
    maxContextTokens: undefined,
  }));

export const compactAgentsSchema = tConversationSchema
  .pick({
    model: true,
    agent_id: true,
    instructions: true,
    promptPrefix: true,
    iconURL: true,
    greeting: true,
    spec: true,
  })
  .transform(removeNullishValues)
  .catch(() => ({}));

export const compactOpenAISchema = tConversationSchema
  .pick({
    model: true,
    chatGptLabel: true,
    promptPrefix: true,
    temperature: true,
    top_p: true,
    presence_penalty: true,
    frequency_penalty: true,
    resendFiles: true,
    artifacts: true,
    imageDetail: true,
    stop: true,
    iconURL: true,
    greeting: true,
    spec: true,
    maxContextTokens: true,
    max_tokens: true,
  })
  .transform((obj: Partial<TConversation>) => {
    const newObj: Partial<TConversation> = { ...obj };
    if (newObj.temperature === openAISettings.temperature.default) {
      delete newObj.temperature;
    }
    if (newObj.top_p === openAISettings.top_p.default) {
      delete newObj.top_p;
    }
    if (newObj.presence_penalty === openAISettings.presence_penalty.default) {
      delete newObj.presence_penalty;
    }
    if (newObj.frequency_penalty === openAISettings.frequency_penalty.default) {
      delete newObj.frequency_penalty;
    }
    if (newObj.resendFiles === openAISettings.resendFiles.default) {
      delete newObj.resendFiles;
    }
    if (newObj.imageDetail === openAISettings.imageDetail.default) {
      delete newObj.imageDetail;
    }

    return removeNullishValues(newObj);
  })
  .catch(() => ({}));

export const compactGoogleSchema = tConversationSchema
  .pick({
    model: true,
    modelLabel: true,
    promptPrefix: true,
    examples: true,
    temperature: true,
    maxOutputTokens: true,
    artifacts: true,
    topP: true,
    topK: true,
    iconURL: true,
    greeting: true,
    spec: true,
    maxContextTokens: true,
  })
  .transform((obj) => {
    const newObj: Partial<TConversation> = { ...obj };
    if (newObj.temperature === google.temperature.default) {
      delete newObj.temperature;
    }
    if (newObj.maxOutputTokens === google.maxOutputTokens.default) {
      delete newObj.maxOutputTokens;
    }
    if (newObj.topP === google.topP.default) {
      delete newObj.topP;
    }
    if (newObj.topK === google.topK.default) {
      delete newObj.topK;
    }

    return removeNullishValues(newObj);
  })
  .catch(() => ({}));

export const compactAnthropicSchema = tConversationSchema
  .pick({
    model: true,
    modelLabel: true,
    promptPrefix: true,
    temperature: true,
    maxOutputTokens: true,
    topP: true,
    topK: true,
    resendFiles: true,
    promptCache: true,
    artifacts: true,
    iconURL: true,
    greeting: true,
    spec: true,
    maxContextTokens: true,
  })
  .transform((obj) => {
    const newObj: Partial<TConversation> = { ...obj };
    if (newObj.temperature === anthropicSettings.temperature.default) {
      delete newObj.temperature;
    }
    if (newObj.maxOutputTokens === anthropicSettings.legacy.maxOutputTokens.default) {
      delete newObj.maxOutputTokens;
    }
    if (newObj.topP === anthropicSettings.topP.default) {
      delete newObj.topP;
    }
    if (newObj.topK === anthropicSettings.topK.default) {
      delete newObj.topK;
    }
    if (newObj.resendFiles === anthropicSettings.resendFiles.default) {
      delete newObj.resendFiles;
    }
    if (newObj.promptCache === anthropicSettings.promptCache.default) {
      delete newObj.promptCache;
    }

    return removeNullishValues(newObj);
  })
  .catch(() => ({}));

export const compactChatGPTSchema = tConversationSchema
  .pick({
    model: true,
  })
  .transform((obj) => {
    const newObj: Partial<TConversation> = { ...obj };
    return removeNullishValues(newObj);
  })
  .catch(() => ({}));

export const compactPluginsSchema = tConversationSchema
  .pick({
    model: true,
    chatGptLabel: true,
    promptPrefix: true,
    temperature: true,
    top_p: true,
    presence_penalty: true,
    frequency_penalty: true,
    tools: true,
    agentOptions: true,
    iconURL: true,
    greeting: true,
    spec: true,
    maxContextTokens: true,
  })
  .transform((obj) => {
    const newObj: Partial<TConversation> = { ...obj };
    if (newObj.chatGptLabel === null) {
      delete newObj.chatGptLabel;
    }
    if (newObj.promptPrefix === null) {
      delete newObj.promptPrefix;
    }
    if (newObj.temperature === 0.8) {
      delete newObj.temperature;
    }
    if (newObj.top_p === 1) {
      delete newObj.top_p;
    }
    if (newObj.presence_penalty === 0) {
      delete newObj.presence_penalty;
    }
    if (newObj.frequency_penalty === 0) {
      delete newObj.frequency_penalty;
    }
    if (newObj.tools?.length === 0) {
      delete newObj.tools;
    }

    if (
      newObj.agentOptions &&
      newObj.agentOptions.agent === EAgent.functions &&
      newObj.agentOptions.skipCompletion === true &&
      newObj.agentOptions.model === 'gpt-3.5-turbo' &&
      newObj.agentOptions.temperature === 0
    ) {
      delete newObj.agentOptions;
    }

    return removeNullishValues(newObj);
  })
  .catch(() => ({}));
