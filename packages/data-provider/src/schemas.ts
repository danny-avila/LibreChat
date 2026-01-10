import { z } from 'zod';
import { Tools } from './types/assistants';
import type { TMessageContentParts, FunctionTool, FunctionToolCall } from './types/assistants';
import { TFeedback, feedbackSchema } from './feedback';
import type { SearchResultData } from './types/web';
import type { TFile } from './types/files';

export const isUUID = z.string().uuid();

export enum AuthType {
  OVERRIDE_AUTH = 'override_auth',
  USER_PROVIDED = 'user_provided',
  SYSTEM_DEFINED = 'system_defined',
}

export const authTypeSchema = z.nativeEnum(AuthType);

export enum EModelEndpoint {
  azureOpenAI = 'azureOpenAI',
  openAI = 'openAI',
  google = 'google',
  anthropic = 'anthropic',
  assistants = 'assistants',
  azureAssistants = 'azureAssistants',
  agents = 'agents',
  custom = 'custom',
  bedrock = 'bedrock',
}

/** Mirrors `@librechat/agents` providers */
export enum Providers {
  OPENAI = 'openAI',
  ANTHROPIC = 'anthropic',
  AZURE = 'azureOpenAI',
  GOOGLE = 'google',
  VERTEXAI = 'vertexai',
  BEDROCK = 'bedrock',
  MISTRALAI = 'mistralai',
  MISTRAL = 'mistral',
  DEEPSEEK = 'deepseek',
  OPENROUTER = 'openrouter',
  XAI = 'xai',
}

/**
 * Endpoints that support direct PDF processing in the agent system
 */
export const documentSupportedProviders = new Set<string>([
  EModelEndpoint.anthropic,
  EModelEndpoint.openAI,
  EModelEndpoint.custom,
  // handled in AttachFileMenu and DragDropModal since azureOpenAI only supports documents with Use Responses API set to true
  // EModelEndpoint.azureOpenAI,
  EModelEndpoint.google,
  Providers.VERTEXAI,
  Providers.MISTRALAI,
  Providers.MISTRAL,
  Providers.DEEPSEEK,
  Providers.OPENROUTER,
  Providers.XAI,
]);

const openAILikeProviders = new Set<string>([
  Providers.OPENAI,
  Providers.AZURE,
  EModelEndpoint.custom,
  Providers.MISTRALAI,
  Providers.MISTRAL,
  Providers.DEEPSEEK,
  Providers.OPENROUTER,
  Providers.XAI,
]);

export const isOpenAILikeProvider = (provider?: string | null): boolean => {
  return openAILikeProviders.has(provider ?? '');
};

export const isDocumentSupportedProvider = (provider?: string | null): boolean => {
  return documentSupportedProviders.has(provider ?? '');
};

export const paramEndpoints = new Set<EModelEndpoint | string>([
  EModelEndpoint.agents,
  EModelEndpoint.openAI,
  EModelEndpoint.bedrock,
  EModelEndpoint.azureOpenAI,
  EModelEndpoint.anthropic,
  EModelEndpoint.custom,
  EModelEndpoint.google,
]);

export enum BedrockProviders {
  AI21 = 'ai21',
  Amazon = 'amazon',
  Anthropic = 'anthropic',
  Cohere = 'cohere',
  DeepSeek = 'deepseek',
  Meta = 'meta',
  MistralAI = 'mistral',
  Moonshot = 'moonshot',
  StabilityAI = 'stability',
}

export const getModelKey = (endpoint: EModelEndpoint | string, model: string) => {
  if (endpoint === EModelEndpoint.bedrock) {
    const parts = model.split('.');
    const provider = [parts[0], parts[1]].find((part) =>
      Object.values(BedrockProviders).includes(part as BedrockProviders),
    );
    return (provider ?? parts[0]) as BedrockProviders;
  }
  return model;
};

