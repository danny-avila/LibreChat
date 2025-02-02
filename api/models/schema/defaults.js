const conversationPreset = {
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
};

const agentOptions = {
  model: {
    type: String,
    required: false,
  },
  // for azureOpenAI, openAI only
  chatGptLabel: {
    type: String,
    required: false,
  },
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
  presence_penalty: {
    type: Number,
    required: false,
  },
  frequency_penalty: {
    type: Number,
    required: false,
  },
  /** omni models only */
  reasoning_effort: {
    type: String,
  },
};

module.exports = {
  conversationPreset,
  agentOptions,
};
