export default function buildTree({ messages, fileMap, }) {
    if (messages === null) {
        return null;
    }
    const messageMap = {};
    const rootMessages = [];
    const childrenCount = {};
    messages.forEach((message) => {
        const parentId = message.parentMessageId ?? '';
        childrenCount[parentId] = (childrenCount[parentId] || 0) + 1;
        const extendedMessage = {
            ...message,
            children: [],
            depth: 0,
            siblingIndex: childrenCount[parentId] - 1,
        };
        if (message.files && fileMap) {
            extendedMessage.files = message.files.map((file) => fileMap[file.file_id ?? ''] ?? file);
        }
        messageMap[message.messageId] = extendedMessage;
        const parentMessage = messageMap[parentId];
        if (parentMessage) {
            parentMessage.children.push(extendedMessage);
            extendedMessage.depth = parentMessage.depth + 1;
        }
        else {
            rootMessages.push(extendedMessage);
        }
    });
    return rootMessages;
}
const even = 'w-full border-b border-black/10 dark:border-gray-800/50 text-gray-800 bg-white dark:text-gray-200 group dark:bg-gray-800 hover:bg-gray-200/25 hover:text-gray-700  dark:hover:bg-gray-800 dark:hover:text-gray-200';
const odd = 'w-full border-b border-black/10 bg-gray-50 dark:border-gray-800/50 text-gray-800 dark:text-gray-200 group bg-gray-200 dark:bg-gray-700 hover:bg-gray-200/40 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200';
export function groupIntoList({ messages, }) {
    if (messages === null) {
        return null;
    }
    return messages.map((m, idx) => ({ ...m, bg: idx % 2 === 0 ? even : odd }));
}
