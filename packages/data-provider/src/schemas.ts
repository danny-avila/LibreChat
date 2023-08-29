import { z } from 'zod';

export enum EModelEndpoint {
  azureOpenAI = 'azureOpenAI',
  openAI = 'openAI',
  bingAI = 'bingAI',
  chatGPTBrowser = 'chatGPTBrowser',
  google = 'google',
  gptPlugins = 'gptPlugins',
  anthropic = 'anthropic',
}

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
  title: z.string().nullable().optional(),
  sender: z.string(),
  text: z.string(),
  generation: z.string().nullable().optional(),
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
  title: z.string(),
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
    maxOutputTokens: obj.maxOutputTokens ?? 1024,
    topP: obj.topP ?? 0.7,
    topK: obj.topK ?? 5,
  }))
  .catch(() => ({
    model: 'claude-1',
    modelLabel: null,
    promptPrefix: null,
    temperature: 1,
    maxOutputTokens: 1024,
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

type EndpointSchema =
  | typeof openAISchema
  | typeof googleSchema
  | typeof bingAISchema
  | typeof anthropicSchema
  | typeof chatGPTBrowserSchema
  | typeof gptPluginsSchema;

const endpointSchemas: Record<EModelEndpoint, EndpointSchema> = {
  openAI: openAISchema,
  azureOpenAI: openAISchema,
  google: googleSchema,
  bingAI: bingAISchema,
  anthropic: anthropicSchema,
  chatGPTBrowser: chatGPTBrowserSchema,
  gptPlugins: gptPluginsSchema,
};

function getFirstDefinedValue(possibleValues: string[]) {
  let returnValue;
  for (const value of possibleValues) {
    if (value) {
      returnValue = value;
      break;
    }
  }
  return returnValue;
}

type TPossibleValues = {
  model: string[];
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

  const convo = schema.parse(conversation);

  if (possibleValues && convo) {
    convo.model = getFirstDefinedValue(possibleValues.model) ?? convo.model;
  }

  return convo;
};

export type TEndpointOption = {
  endpoint: EModelEndpoint;
  model?: string;
  promptPrefix?: string;
  temperature?: number;
  chatGptLabel?: string | null;
  modelLabel?: string | null;
  jailbreak?: boolean;
  token?: string | null;
};

export const getResponseSender = (endpointOption: TEndpointOption): string => {
  const { endpoint, chatGptLabel, modelLabel, jailbreak } = endpointOption;

  if (['openAI', 'azureOpenAI', 'gptPlugins', 'chatGPTBrowser'].includes(endpoint)) {
    return chatGptLabel ?? 'ChatGPT';
  }

  if (endpoint === 'bingAI') {
    return jailbreak ? 'Sydney' : 'BingAI';
  }

  if (endpoint === 'anthropic') {
    return modelLabel ?? 'Anthropic';
  }

  if (endpoint === 'google') {
    return modelLabel ?? 'PaLM2';
  }

  return '';
};
