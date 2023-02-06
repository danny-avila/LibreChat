const mongoose = require('mongoose');
const { Message } = require('./Message');

const convoSchema = mongoose.Schema({
  conversationId: {
    type: String,
    unique: true,
    required: true
  },
  parentMessageId: {
    type: String,
    required: true
  },
  messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  created: {
    type: Date,
    default: Date.now
  }
});

const Conversation =
  mongoose.models.Conversation || mongoose.model('Conversation', convoSchema);

module.exports = {
  saveConversation: async ({ conversationId, parentMessageId }) => {
    const messages = await Message.find({ conversationId });

    await Conversation.findOneAndUpdate(
      { conversationId },
      { $set: { parentMessageId, messages } },
      { new: true, upsert: true }
    ).exec();
  }
};