export const getSettingsKeys = (endpoint: EModelEndpoint | string, model: string) => {
  const endpointKey = endpoint;
  const modelKey = getModelKey(endpointKey, model);
  const combinedKey = `${endpointKey}-${modelKey}`;
  return [combinedKey, endpointKey];
};

export type AssistantsEndpoint = EModelEndpoint.assistants | EModelEndpoint.azureAssistants;

export const isAssistantsEndpoint = (_endpoint?: AssistantsEndpoint | null | string): boolean => {
  const endpoint = _endpoint ?? '';
  if (!endpoint) {
    return false;
  }
  return endpoint.toLowerCase().endsWith(EModelEndpoint.assistants);
};

export type AgentProvider = Exclude<keyof typeof EModelEndpoint, EModelEndpoint.agents> | string;

export const isAgentsEndpoint = (_endpoint?: EModelEndpoint.agents | null | string): boolean => {
  const endpoint = _endpoint ?? '';
  if (!endpoint) {
    return false;
  }
  return endpoint === EModelEndpoint.agents;
};

export const isParamEndpoint = (
  endpoint: EModelEndpoint | string,
  endpointType?: EModelEndpoint | string,
): boolean => {
  if (paramEndpoints.has(endpoint)) {
    return true;
  }

  if (endpointType != null) {
    return paramEndpoints.has(endpointType);
  }

  return false;
};

export enum ImageDetail {
  low = 'low',
  auto = 'auto',
  high = 'high',
}

export enum ReasoningEffort {
  unset = '',
  none = 'none',
  minimal = 'minimal',
  low = 'low',
  medium = 'medium',
  high = 'high',
  xhigh = 'xhigh',
}

export enum ReasoningSummary {
  none = '',
  auto = 'auto',
  concise = 'concise',
  detailed = 'detailed',
}

export enum Verbosity {
  none = '',
  low = 'low',
  medium = 'medium',
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
export const eReasoningEffortSchema = z.nativeEnum(ReasoningEffort);
export const eReasoningSummarySchema = z.nativeEnum(ReasoningSummary);
export const eVerbositySchema = z.nativeEnum(Verbosity);

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
  append_current_datetime: false,
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
  projectIds: [],
  edges: [],
  artifacts: '',
  /** @deprecated Use ACL permissions instead */
  isCollaborative: false,
  recursion_limit: undefined,
  [Tools.execute_code]: false,
  [Tools.file_search]: false,
  [Tools.web_search]: false,
  category: 'general',
  support_contact: {
    name: '',
    email: '',
  },
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
    default: 'gpt-4o-mini' as const,
  },
  temperature: {
    min: 0 as const,
    max: 2 as const,
    step: 0.01 as const,
    default: 1 as const,
  },
  top_p: {
    min: 0 as const,
    max: 1 as const,
    step: 0.01 as const,
    default: 1 as const,
  },
  presence_penalty: {
    min: -2 as const,
    max: 2 as const,
    step: 0.01 as const,
    default: 0 as const,
  },
  frequency_penalty: {
    min: -2 as const,
    max: 2 as const,
    step: 0.01 as const,
    default: 0 as const,
  },
  resendFiles: {
    default: true as const,
  },
  maxContextTokens: {
    default: undefined,
  },
  max_tokens: {
    default: undefined,
  },
  imageDetail: {
    default: ImageDetail.auto as const,
    min: 0 as const,
    max: 2 as const,
    step: 1 as const,
  },
};

export const googleSettings = {
  model: {
    default: 'gemini-1.5-flash-latest' as const,
  },
  maxOutputTokens: {
    min: 1 as const,
    max: 64000 as const,
    step: 1 as const,
    default: 8192 as const,
  },
  temperature: {
    min: 0 as const,
    max: 2 as const,
    step: 0.01 as const,
    default: 1 as const,
  },
  topP: {
    min: 0 as const,
    max: 1 as const,
    step: 0.01 as const,
    default: 0.95 as const,
  },
  topK: {
    min: 1 as const,
    max: 40 as const,
    step: 1 as const,
    default: 40 as const,
  },
  thinking: {
    default: true as const,
  },
  thinkingBudget: {
    min: -1 as const,
    max: 32000 as const,
    step: 1 as const,
    /** `-1` = Dynamic Thinking, meaning the model will adjust
     * the budget based on the complexity of the request.
     */
    default: -1 as const,
  },
};

