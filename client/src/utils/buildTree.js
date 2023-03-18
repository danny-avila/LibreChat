export default function buildTree(messages, groupAll = false) {
  let messageMap = {};
  let rootMessages = [];

  if (!groupAll) {
    // Traverse the messages array and store each element in messageMap.
    messages.forEach((message) => {
      messageMap[message.messageId] = { ...message, children: [] };

      const parentMessage = messageMap[message.parentMessageId];
      if (parentMessage) parentMessage.children.push(messageMap[message.messageId]);
      else rootMessages.push(messageMap[message.messageId]);
    });

    return rootMessages;
  }

  // Group all messages into one tree
  let parentId = messages[0].messageId;
  messages.forEach((message, i) => {
    if (i === 0) {
      messageMap[parentId] = { ...message, children: [] };
      return;
    }
    messageMap[parentId].children.push({ ...message, children: [] });
  });

  return [messageMap[parentId]];
}
