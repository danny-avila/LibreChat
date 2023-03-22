const mongoose = require('mongoose');
const mongoMeili = require('../plugins/mongoMeili');
const messageSchema = mongoose.Schema({
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
  conversationSignature: {
    type: String,
    // required: true
  },
  clientId: {
    type: String,
  },
  invocationId: {
    type: String,
  },
  parentMessageId: {
    type: String,
    // required: true
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
  isCreatedByUser: {
    type: Boolean,
    required: true,
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
  }
}, { timestamps: true });

messageSchema.plugin(mongoMeili, {
  host: process.env.MEILI_HOST,
  apiKey: process.env.MEILI_KEY,
  indexName: 'messages',
  primaryKey: 'messageId'
});

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

module.exports = Message;