const ANTHROPIC_MAX_OUTPUT = 128000 as const;
const CLAUDE_4_64K_MAX_OUTPUT = 64000 as const;
const CLAUDE_32K_MAX_OUTPUT = 32000 as const;
const DEFAULT_MAX_OUTPUT = 8192 as const;
const LEGACY_ANTHROPIC_MAX_OUTPUT = 4096 as const;
export const anthropicSettings = {
  model: {
    default: 'claude-3-5-sonnet-latest' as const,
  },
  temperature: {
    min: 0 as const,
    max: 1 as const,
    step: 0.01 as const,
    default: 1 as const,
  },
  promptCache: {
    default: true as const,
  },
  thinking: {
    default: true as const,
  },
  thinkingBudget: {
    min: 1024 as const,
    step: 100 as const,
    max: 200000 as const,
    default: 2000 as const,
  },
  maxOutputTokens: {
    min: 1 as const,
    max: ANTHROPIC_MAX_OUTPUT,
    step: 1 as const,
    default: DEFAULT_MAX_OUTPUT,
    reset: (modelName: string) => {
      if (/claude-(?:sonnet|haiku)[-.]?[4-9]/.test(modelName)) {
        return CLAUDE_4_64K_MAX_OUTPUT;
      }

      if (/claude-opus[-.]?(?:[5-9]|4[-.]?([5-9]|\d{2,}))/.test(modelName)) {
        return CLAUDE_4_64K_MAX_OUTPUT;
      }

      if (/claude-opus[-.]?[4-9]/.test(modelName)) {
        return CLAUDE_32K_MAX_OUTPUT;
      }

      return DEFAULT_MAX_OUTPUT;
    },
    set: (value: number, modelName: string) => {
      if (/claude-(?:sonnet|haiku)[-.]?[4-9]/.test(modelName) && value > CLAUDE_4_64K_MAX_OUTPUT) {
        return CLAUDE_4_64K_MAX_OUTPUT;
      }

      if (/claude-opus[-.]?(?:[5-9]|4[-.]?([5-9]|\d{2,}))/.test(modelName)) {
        if (value > CLAUDE_4_64K_MAX_OUTPUT) {
          return CLAUDE_4_64K_MAX_OUTPUT;
        }
        return value;
      }

      if (/claude-opus[-.]?[4-9]/.test(modelName) && value > CLAUDE_32K_MAX_OUTPUT) {
        return CLAUDE_32K_MAX_OUTPUT;
      }

      if (value > ANTHROPIC_MAX_OUTPUT) {
        return ANTHROPIC_MAX_OUTPUT;
      }

      return value;
    },
  },
  topP: {
    min: 0 as const,
    max: 1 as const,
    step: 0.01 as const,
    default: 0.7 as const,
  },
  topK: {
    min: 1 as const,
    max: 40 as const,
    step: 1 as const,
    default: 5 as const,
  },
  resendFiles: {
    default: true as const,
  },
  maxContextTokens: {
    default: undefined,
  },
  legacy: {
    maxOutputTokens: {
      min: 1 as const,
      max: LEGACY_ANTHROPIC_MAX_OUTPUT,
      step: 1 as const,
      default: LEGACY_ANTHROPIC_MAX_OUTPUT,
    },
  },
  web_search: {
    default: false as const,
  },
};

