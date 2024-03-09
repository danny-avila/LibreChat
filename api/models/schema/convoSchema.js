const mongoose = require('mongoose');
const mongoMeili = require('../plugins/mongoMeili');
const { conversationPreset } = require('./defaults');
const convoSchema = mongoose.Schema(
  {
    conversationId: {
      type: String,
      unique: true,
      required: true,
      index: true,
      meiliIndex: true,
    },
    title: {
      type: String,
      default: 'New Chat',
      meiliIndex: true,
    },
    user: {
      type: String,
      index: true,
    },
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
    // google only
    examples: { type: [{ type: mongoose.Schema.Types.Mixed }], default: undefined },
    agentOptions: {
      type: mongoose.Schema.Types.Mixed,
    },
    ...conversationPreset,
    // for bingAI only
    bingConversationId: {
      type: String,
    },
    jailbreakConversationId: {
      type: String,
    },
    conversationSignature: {
      type: String,
    },
    clientId: {
      type: String,
    },
    invocationId: {
      type: Number,
    },
  },
  { timestamps: true },
);

if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
  convoSchema.plugin(mongoMeili, {
    host: process.env.MEILI_HOST,
    apiKey: process.env.MEILI_MASTER_KEY,
    indexName: 'convos', // Will get created automatically if it doesn't exist already
    primaryKey: 'conversationId',
  });
}

convoSchema.index({ createdAt: 1, updatedAt: 1 });

const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', convoSchema);

module.exports = Conversation;
