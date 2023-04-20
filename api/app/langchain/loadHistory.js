const { HumanChatMessage, AIChatMessage } = require('langchain/schema');
const { getConvo } = require('../../models');

const loadHistory = async (conversationId, user = null) => {
  // const conversation = await Conversation.findOne({ _id: conversationId }).populate('messages');
  const conversation = (await getConvo(user, conversationId)).populate('messages');
  const messages = conversation?.messages || [];

  // Convert Message documents into appropriate ChatMessage instances
  const chatMessages = messages.map((msg) =>
    msg.isCreatedByUser
      ? new HumanChatMessage(msg.text)
      : new AIChatMessage(msg.text)
  );

  return chatMessages;
};

module.exports = loadHistory;