export const agentsSettings = {
  model: {
    default: 'gpt-3.5-turbo-test' as const,
  },
  temperature: {
    min: 0 as const,
    max: 1 as const,
    step: 0.01 as const,
    default: 1 as const,
  },
  top_p: {
    min: 0 as const,
    max: 1 as const,
    step: 0.01 as const,
    default: 1 as const,
  },
  presence_penalty: {
    min: -2 as const,
    max: 2 as const,
    step: 0.01 as const,
    default: 0 as const,
  },
  frequency_penalty: {
    min: -2 as const,
    max: 2 as const,
    step: 0.01 as const,
    default: 0 as const,
  },
  resendFiles: {
    default: true as const,
  },
  maxContextTokens: {
    default: undefined,
  },
  max_tokens: {
    default: undefined,
  },
  imageDetail: {
    default: ImageDetail.auto as const,
  },
};

export const endpointSettings = {
  [EModelEndpoint.openAI]: openAISettings,
  [EModelEndpoint.google]: googleSettings,
  [EModelEndpoint.anthropic]: anthropicSettings,
  [EModelEndpoint.agents]: agentsSettings,
  [EModelEndpoint.bedrock]: agentsSettings,
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
  description: z.string().optional(),
  icon: z.string().optional(),
  authConfig: z.array(tPluginAuthConfigSchema).optional(),
  authenticated: z.boolean().optional(),
  chatMenu: z.boolean().optional(),
  isButton: z.boolean().optional(),
  toolkit: z.boolean().optional(),
});

export type TPlugin = z.infer<typeof tPluginSchema>;

export type TInput = {
  inputStr: string;
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
  sender: z.string().optional(),
  text: z.string(),
  /** @deprecated */
  generation: z.string().nullable().optional(),
  isCreatedByUser: z.boolean(),
  error: z.boolean().optional(),
  clientTimestamp: z.string().optional(),
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
  iconURL: z.string().nullable().optional(),
  feedback: feedbackSchema.optional(),
  /** metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type MemoryArtifact = {
  key: string;
  value?: string;
  tokenCount?: number;
  type: 'update' | 'delete' | 'error';
};

export type UIResource = {
  resourceId: string;
  uri: string;
  mimeType?: string;
  text?: string;
  [key: string]: unknown;
};

export type TAttachmentMetadata = {
  type?: Tools;
  messageId: string;
  toolCallId: string;
  [Tools.memory]?: MemoryArtifact;
  [Tools.ui_resources]?: UIResource[];
  [Tools.web_search]?: SearchResultData;
  [Tools.file_search]?: SearchResultData;
};

export type TAttachment =
  | (TFile & TAttachmentMetadata)
  | (Pick<TFile, 'filename' | 'filepath' | 'conversationId'> & {
      expiresAt: number;
    } & TAttachmentMetadata)
  | (Partial<Pick<TFile, 'filename' | 'filepath'>> &
      Pick<TFile, 'conversationId'> &
      TAttachmentMetadata);

export type TMessage = z.input<typeof tMessageSchema> & {
  children?: TMessage[];
  content?: TMessageContentParts[];
  files?: Partial<TFile>[];
  depth?: number;
  siblingIndex?: number;
  attachments?: TAttachment[];
  clientTimestamp?: string;
  feedback?: TFeedback;
};

export const coerceNumber = z.union([z.number(), z.string()]).transform((val) => {
  if (typeof val === 'string') {
    return val.trim() === '' ? undefined : parseFloat(val);
  }
  return val;
});

type DocumentTypeValue =
  | null
  | boolean
  | number
  | string
  | DocumentTypeValue[]
  | { [key: string]: DocumentTypeValue };

const DocumentType: z.ZodType<DocumentTypeValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(z.lazy(() => DocumentType)),
    z.record(z.lazy(() => DocumentType)),
  ]),
);

export const tConversationSchema = z.object({
  conversationId: z.string().nullable(),
  endpoint: eModelEndpointSchema.nullable(),
  endpointType: eModelEndpointSchema.nullable().optional(),
  isArchived: z.boolean().optional(),
  title: z.string().nullable().or(z.literal('New Chat')).default('New Chat'),
  user: z.string().optional(),
  messages: z.array(z.string()).optional(),
  tools: z.union([z.array(tPluginSchema), z.array(z.string())]).optional(),
  modelLabel: z.string().nullable().optional(),
  userLabel: z.string().optional(),
  model: z.string().nullable().optional(),
  promptPrefix: z.string().nullable().optional(),
  temperature: z.number().nullable().optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
  top_p: z.number().optional(),
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
  parentMessageId: z.string().optional(),
  maxOutputTokens: coerceNumber.nullable().optional(),
  maxContextTokens: coerceNumber.optional(),
  max_tokens: coerceNumber.optional(),
  /* Anthropic */
  promptCache: z.boolean().optional(),
  system: z.string().optional(),
  thinking: z.boolean().optional(),
  thinkingBudget: coerceNumber.optional(),
  stream: z.boolean().optional(),
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
  resendFiles: z.boolean().optional(),
  file_ids: z.array(z.string()).optional(),
  /* vision */
  imageDetail: eImageDetailSchema.optional(),
  /* OpenAI: Reasoning models only */
  reasoning_effort: eReasoningEffortSchema.optional().nullable(),
  reasoning_summary: eReasoningSummarySchema.optional().nullable(),
  /* OpenAI: Verbosity control */
  verbosity: eVerbositySchema.optional().nullable(),
  /* OpenAI: use Responses API */
  useResponsesApi: z.boolean().optional(),
  /* OpenAI Responses API / Anthropic API / Google API */
  web_search: z.boolean().optional(),
  /* disable streaming */
  disableStreaming: z.boolean().optional(),
  /* assistant */
  assistant_id: z.string().optional(),
  /* agents */
  agent_id: z.string().optional(),
  /* AWS Bedrock */
  region: z.string().optional(),
  maxTokens: coerceNumber.optional(),
  additionalModelRequestFields: DocumentType.optional(),
  /* assistants */
  instructions: z.string().optional(),
  additional_instructions: z.string().optional(),
  append_current_datetime: z.boolean().optional(),
  /** Used to overwrite active conversation settings when saving a Preset */
  presetOverride: z.record(z.unknown()).optional(),
  stop: z.array(z.string()).optional(),
  /* frontend components */
  greeting: z.string().optional(),
  spec: z.string().nullable().optional(),
  iconURL: z.string().nullable().optional(),
  /* temporary chat */
  expiredAt: z.string().nullable().optional(),
  /* file token limits */
  fileTokenLimit: coerceNumber.optional(),
  /** @deprecated */
  resendImages: z.boolean().optional(),
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
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  }),
);

