const loadHistory = async (conversationId) => {
  const conversation = await Conversation.findOne({ _id: conversationId }).populate('messages');
  const messages = conversation?.messages || [];

  // Convert Message documents into appropriate ChatMessage instances
  const chatMessages = messages.map((msg) =>
    msg.isCreatedByUser
      ? new HumanChatMessage(msg.content)
      : new AIChatMessage(msg.content)
  );

  return chatMessages;
};
