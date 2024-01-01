import { z } from 'zod';

export enum EModelEndpoint {
  azureOpenAI = 'azureOpenAI',
  openAI = 'openAI',
  bingAI = 'bingAI',
  chatGPTBrowser = 'chatGPTBrowser',
  google = 'google',
  gptPlugins = 'gptPlugins',
  anthropic = 'anthropic',
  assistant = 'assistant',
  custom = 'custom',
}

export const defaultEndpoints: EModelEndpoint[] = [
  EModelEndpoint.openAI,
  EModelEndpoint.assistant,
  EModelEndpoint.azureOpenAI,
  EModelEndpoint.bingAI,
  EModelEndpoint.chatGPTBrowser,
  EModelEndpoint.gptPlugins,
  EModelEndpoint.google,
  EModelEndpoint.anthropic,
  EModelEndpoint.custom,
];

export const defaultModels = {
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
    'claude-2.1',
    'claude-2',
    'claude-1.2',
    'claude-1',
    'claude-1-100k',
    'claude-instant-1',
    'claude-instant-1-100k',
  ],
  [EModelEndpoint.openAI]: [
    'gpt-3.5-turbo-16k-0613',
    'gpt-3.5-turbo-16k',
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

export const alternateName = {
  [EModelEndpoint.openAI]: 'OpenAI',
  [EModelEndpoint.assistant]: 'Assistants',
  [EModelEndpoint.azureOpenAI]: 'Azure OpenAI',
  [EModelEndpoint.bingAI]: 'Bing',
  [EModelEndpoint.chatGPTBrowser]: 'ChatGPT',
  [EModelEndpoint.gptPlugins]: 'Plugins',
  [EModelEndpoint.google]: 'Google',
  [EModelEndpoint.anthropic]: 'Anthropic',
  [EModelEndpoint.custom]: 'Custom',
};

export enum AuthKeys {
  GOOGLE_SERVICE_KEY = 'GOOGLE_SERVICE_KEY',
  GOOGLE_API_KEY = 'GOOGLE_API_KEY',
}

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

export const EndpointURLs: { [key in EModelEndpoint]: string } = {
  [EModelEndpoint.openAI]: `/api/ask/${EModelEndpoint.openAI}`,
  [EModelEndpoint.bingAI]: `/api/ask/${EModelEndpoint.bingAI}`,
  [EModelEndpoint.google]: `/api/ask/${EModelEndpoint.google}`,
  [EModelEndpoint.custom]: `/api/ask/${EModelEndpoint.custom}`,
  [EModelEndpoint.anthropic]: `/api/ask/${EModelEndpoint.anthropic}`,
  [EModelEndpoint.gptPlugins]: `/api/ask/${EModelEndpoint.gptPlugins}`,
  [EModelEndpoint.azureOpenAI]: `/api/ask/${EModelEndpoint.azureOpenAI}`,
  [EModelEndpoint.chatGPTBrowser]: `/api/ask/${EModelEndpoint.chatGPTBrowser}`,
  [EModelEndpoint.assistant]: '/api/assistants/chat',
};

export const modularEndpoints = new Set<EModelEndpoint | string>([
  EModelEndpoint.gptPlugins,
  EModelEndpoint.anthropic,
  EModelEndpoint.google,
  EModelEndpoint.openAI,
  EModelEndpoint.azureOpenAI,
  EModelEndpoint.custom,
]);

export const supportsFiles = {
  [EModelEndpoint.openAI]: true,
  [EModelEndpoint.google]: true,
  [EModelEndpoint.assistant]: true,
  [EModelEndpoint.azureOpenAI]: true,
  [EModelEndpoint.custom]: true,
};

export const supportsBalanceCheck = {
  [EModelEndpoint.openAI]: true,
  [EModelEndpoint.azureOpenAI]: true,
  [EModelEndpoint.gptPlugins]: true,
  [EModelEndpoint.custom]: true,
};

export const visionModels = ['gpt-4-vision', 'llava-13b', 'gemini-pro-vision'];

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

export const tAgentOptionsSchema = z.object({
  agent: z.string(),
  skipCompletion: z.boolean(),
  model: z.string(),
  temperature: z.number(),
});

export const tMessageSchema = z.object({
  messageId: z.string(),
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
});

export type TMessage = z.input<typeof tMessageSchema> & {
  children?: TMessage[];
  plugin?: TResPlugin | null;
  plugins?: TResPlugin[];
  files?: {
    type: string;
    file_id: string;
    filename?: string;
    preview?: string;
    filepath?: string;
    height?: number;
    width?: number;
  }[];
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
  /* assistant */
  assistant_id: z.string().optional(),
  thread_id: z.string().optional(),
});

