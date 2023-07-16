const even =
  'w-full border-b border-black/10 dark:border-gray-900/50 text-gray-800 bg-white dark:text-gray-100 group dark:bg-gray-800 hover:bg-gray-100/25 hover:text-gray-700  dark:hover:bg-gray-900 dark:hover:text-gray-200';
const odd =
  'w-full border-b border-black/10 bg-gray-50 dark:border-gray-900/50 text-gray-800 dark:text-gray-100 group bg-gray-100 dark:bg-gray-1000 hover:bg-gray-100/40 hover:text-gray-700 dark:hover:bg-[#3b3d49] dark:hover:text-gray-200';

export default function buildTree(messages, groupAll = false) {
  if (messages === null) {
    return null;
  }

  let messageMap = {};
  let rootMessages = [];

  if (groupAll) {
    return messages.map((m, idx) => ({ ...m, bg: idx % 2 === 0 ? even : odd }));
  }
  if (!groupAll) {
    // Traverse the messages array and store each element in messageMap.
    messages.forEach((message) => {
      messageMap[message.messageId] = { ...message, children: [] };

      const parentMessage = messageMap[message.parentMessageId];
      if (parentMessage) {
        parentMessage.children.push(messageMap[message.messageId]);
      } else {
        rootMessages.push(messageMap[message.messageId]);
      }
    });

    return rootMessages;
  }

  // // Group all messages into one tree
  // let parentId = null;
  // messages.forEach((message, i) => {
  //   messageMap[message.messageId] = { ...message, bg: i % 2 === 0 ? even : odd, children: [] };
  //   const currentMessage = messageMap[message.messageId];
  //   const parentMessage = messageMap[parentId];
  //   if (parentMessage) parentMessage.children.push(currentMessage);
  //   else rootMessages.push(currentMessage);
  //   parentId = message.messageId;
  // });

  // return rootMessages;

  // Group all messages by conversation, doesn't look great
  // Traverse the messages array and store each element in messageMap.
  // rootMessages = {};
  // let parents = 0;
  // messages.forEach(message => {
  //   if (message.conversationId in messageMap) {
  //     messageMap[message.conversationId].children.push(message);
  //   } else {
  //     messageMap[message.conversationId] = { ...message, bg: parents % 2 === 0 ? even : odd, children: [] };
  //     rootMessages.push(messageMap[message.conversationId]);
  //     parents++;
  //   }
  // });

  // // return Object.values(rootMessages);
  // return rootMessages;
}
