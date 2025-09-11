import { Schema } from 'mongoose';

// @ts-ignore
export const conversationPreset = {
  // endpoint: [azureOpenAI, openAI, anthropic, chatGPTBrowser]
  endpoint: {
    type: String,
    default: null,
    required: true,
  },
  endpointType: {
    type: String,
  },
  // for azureOpenAI, openAI, chatGPTBrowser only
  model: {
    type: String,
    required: false,
  },
  // for bedrock only
  region: {
    type: String,
    required: false,
  },
  // for azureOpenAI, openAI only
  chatGptLabel: {
    type: String,
    required: false,
  },
  // for google only
  examples: { type: [{ type: Schema.Types.Mixed }], default: undefined },
  modelLabel: {
    type: String,
    required: false,
  },
  promptPrefix: {
    type: String,
    required: false,
  },
  temperature: {
    type: Number,
    required: false,
  },
  top_p: {
    type: Number,
    required: false,
  },
  // for google only
  topP: {
    type: Number,
    required: false,
  },
  topK: {
    type: Number,
    required: false,
  },
  maxOutputTokens: {
    type: Number,
    required: false,
  },
  maxTokens: {
    type: Number,
    required: false,
  },
  presence_penalty: {
    type: Number,
    required: false,
  },
  frequency_penalty: {
    type: Number,
    required: false,
  },
  file_ids: { type: [{ type: String }], default: undefined },
  // deprecated
  resendImages: {
    type: Boolean,
  },
  /* Anthropic only */
  promptCache: {
    type: Boolean,
  },
  thinking: {
    type: Boolean,
  },
  thinkingBudget: {
    type: Number,
  },
  system: {
    type: String,
  },
  // files
  resendFiles: {
    type: Boolean,
  },
  imageDetail: {
    type: String,
  },
  /* agents */
  agent_id: {
    type: String,
  },
  /* assistants */
  assistant_id: {
    type: String,
  },
  instructions: {
    type: String,
  },
  stop: { type: [{ type: String }], default: undefined },
  isArchived: {
    type: Boolean,
    default: false,
  },
  /* UI Components */
  iconURL: {
    type: String,
  },
  greeting: {
    type: String,
  },
  spec: {
    type: String,
  },
  tags: {
    type: [String],
    default: [],
  },
  tools: { type: [{ type: String }], default: undefined },
  maxContextTokens: {
    type: Number,
  },
  max_tokens: {
    type: Number,
  },
  useResponsesApi: {
    type: Boolean,
  },
  /** OpenAI Responses API / Anthropic API / Google API */
  web_search: {
    type: Boolean,
  },
  disableStreaming: {
    type: Boolean,
  },
  fileTokenLimit: {
    type: Number,
  },
  /** Reasoning models only */
  reasoning_effort: {
    type: String,
  },
  reasoning_summary: {
    type: String,
  },
  /** Verbosity control */
  verbosity: {
    type: String,
  },
};
