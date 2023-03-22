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
    parentMessageId: {
      type: String,
      required: true
    },
    title: {
      type: String,
      default: 'New Chat',
      meiliIndex: true
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
      type: String
    },
    invocationId: {
      type: String
    },
    chatGptLabel: {
      type: String,
      default: null
    },
    promptPrefix: {
      type: String,
      default: null
    },
    model: {
      type: String,
      required: true
    },
    user: {
      type: String
    },
    suggestions: [{ type: String }],
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }]
  },
  { timestamps: true }
);

if (process.env.MEILI_HOST && process.env.MEILI_KEY) {
  convoSchema.plugin(mongoMeili, {
    host: process.env.MEILI_HOST,
    apiKey: process.env.MEILI_KEY,
    indexName: 'convos', // Will get created automatically if it doesn't exist already
    primaryKey: 'conversationId'
  });
}

const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', convoSchema);

module.exports = Conversation;
