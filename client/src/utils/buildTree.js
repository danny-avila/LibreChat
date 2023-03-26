export default function buildTree(messages) {
  if (messages === null) return null;

  let messageMap = {};
  let rootMessages = [];

  // Traverse the messages array and store each element in messageMap.
  messages.forEach((message) => {
    messageMap[message.messageId] = { ...message, children: [] };

    const parentMessage = messageMap[message.parentMessageId];
    if (parentMessage)
      parentMessage.children.push(messageMap[message.messageId]);
    else rootMessages.push(messageMap[message.messageId]);
  });

  return rootMessages;
}
