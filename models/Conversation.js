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
  title: {
    type: String,
    default: 'New conversation',
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
  saveConversation: async ({ conversationId, parentMessageId, title }) => {
    const messages = await Message.find({ conversationId });
    const update = { parentMessageId, messages };
    if (title) {
      update.title = title;
    }

    await Conversation.findOneAndUpdate(
      { conversationId },
      { $set: update },
      { new: true, upsert: true }
    ).exec();
  }
};
