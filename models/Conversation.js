const mongoose = require('mongoose');
const { getMessages, deleteMessages } = require('./Message');

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
  saveConvo: async ({ conversationId, parentMessageId, title }) => {
    try {
      const messages = await getMessages({ conversationId });
      const update = { parentMessageId, messages };
      if (title) {
        update.title = title;
      }

      return await Conversation.findOneAndUpdate(
        { conversationId },
        { $set: update },
        { new: true, upsert: true }
      ).exec();
    } catch (error) {
      console.log(error);
      return { message: 'Error saving conversation' };
    }
  },
  getConvos: async () => await Conversation.find({}).exec(),
  deleteConvos: async (filter) => {

    let deleteCount = await Conversation.deleteMany(filter).exec();
    deleteCount.messages = await deleteMessages(filter);
    return deleteCount;
  }
};
