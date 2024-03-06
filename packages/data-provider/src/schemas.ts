import { z } from 'zod';
import type { TMessageContentParts } from './types/assistants';
import type { TFile } from './types/files';

export const isUUID = z.string().uuid();

export enum EModelEndpoint {
  azureOpenAI = 'azureOpenAI',
  openAI = 'openAI',
  bingAI = 'bingAI',
  chatGPTBrowser = 'chatGPTBrowser',
  google = 'google',
  gptPlugins = 'gptPlugins',
  anthropic = 'anthropic',
  assistants = 'assistants',
  custom = 'custom',
}

export const defaultAssistantFormValues = {
  assistant: '',
  id: '',
  name: '',
  description: '',
  instructions: '',
  model: 'gpt-3.5-turbo-1106',
  functions: [],
  code_interpreter: false,
  retrieval: false,
};

export const endpointSettings = {
  [EModelEndpoint.google]: {
    model: {
      default: 'chat-bison',
    },
    maxOutputTokens: {
      min: 1,
      max: 2048,
      step: 1,
      default: 1024,
      maxGeminiPro: 8192,
      defaultGeminiPro: 8192,
    },
    temperature: {
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.2,
    },
    topP: {
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.8,
    },
    topK: {
      min: 1,
      max: 40,
      step: 0.01,
      default: 40,
    },
  },
};

const google = endpointSettings[EModelEndpoint.google];

export const eModelEndpointSchema = z.nativeEnum(EModelEndpoint);

export const extendedModelEndpointSchema = z.union([eModelEndpointSchema, z.string()]);

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

export const tAgentOptionsSchema = z.object({
  agent: z.string(),
  skipCompletion: z.boolean(),
  model: z.string(),
  temperature: z.number(),
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
});

export type TMessage = z.input<typeof tMessageSchema> & {
  children?: TMessage[];
  plugin?: TResPlugin | null;
  plugins?: TResPlugin[];
  content?: TMessageContentParts[];
  files?: Partial<TFile>[];
};