export const tQueryParamsSchema = tConversationSchema
  .pick({
    // librechat settings
    /** The model spec to be used */
    spec: true,
    /** The AI context window, overrides the system-defined window as determined by `model` value */
    maxContextTokens: true,
    /**
     * Whether or not to re-submit files from previous messages on subsequent messages
     * */
    resendFiles: true,
    /**
     * @endpoints openAI, custom, azureOpenAI
     *
     * System parameter that only affects the above endpoints.
     * Image detail for re-sizing according to OpenAI spec, defaults to `auto`
     * */
    imageDetail: true,
    /**
     * AKA Custom Instructions, dynamically added to chat history as a system message;
     * for `bedrock` endpoint, this is used as the `system` model param if the provider uses it;
     * for `assistants` endpoint, this is used as the `additional_instructions` model param:
     * https://platform.openai.com/docs/api-reference/runs/createRun#runs-createrun-additional_instructions
     * ; otherwise, a message with `system` role is added to the chat history
     */
    promptPrefix: true,
    // Model parameters
    /** @endpoints openAI, custom, azureOpenAI, google, anthropic, assistants, azureAssistants, bedrock */
    model: true,
    /** @endpoints openAI, custom, azureOpenAI, google, anthropic, bedrock */
    temperature: true,
    /** @endpoints openAI, custom, azureOpenAI */
    presence_penalty: true,
    /** @endpoints openAI, custom, azureOpenAI */
    frequency_penalty: true,
    /** @endpoints openAI, custom, azureOpenAI */
    stop: true,
    /** @endpoints openAI, custom, azureOpenAI */
    top_p: true,
    /** @endpoints openAI, custom, azureOpenAI */
    max_tokens: true,
    /** @endpoints openAI, custom, azureOpenAI */
    reasoning_effort: true,
    /** @endpoints openAI, custom, azureOpenAI */
    reasoning_summary: true,
    /** @endpoints openAI, custom, azureOpenAI */
    verbosity: true,
    /** @endpoints openAI, custom, azureOpenAI */
    useResponsesApi: true,
    /** @endpoints openAI, anthropic, google */
    web_search: true,
    /** @endpoints openAI, custom, azureOpenAI */
    disableStreaming: true,
    /** @endpoints google, anthropic, bedrock */
    topP: true,
    /** @endpoints google, anthropic */
    topK: true,
    /** @endpoints google, anthropic */
    maxOutputTokens: true,
    /** @endpoints anthropic */
    promptCache: true,
    thinking: true,
    thinkingBudget: true,
    /** @endpoints bedrock */
    region: true,
    /** @endpoints bedrock */
    maxTokens: true,
    /** @endpoints agents */
    agent_id: true,
    /** @endpoints assistants, azureAssistants */
    assistant_id: true,
    /** @endpoints assistants, azureAssistants */
    append_current_datetime: true,
    /**
     * @endpoints assistants, azureAssistants
     *
     * Overrides existing assistant instructions, only used for the current run:
     * https://platform.openai.com/docs/api-reference/runs/createRun#runs-createrun-instructions
     * */
    instructions: true,
    /** @endpoints openAI, google, anthropic */
    fileTokenLimit: true,
  })
  .merge(
    z.object({
      /** @endpoints openAI, custom, azureOpenAI, google, anthropic, assistants, azureAssistants, bedrock, agents */
      endpoint: extendedModelEndpointSchema.nullable(),
    }),
  );

