const conversationPreset = {
  // endpoint: [azureOpenAI, openAI, bingAI, claude, chatGPTBrowser]
  endpoint: {
    type: String,
    default: null,
    required: true
  },
  // for azureOpenAI, openAI, chatGPTBrowser only
  model: {
    type: String,
    default: null,
    required: false
  },
  // for azureOpenAI, openAI only
  chatGptLabel: {
    type: String,
    default: null,
    required: false
  },
  // for google only
  modelLabel: {
    type: String,
    default: null,
    required: false
  },
  promptPrefix: {
    type: String,
    default: null,
    required: false
  },
  temperature: {
    type: Number,
    default: 1,
    required: false
  },
  top_p: {
    type: Number,
    default: 1,
    required: false
  },
  // for google only
  topP: {
    type: Number,
    default: 0.95,
    required: false
  },
  topK: {
    type: Number,
    default: 40,
    required: false
  },
  maxOutputTokens: {
    type: Number,
    default: 1024,
    required: false
  },
  presence_penalty: {
    type: Number,
    default: 0,
    required: false
  },
  frequency_penalty: {
    type: Number,
    default: 0,
    required: false
  },
  // for bingai only
  jailbreak: {
    type: Boolean,
    default: false
  },
  context: {
    type: String,
    default: null
  },
  systemMessage: {
    type: String,
    default: null
  },
  toneStyle: {
    type: String,
    default: null
  }
};

const agentOptions = {
  model: {
    type: String,
    default: null,
    required: false
  },
  // for azureOpenAI, openAI only
  chatGptLabel: {
    type: String,
    default: null,
    required: false
  },
  // for google only
  modelLabel: {
    type: String,
    default: null,
    required: false
  },
  promptPrefix: {
    type: String,
    default: null,
    required: false
  },
  temperature: {
    type: Number,
    default: 1,
    required: false
  },
  top_p: {
    type: Number,
    default: 1,
    required: false
  },
  // for google only
  topP: {
    type: Number,
    default: 0.95,
    required: false
  },
  topK: {
    type: Number,
    default: 40,
    required: false
  },
  maxOutputTokens: {
    type: Number,
    default: 1024,
    required: false
  },
  presence_penalty: {
    type: Number,
    default: 0,
    required: false
  },
  frequency_penalty: {
    type: Number,
    default: 0,
    required: false
  },
  context: {
    type: String,
    default: null
  },
  systemMessage: {
    type: String,
    default: null
  }
};
  
module.exports = {
  conversationPreset,
  agentOptions
};