export const tConversationSchema = z.object({
  conversationId: z.string().nullable(),
  title: z.string().nullable().or(z.literal('New Chat')).default('New Chat'),
  user: z.string().optional(),
  endpoint: eModelEndpointSchema.nullable(),
  endpointType: eModelEndpointSchema.optional(),
  suggestions: z.array(z.string()).optional(),
  messages: z.array(z.string()).optional(),
  tools: z.array(tPluginSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  systemMessage: z.string().nullable().optional(),
  modelLabel: z.string().nullable().optional(),
  examples: z.array(tExampleSchema).optional(),
  chatGptLabel: z.string().nullable().optional(),
  userLabel: z.string().optional(),
  model: z.string().nullable().optional(),
  promptPrefix: z.string().nullable().optional(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
  context: z.string().nullable().optional(),
  top_p: z.number().optional(),
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
  jailbreak: z.boolean().optional(),
  jailbreakConversationId: z.string().nullable().optional(),
  conversationSignature: z.string().nullable().optional(),
  parentMessageId: z.string().optional(),
  clientId: z.string().nullable().optional(),
  invocationId: z.number().nullable().optional(),
  toneStyle: z.string().nullable().optional(),
  maxOutputTokens: z.number().optional(),
  agentOptions: tAgentOptionsSchema.nullable().optional(),
  file_ids: z.array(z.string()).optional(),
  /* vision */
  resendImages: z.boolean().optional(),
  imageDetail: eImageDetailSchema.optional(),
  /* assistant */
  assistant_id: z.string().optional(),
  instructions: z.string().optional(),
  /** Used to overwrite active conversation settings when saving a Preset */
  presetOverride: z.record(z.unknown()).optional(),
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

export type TConversation = z.infer<typeof tConversationSchema> & {
  presetOverride?: Partial<TPreset>;
};

// type DefaultSchemaValues = Partial<typeof google>;

export const openAISchema = tConversationSchema
  .pick({
    model: true,
    chatGptLabel: true,
    promptPrefix: true,
    temperature: true,
    top_p: true,
    presence_penalty: true,
    frequency_penalty: true,
    resendImages: true,
    imageDetail: true,
  })
  .transform((obj) => ({
    ...obj,
    model: obj.model ?? 'gpt-3.5-turbo',
    chatGptLabel: obj.chatGptLabel ?? null,
    promptPrefix: obj.promptPrefix ?? null,
    temperature: obj.temperature ?? 1,
    top_p: obj.top_p ?? 1,
    presence_penalty: obj.presence_penalty ?? 0,
    frequency_penalty: obj.frequency_penalty ?? 0,
    resendImages: obj.resendImages ?? false,
    imageDetail: obj.imageDetail ?? ImageDetail.auto,
  }))
  .catch(() => ({
    model: 'gpt-3.5-turbo',
    chatGptLabel: null,
    promptPrefix: null,
    temperature: 1,
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
    resendImages: false,
    imageDetail: ImageDetail.auto,
  }));

export const googleSchema = tConversationSchema
  .pick({
    model: true,
    modelLabel: true,
    promptPrefix: true,
    examples: true,
    temperature: true,
    maxOutputTokens: true,
    topP: true,
    topK: true,
  })
  .transform((obj) => {
    const isGeminiPro = obj?.model?.toLowerCase()?.includes('gemini-pro');

    const maxOutputTokensMax = isGeminiPro
      ? google.maxOutputTokens.maxGeminiPro
      : google.maxOutputTokens.max;
    const maxOutputTokensDefault = isGeminiPro
      ? google.maxOutputTokens.defaultGeminiPro
      : google.maxOutputTokens.default;

    let maxOutputTokens = obj.maxOutputTokens ?? maxOutputTokensDefault;
    maxOutputTokens = Math.min(maxOutputTokens, maxOutputTokensMax);

    return {
      ...obj,
      model: obj.model ?? google.model.default,
      modelLabel: obj.modelLabel ?? null,
      promptPrefix: obj.promptPrefix ?? null,
      examples: obj.examples ?? [{ input: { content: '' }, output: { content: '' } }],
      temperature: obj.temperature ?? google.temperature.default,
      maxOutputTokens,
      topP: obj.topP ?? google.topP.default,
      topK: obj.topK ?? google.topK.default,
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
    resendImages: true,
  })
  .transform((obj) => ({
    ...obj,
    model: obj.model ?? 'claude-1',
    modelLabel: obj.modelLabel ?? null,
    promptPrefix: obj.promptPrefix ?? null,
    temperature: obj.temperature ?? 1,
    maxOutputTokens: obj.maxOutputTokens ?? 4000,
    topP: obj.topP ?? 0.7,
    topK: obj.topK ?? 5,
    resendImages: obj.resendImages ?? false,
  }))
  .catch(() => ({
    model: 'claude-1',
    modelLabel: null,
    promptPrefix: null,
    temperature: 1,
    maxOutputTokens: 4000,
    topP: 0.7,
    topK: 5,
    resendImages: false,
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
    chatGptLabel: true,
    promptPrefix: true,
    temperature: true,
    top_p: true,
    presence_penalty: true,
    frequency_penalty: true,
    tools: true,
    agentOptions: true,
  })
  .transform((obj) => ({
    ...obj,
    model: obj.model ?? 'gpt-3.5-turbo',
    chatGptLabel: obj.chatGptLabel ?? null,
    promptPrefix: obj.promptPrefix ?? null,
    temperature: obj.temperature ?? 0.8,
    top_p: obj.top_p ?? 1,
    presence_penalty: obj.presence_penalty ?? 0,
    frequency_penalty: obj.frequency_penalty ?? 0,
    tools: obj.tools ?? [],
    agentOptions: obj.agentOptions ?? {
      agent: 'functions',
      skipCompletion: true,
      model: 'gpt-3.5-turbo',
      temperature: 0,
    },
  }))
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
      agent: 'functions',
      skipCompletion: true,
      model: 'gpt-3.5-turbo',
      temperature: 0,
    },
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
    promptPrefix: true,
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
    resendImages: true,
    imageDetail: true,
  })
  .transform((obj: Partial<TConversation>) => {
    const newObj: Partial<TConversation> = { ...obj };
    if (newObj.temperature === 1) {
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
    if (newObj.resendImages !== true) {
      delete newObj.resendImages;
    }
    if (newObj.imageDetail === ImageDetail.auto) {
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
    topP: true,
    topK: true,
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
    resendImages: true,
  })
  .transform((obj) => {
    const newObj: Partial<TConversation> = { ...obj };
    if (newObj.temperature === 1) {
      delete newObj.temperature;
    }
    if (newObj.maxOutputTokens === 4000) {
      delete newObj.maxOutputTokens;
    }
    if (newObj.topP === 0.7) {
      delete newObj.topP;
    }
    if (newObj.topK === 5) {
      delete newObj.topK;
    }
    if (newObj.resendImages !== true) {
      delete newObj.resendImages;
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
      newObj.agentOptions.agent === 'functions' &&
      newObj.agentOptions.skipCompletion === true &&
      newObj.agentOptions.model === 'gpt-3.5-turbo' &&
      newObj.agentOptions.temperature === 0
    ) {
      delete newObj.agentOptions;
    }

    return removeNullishValues(newObj);
  })
  .catch(() => ({}));

// const createGoogleSchema = (customGoogle: DefaultSchemaValues) => {
//   const defaults = { ...google, ...customGoogle };
//   return tConversationSchema
//     .pick({
//       model: true,
//       modelLabel: true,
//       promptPrefix: true,
//       examples: true,
//       temperature: true,
//       maxOutputTokens: true,
//       topP: true,
//       topK: true,
//     })
//     .transform((obj) => {
//       const isGeminiPro = obj?.model?.toLowerCase()?.includes('gemini-pro');

//       const maxOutputTokensMax = isGeminiPro
//         ? defaults.maxOutputTokens.maxGeminiPro
//         : defaults.maxOutputTokens.max;
//       const maxOutputTokensDefault = isGeminiPro
//         ? defaults.maxOutputTokens.defaultGeminiPro
//         : defaults.maxOutputTokens.default;

//       let maxOutputTokens = obj.maxOutputTokens ?? maxOutputTokensDefault;
//       maxOutputTokens = Math.min(maxOutputTokens, maxOutputTokensMax);

//       return {
//         ...obj,
//         model: obj.model ?? defaults.model.default,
//         modelLabel: obj.modelLabel ?? null,
//         promptPrefix: obj.promptPrefix ?? null,
//         examples: obj.examples ?? [{ input: { content: '' }, output: { content: '' } }],
//         temperature: obj.temperature ?? defaults.temperature.default,
//         maxOutputTokens,
//         topP: obj.topP ?? defaults.topP.default,
//         topK: obj.topK ?? defaults.topK.default,
//       };
//     })
//     .catch(() => ({
//       model: defaults.model.default,
//       modelLabel: null,
//       promptPrefix: null,
//       examples: [{ input: { content: '' }, output: { content: '' } }],
//       temperature: defaults.temperature.default,
//       maxOutputTokens: defaults.maxOutputTokens.default,
//       topP: defaults.topP.default,
//       topK: defaults.topK.default,
//     }));
// };
