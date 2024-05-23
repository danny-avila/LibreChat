import { TFile, TMessage } from 'librechat-data-provider';

const even =
  'w-full border-b border-black/10 dark:border-gray-800/50 text-gray-800 bg-white dark:text-gray-200 group dark:bg-gray-800 hover:bg-gray-200/25 hover:text-gray-700  dark:hover:bg-gray-800 dark:hover:text-gray-200';
const odd =
  'w-full border-b border-black/10 bg-gray-50 dark:border-gray-800/50 text-gray-800 dark:text-gray-200 group bg-gray-200 dark:bg-gray-700 hover:bg-gray-200/40 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200';

export default function buildTree({
  messages,
  fileMap,
  groupAll = false,
}: {
  messages: TMessage[] | null;
  fileMap?: Record<string, TFile>;
  groupAll?: boolean;
}) {
  if (messages === null) {
    return null;
  }

  const messageMap: Record<string, TMessage & { children: TMessage[] }> = {};
  const rootMessages: TMessage[] = [];

  if (groupAll) {
    return messages.map((m, idx) => ({ ...m, bg: idx % 2 === 0 ? even : odd }));
  }
  if (!groupAll) {
    // Traverse the messages array and store each element in messageMap.
    messages.forEach((message) => {
      messageMap[message.messageId] = { ...message, children: [] };

      if (message.files && fileMap) {
        messageMap[message.messageId].files = message.files.map(
          (file) => fileMap[file.file_id ?? ''] ?? file,
        );
      }

      const parentMessage = messageMap[message.parentMessageId ?? ''];
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