export type TConversation = z.infer<typeof tConversationSchema>;

export const tPresetSchema = tConversationSchema
  .omit({
    conversationId: true,
    createdAt: true,
    updatedAt: true,
    title: true,
  })
  .merge(
    z.object({
      conversationId: z.string().optional(),
      presetId: z.string().nullable().optional(),
      title: z.string().nullable().optional(),
      defaultPreset: z.boolean().optional(),
      order: z.number().optional(),
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
  }))
  .catch(() => ({
    model: 'gpt-3.5-turbo',
    chatGptLabel: null,
    promptPrefix: null,
    temperature: 1,
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
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
  }))
  .catch(() => ({
    model: 'claude-1',
    modelLabel: null,
    promptPrefix: null,
    temperature: 1,
    maxOutputTokens: 4000,
    topP: 0.7,
    topK: 5,
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
    thread_id: true,
  })
  .transform(removeNullishValues)
  .catch(() => ({}));

type EndpointSchema =
  | typeof openAISchema
  | typeof googleSchema
  | typeof bingAISchema
  | typeof anthropicSchema
  | typeof chatGPTBrowserSchema
  | typeof gptPluginsSchema
  | typeof assistantSchema;

const endpointSchemas: Record<EModelEndpoint, EndpointSchema> = {
  [EModelEndpoint.openAI]: openAISchema,
  [EModelEndpoint.azureOpenAI]: openAISchema,
  [EModelEndpoint.custom]: openAISchema,
  [EModelEndpoint.google]: googleSchema,
  [EModelEndpoint.bingAI]: bingAISchema,
  [EModelEndpoint.anthropic]: anthropicSchema,
  [EModelEndpoint.chatGPTBrowser]: chatGPTBrowserSchema,
  [EModelEndpoint.gptPlugins]: gptPluginsSchema,
  [EModelEndpoint.assistant]: assistantSchema,
};

// const schemaCreators: Record<EModelEndpoint, (customSchema: DefaultSchemaValues) => EndpointSchema> = {
//   [EModelEndpoint.google]: createGoogleSchema,
// };

export function getFirstDefinedValue(possibleValues: string[]) {
  let returnValue;
  for (const value of possibleValues) {
    if (value) {
      returnValue = value;
      break;
    }
  }
  return returnValue;
}

export type TPossibleValues = {
  models: string[];
  secondaryModels?: string[];
};

export const parseConvo = ({
  endpoint,
  endpointType,
  conversation,
  possibleValues,
}: {
  endpoint: EModelEndpoint;
  endpointType?: EModelEndpoint;
  conversation: Partial<TConversation | TPreset>;
  possibleValues?: TPossibleValues;
  // TODO: POC for default schema
  // defaultSchema?: Partial<EndpointSchema>,
}) => {
  let schema = endpointSchemas[endpoint];

  if (!schema && !endpointType) {
    throw new Error(`Unknown endpoint: ${endpoint}`);
  } else if (!schema && endpointType) {
    schema = endpointSchemas[endpointType];
  }

  // if (defaultSchema && schemaCreators[endpoint]) {
  //   schema = schemaCreators[endpoint](defaultSchema);
  // }

  const convo = schema.parse(conversation) as TConversation;
  const { models, secondaryModels } = possibleValues ?? {};

  if (models && convo) {
    convo.model = getFirstDefinedValue(models) ?? convo.model;
  }

  if (secondaryModels && convo.agentOptions) {
    convo.agentOptions.model = getFirstDefinedValue(secondaryModels) ?? convo.agentOptions.model;
  }

  return convo;
};

export type TEndpointOption = {
  endpoint: EModelEndpoint;
  model?: string | null;
  promptPrefix?: string;
  temperature?: number;
  chatGptLabel?: string | null;
  modelLabel?: string | null;
  jailbreak?: boolean;
  key?: string | null;
};

export const getResponseSender = (endpointOption: TEndpointOption): string => {
  const { model, endpoint, chatGptLabel, modelLabel, jailbreak } = endpointOption;

  if (
    [
      EModelEndpoint.openAI,
      EModelEndpoint.azureOpenAI,
      EModelEndpoint.gptPlugins,
      EModelEndpoint.chatGPTBrowser,
    ].includes(endpoint)
  ) {
    if (chatGptLabel) {
      return chatGptLabel;
    } else if (model && model.includes('gpt-3')) {
      return 'GPT-3.5';
    } else if (model && model.includes('gpt-4')) {
      return 'GPT-4';
    }
    return alternateName[endpoint] ?? 'ChatGPT';
  }

  if (endpoint === EModelEndpoint.bingAI) {
    return jailbreak ? 'Sydney' : 'BingAI';
  }

  if (endpoint === EModelEndpoint.anthropic) {
    return modelLabel ?? 'Claude';
  }

  if (endpoint === EModelEndpoint.google) {
    if (modelLabel) {
      return modelLabel;
    } else if (model && model.includes('gemini')) {
      return 'Gemini';
    } else if (model && model.includes('code')) {
      return 'Codey';
    }

    return 'PaLM2';
  }

  if (endpoint === EModelEndpoint.custom) {
    if (modelLabel) {
      return modelLabel;
    }

    return 'AI';
  }

  return '';
};

export const compactOpenAISchema = tConversationSchema
  .pick({
    model: true,
    chatGptLabel: true,
    promptPrefix: true,
    temperature: true,
    top_p: true,
    presence_penalty: true,
    frequency_penalty: true,
  })
  .transform((obj: Partial<TConversation>) => {
    const newObj: Partial<TConversation> = { ...obj };
    if (newObj.model === 'gpt-3.5-turbo') {
      delete newObj.model;
    }
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
    if (newObj.model === google.model.default) {
      delete newObj.model;
    }
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
  })
  .transform((obj) => {
    const newObj: Partial<TConversation> = { ...obj };
    if (newObj.model === 'claude-1') {
      delete newObj.model;
    }
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

    return removeNullishValues(newObj);
  })
  .catch(() => ({}));

export const compactChatGPTSchema = tConversationSchema
  .pick({
    model: true,
  })
  .transform((obj) => {
    const newObj: Partial<TConversation> = { ...obj };
    // model: obj.model ?? 'text-davinci-002-render-sha',
    if (newObj.model === 'text-davinci-002-render-sha') {
      delete newObj.model;
    }

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
    if (newObj.model === 'gpt-3.5-turbo') {
      delete newObj.model;
    }
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

type CompactEndpointSchema =
  | typeof compactOpenAISchema
  | typeof assistantSchema
  | typeof compactGoogleSchema
  | typeof bingAISchema
  | typeof compactAnthropicSchema
  | typeof compactChatGPTSchema
  | typeof compactPluginsSchema;

const compactEndpointSchemas: Record<string, CompactEndpointSchema> = {
  openAI: compactOpenAISchema,
  azureOpenAI: compactOpenAISchema,
  custom: compactOpenAISchema,
  assistant: assistantSchema,
  google: compactGoogleSchema,
  /* BingAI needs all fields */
  bingAI: bingAISchema,
  anthropic: compactAnthropicSchema,
  chatGPTBrowser: compactChatGPTSchema,
  gptPlugins: compactPluginsSchema,
};

export const parseCompactConvo = ({
  endpoint,
  endpointType,
  conversation,
  possibleValues,
}: {
  endpoint?: EModelEndpoint;
  endpointType?: EModelEndpoint;
  conversation: Partial<TConversation | TPreset>;
  possibleValues?: TPossibleValues;
  // TODO: POC for default schema
  // defaultSchema?: Partial<EndpointSchema>,
}) => {
  if (!endpoint) {
    throw new Error(`undefined endpoint: ${endpoint}`);
  }

  let schema = compactEndpointSchemas[endpoint];

  if (!schema && !endpointType) {
    throw new Error(`Unknown endpoint: ${endpoint}`);
  } else if (!schema && endpointType) {
    schema = compactEndpointSchemas[endpointType];
  }

  const convo = schema.parse(conversation) as TConversation;
  // const { models, secondaryModels } = possibleValues ?? {};
  const { models } = possibleValues ?? {};

  if (models && convo) {
    convo.model = getFirstDefinedValue(models) ?? convo.model;
  }

  // if (secondaryModels && convo.agentOptions) {
  //   convo.agentOptionmodel = getFirstDefinedValue(secondaryModels) ?? convo.agentOptionmodel;
  // }

  return convo;
};

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
   * Key for the model config cache.
   */
  MODELS_CONFIG = 'modelsConfig',
  /**
   * Key for the default endpoint config cache.
   */
  ENDPOINT_CONFIG = 'endpointsConfig',
  /**
   * Key for the custom config cache.
   */
  CUSTOM_CONFIG = 'customConfig',
  /**
   * Key for the override config cache.
   */
  OVERRIDE_CONFIG = 'overrideConfig',
}
