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
}

export const EndpointURLs: { [key in EModelEndpoint]: string } = {
  [EModelEndpoint.azureOpenAI]: '/api/ask/azureOpenAI',
  [EModelEndpoint.openAI]: '/api/ask/openAI',
  [EModelEndpoint.bingAI]: '/api/ask/bingAI',
  [EModelEndpoint.chatGPTBrowser]: '/api/ask/chatGPTBrowser',
  [EModelEndpoint.google]: '/api/ask/google',
  [EModelEndpoint.gptPlugins]: '/api/ask/gptPlugins',
  [EModelEndpoint.anthropic]: '/api/ask/anthropic',
  [EModelEndpoint.assistant]: '/api/assistants/chat',
};

export const modularEndpoints = new Set<EModelEndpoint | string>([
  EModelEndpoint.gptPlugins,
  EModelEndpoint.anthropic,
  EModelEndpoint.google,
  EModelEndpoint.openAI,
]);

export const eModelEndpointSchema = z.nativeEnum(EModelEndpoint);

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
  submitting: z.boolean().optional(),
  searchResult: z.boolean().optional(),
  finish_reason: z.string().optional(),
});

export type TMessage = z.input<typeof tMessageSchema> & {
  children?: TMessage[];
  plugin?: TResPlugin | null;
  plugins?: TResPlugin[];
};

export const tConversationSchema = z.object({
  conversationId: z.string().nullable(),
  title: z.string().nullable().or(z.literal('New Chat')).default('New Chat'),
  user: z.string().optional(),
  endpoint: eModelEndpointSchema.nullable(),
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
    }),
  );

export type TPreset = z.infer<typeof tPresetSchema>;

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
  .transform((obj) => ({
    ...obj,
    model: obj.model ?? 'chat-bison',
    modelLabel: obj.modelLabel ?? null,
    promptPrefix: obj.promptPrefix ?? null,
    temperature: obj.temperature ?? 0.2,
    maxOutputTokens: obj.maxOutputTokens ?? 1024,
    topP: obj.topP ?? 0.95,
    topK: obj.topK ?? 40,
  }))
  .catch(() => ({
    model: 'chat-bison',
    modelLabel: null,
    promptPrefix: null,
    temperature: 0.2,
    maxOutputTokens: 1024,
    topP: 0.95,
    topK: 40,
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
  [EModelEndpoint.google]: googleSchema,
  [EModelEndpoint.bingAI]: bingAISchema,
  [EModelEndpoint.anthropic]: anthropicSchema,
  [EModelEndpoint.chatGPTBrowser]: chatGPTBrowserSchema,
  [EModelEndpoint.gptPlugins]: gptPluginsSchema,
  [EModelEndpoint.assistant]: assistantSchema,
};

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

export const parseConvo = (
  endpoint: EModelEndpoint,
  conversation: Partial<TConversation | TPreset>,
  possibleValues?: TPossibleValues,
) => {
  const schema = endpointSchemas[endpoint];

  if (!schema) {
    throw new Error(`Unknown endpoint: ${endpoint}`);
  }

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
  const { endpoint, chatGptLabel, modelLabel, jailbreak } = endpointOption;

  if (
    [
      EModelEndpoint.openAI,
      EModelEndpoint.azureOpenAI,
      EModelEndpoint.gptPlugins,
      EModelEndpoint.chatGPTBrowser,
    ].includes(endpoint)
  ) {
    return chatGptLabel ?? 'ChatGPT';
  }

  if (endpoint === EModelEndpoint.bingAI) {
    return jailbreak ? 'Sydney' : 'BingAI';
  }

  if (endpoint === EModelEndpoint.anthropic) {
    return modelLabel ?? 'Anthropic';
  }

  if (endpoint === EModelEndpoint.google) {
    return modelLabel ?? 'PaLM2';
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
    if (newObj.model === 'chat-bison') {
      delete newObj.model;
    }
    if (newObj.temperature === 0.2) {
      delete newObj.temperature;
    }
    if (newObj.maxOutputTokens === 1024) {
      delete newObj.maxOutputTokens;
    }
    if (newObj.topP === 0.95) {
      delete newObj.topP;
    }
    if (newObj.topK === 40) {
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
  assistant: assistantSchema,
  google: compactGoogleSchema,
  /* BingAI needs all fields */
  bingAI: bingAISchema,
  anthropic: compactAnthropicSchema,
  chatGPTBrowser: compactChatGPTSchema,
  gptPlugins: compactPluginsSchema,
};

export const parseCompactConvo = (
  endpoint: EModelEndpoint | undefined,
  conversation: Partial<TConversation | TPreset>,
  possibleValues?: TPossibleValues,
) => {
  if (!endpoint) {
    throw new Error(`undefined endpoint: ${endpoint}`);
  }

  const schema = compactEndpointSchemas[endpoint];

  if (!schema) {
    throw new Error(`Unknown endpoint: ${endpoint}`);
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