export type TPreset = z.infer<typeof tPresetSchema>;

export type TSetOption = (
  param: number | string,
) => (newValue: number | string | boolean | string[] | Partial<TPreset>) => void;

export type TConversation = z.infer<typeof tConversationSchema> & {
  presetOverride?: Partial<TPreset>;
  disableParams?: boolean;
};

export const tSharedLinkSchema = z.object({
  conversationId: z.string(),
  shareId: z.string(),
  messages: z.array(z.string()),
  isPublic: z.boolean(),
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

export const googleBaseSchema = tConversationSchema.pick({
  model: true,
  modelLabel: true,
  promptPrefix: true,
  examples: true,
  temperature: true,
  maxOutputTokens: true,
  artifacts: true,
  topP: true,
  topK: true,
  thinking: true,
  thinkingBudget: true,
  web_search: true,
  fileTokenLimit: true,
  iconURL: true,
  greeting: true,
  spec: true,
  maxContextTokens: true,
});

export const googleSchema = googleBaseSchema
  .transform((obj: Partial<TConversation>) => removeNullishValues(obj, true))
  .catch(() => ({}));

/**
   * TODO: Map the following fields:
  - presence_penalty -> presencePenalty
  - frequency_penalty -> frequencyPenalty
  - stop -> stopSequences
   */
export const googleGenConfigSchema = z
  .object({
    maxOutputTokens: coerceNumber.optional(),
    temperature: coerceNumber.optional(),
    topP: coerceNumber.optional(),
    topK: coerceNumber.optional(),
    presencePenalty: coerceNumber.optional(),
    frequencyPenalty: coerceNumber.optional(),
    stopSequences: z.array(z.string()).optional(),
    thinkingConfig: z
      .object({
        includeThoughts: z.boolean().optional(),
        thinkingBudget: coerceNumber.optional(),
      })
      .optional(),
    web_search: z.boolean().optional(),
  })
  .strip()
  .optional();

export function removeNullishValues<T extends Record<string, unknown>>(
  obj: T,
  removeEmptyStrings?: boolean,
): Partial<T> {
  const newObj: Partial<T> = { ...obj };

  (Object.keys(newObj) as Array<keyof T>).forEach((key) => {
    const value = newObj[key];
    if (value === undefined || value === null) {
      delete newObj[key];
    }
    if (removeEmptyStrings && typeof value === 'string' && value === '') {
      delete newObj[key];
    }
  });

  return newObj;
}

const assistantBaseSchema = tConversationSchema.pick({
  model: true,
  assistant_id: true,
  instructions: true,
  artifacts: true,
  promptPrefix: true,
  iconURL: true,
  greeting: true,
  spec: true,
  append_current_datetime: true,
});

export const assistantSchema = assistantBaseSchema
  .transform((obj) => ({
    ...obj,
    model: obj.model ?? openAISettings.model.default,
    assistant_id: obj.assistant_id ?? undefined,
    instructions: obj.instructions ?? undefined,
    promptPrefix: obj.promptPrefix ?? null,
    iconURL: obj.iconURL ?? undefined,
    greeting: obj.greeting ?? undefined,
    spec: obj.spec ?? undefined,
    append_current_datetime: obj.append_current_datetime ?? false,
  }))
  .catch(() => ({
    model: openAISettings.model.default,
    assistant_id: undefined,
    instructions: undefined,
    promptPrefix: null,
    iconURL: undefined,
    greeting: undefined,
    spec: undefined,
    append_current_datetime: false,
  }));

const compactAssistantBaseSchema = tConversationSchema.pick({
  model: true,
  assistant_id: true,
  instructions: true,
  promptPrefix: true,
  artifacts: true,
  iconURL: true,
  greeting: true,
  spec: true,
});

export const compactAssistantSchema = compactAssistantBaseSchema
  .transform((obj) => removeNullishValues(obj))
  .catch(() => ({}));

export const agentsBaseSchema = tConversationSchema.pick({
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
});

export const agentsSchema = agentsBaseSchema
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

export const openAIBaseSchema = tConversationSchema.pick({
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
  reasoning_effort: true,
  reasoning_summary: true,
  verbosity: true,
  useResponsesApi: true,
  web_search: true,
  disableStreaming: true,
  fileTokenLimit: true,
});

export const openAISchema = openAIBaseSchema
  .transform((obj: Partial<TConversation>) => removeNullishValues(obj, true))
  .catch(() => ({}));

export const compactGoogleSchema = googleBaseSchema
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

    return removeNullishValues(newObj, true);
  })
  .catch(() => ({}));

