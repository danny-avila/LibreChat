const { saveMessage, saveConvo } = require('../../models');

const saveMessageToDatabase = async (message, user = null) => {
  saveMessage(message)

  // Update the conversation with the new message
  await saveConvo(user, { conversationId: message.conversationId, });
};

module.exports = saveMessageToDatabase;