const mongoose = require('mongoose');
const mongoMeili = require('../plugins/mongoMeili');
const messageSchema = mongoose.Schema(
  {
    messageId: {
      type: String,
      unique: true,
      required: true,
      index: true,
      meiliIndex: true
    },
    conversationId: {
      type: String,
      required: true,
      meiliIndex: true
    },
    model: {
      type: String
    },
    conversationSignature: {
      type: String
      // required: true
    },
    clientId: {
      type: String
    },
    invocationId: {
      type: String
    },
    parentMessageId: {
      type: String
      // required: true
    },
    tokenCount: {
      type: Number
    },
    refinedTokenCount: {
      type: Number
    },
    sender: {
      type: String,
      required: true,
      meiliIndex: true
    },
    text: {
      type: String,
      required: true,
      meiliIndex: true
    },
    refinedMessageText: {
      type: String
    },
    isCreatedByUser: {
      type: Boolean,
      required: true,
      default: false
    },
    unfinished: {
      type: Boolean,
      default: false
    },
    cancelled: {
      type: Boolean,
      default: false
    },
    error: {
      type: Boolean,
      default: false
    },
    _meiliIndex: {
      type: Boolean,
      required: false,
      select: false,
      default: false
    },
    plugin: {
      latest: {
        type: String,
        required: false
      },
      inputs: {
        type: [mongoose.Schema.Types.Mixed],
        required: false
      },
      outputs: {
        type: String,
        required: false
      }
    }
  },
  { timestamps: true }
);

if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
  messageSchema.plugin(mongoMeili, {
    host: process.env.MEILI_HOST,
    apiKey: process.env.MEILI_MASTER_KEY,
    indexName: 'messages',
    primaryKey: 'messageId'
  });
}

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

module.exports = Message;
