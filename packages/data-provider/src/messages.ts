import type { TFile } from './types/files';
import type { TMessage } from './types';

export type ParentMessage = TMessage & { children: TMessage[]; depth: number };
export function buildTree({
  messages,
  fileMap,
}: {
  messages: (TMessage | undefined)[] | null;
  fileMap?: Record<string, TFile>;
}) {
  if (messages === null) {
    return null;
  }

  const messageMap: Record<string, ParentMessage> = {};
  const rootMessages: ParentMessage[] = [];
  const childrenCount: Record<string, number> = {};

  // First pass: Build complete messageMap with all messages
  messages.forEach((message) => {
    if (!message) {
      return;
    }
    const parentId = message.parentMessageId ?? '';
    childrenCount[parentId] = (childrenCount[parentId] || 0) + 1;

    const extendedMessage: ParentMessage = {
      ...message,
      children: [],
      depth: 0,
      siblingIndex: childrenCount[parentId] - 1,
    };

    if (message.files && fileMap) {
      extendedMessage.files = message.files.map((file) => fileMap[file.file_id ?? ''] ?? file);
    }

    messageMap[message.messageId] = extendedMessage;
  });

  // Second pass: Link children to parents (now all parents exist in messageMap)
  Object.values(messageMap).forEach((message) => {
    const parentId = message.parentMessageId ?? '';
    const parentMessage = messageMap[parentId];
    if (parentMessage) {
      parentMessage.children.push(message);
    } else {
      rootMessages.push(message);
    }
  });

  // Third pass: Compute depths via BFS
  const queue: ParentMessage[] = [...rootMessages];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of current.children) {
      (child as ParentMessage).depth = current.depth + 1;
      queue.push(child as ParentMessage);
    }
  }

  return rootMessages;
}
