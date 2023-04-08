const saveMessageToDatabase = async (conversationId, message, isCreatedByUser) => {
  // Create a new Message document
  const newMessage = new Message({
    content: message,
    isCreatedByUser: isCreatedByUser,
  });

  // Save the message to the database
  await newMessage.save();

  // Update the conversation with the new message
  await Conversation.updateOne(
    { _id: conversationId },
    { $push: { messages: newMessage._id } }
  );
};
