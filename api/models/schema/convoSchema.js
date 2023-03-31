const mongoose = require('mongoose');
const mongoMeili = require('../plugins/mongoMeili');
const convoSchema = mongoose.Schema(
  {
    conversationId: {
      type: String,
      unique: true,
      required: true,
      index: true,
      meiliIndex: true
    },
    title: {
      type: String,
      default: 'New Chat',
      meiliIndex: true
    },
    user: {
      type: String,
      default: null
    },
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
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
      default: 0.8,
      required: false
    },
    top_p: {
      type: Number,
      default: 1,
      required: false
    },
    presence_penalty: {
      type: Number,
      default: 1,
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
    },
    suggestions: [{ type: String }]
  },
  { timestamps: true }
);

if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
  convoSchema.plugin(mongoMeili, {
    host: process.env.MEILI_HOST,
    apiKey: process.env.MEILI_MASTER_KEY,
    indexName: 'convos', // Will get created automatically if it doesn't exist already
    primaryKey: 'conversationId'
  });
}

const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', convoSchema);

module.exports = Conversation;
