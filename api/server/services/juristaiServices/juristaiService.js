// api/server/services/juristaiService.js
const { saveUserMessage, initThread } = require('../services/Threads');
const { v4: uuidv4 } = require('uuid');

exports.addMessageToThread = async ({ thread_id, message, user_id }) => {
  const messageId = uuidv4();
  let newThreadId = thread_id;

  if (!thread_id) {
    const result = await initThread({ user_id, initialMessage: message });
    newThreadId = result.thread_id;
  }

  await saveUserMessage({
    thread_id: newThreadId,
    message,
    user_id,
    message_id: messageId,
  });

  return { thread_id: newThreadId, message_id: messageId };
};
