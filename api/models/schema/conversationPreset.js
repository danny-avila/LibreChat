module.exports = {
  // endpoint: [azureOpenAI, openAI, bingAI, chatGPTBrowser]
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
  jailbreakConversationId: {
    type: String,
    default: null
  },
  conversationSignature: {
    type: String,
    default: null
  },
  context: {
    type: String,
    default: null
  },
  systemMessage: {
    type: String,
    default: null
  },
  clientId: {
    type: String,
    default: null
  },
  invocationId: {
    type: Number,
    default: 1
  },
  toneStyle: {
    type: String,
    default: null
  }
};