export const anthropicBaseSchema = tConversationSchema.pick({
  model: true,
  modelLabel: true,
  promptPrefix: true,
  temperature: true,
  maxOutputTokens: true,
  topP: true,
  topK: true,
  resendFiles: true,
  promptCache: true,
  thinking: true,
  thinkingBudget: true,
  artifacts: true,
  iconURL: true,
  greeting: true,
  spec: true,
  maxContextTokens: true,
  web_search: true,
  fileTokenLimit: true,
  stop: true,
  stream: true,
});

export const anthropicSchema = anthropicBaseSchema
  .transform((obj) => removeNullishValues(obj))
  .catch(() => ({}));

export const tBannerSchema = z.object({
  bannerId: z.string(),
  message: z.string(),
  displayFrom: z.string(),
  displayTo: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isPublic: z.boolean(),
  persistable: z.boolean().default(false),
});
export type TBanner = z.infer<typeof tBannerSchema>;

export const compactAgentsBaseSchema = tConversationSchema.pick({
  spec: true,
  // model: true,
  iconURL: true,
  greeting: true,
  agent_id: true,
  instructions: true,
  additional_instructions: true,
});

export const compactAgentsSchema = compactAgentsBaseSchema
  .transform((obj) => removeNullishValues(obj))
  .catch(() => ({}));
