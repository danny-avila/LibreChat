import type { TFile } from './types/files';
import type { TMessage } from './types';
import { Constants } from './config';

export type ParentMessage = TMessage & { children: TMessage[]; depth: number };

function isRootParent(parentId: string | null | undefined): boolean {
  return parentId == null || parentId === '' || parentId === Constants.NO_PARENT;
}

function applyFileMap(message: TMessage, fileMap?: Record<string, TFile>): TMessage {
  if (!message.files || !fileMap) {
    return message;
  }
  return {
    ...message,
    files: message.files.map((file) => fileMap[file.file_id ?? ''] ?? file),
  };
}

/**
 * Re-attaches orphan assistant roots under a lone user root — a pattern left
 * by long-running job steps that persisted the assistant before the user bubble.
 */
function healOrphanAssistantRoots(rootMessages: ParentMessage[]): ParentMessage[] {
  const userRoots = rootMessages.filter((message) => message.isCreatedByUser);
  const orphanAssistants = rootMessages.filter(
    (message) => !message.isCreatedByUser && isRootParent(message.parentMessageId),
  );

  if (userRoots.length !== 1 || orphanAssistants.length === 0) {
    return rootMessages;
  }

  const [userRoot] = userRoots;
  const remainingRoots = rootMessages.filter(
    (message) => message !== userRoot && !orphanAssistants.includes(message),
  );

  for (let index = 0; index < orphanAssistants.length; index++) {
    const assistant = orphanAssistants[index];
    assistant.parentMessageId = userRoot.messageId;
    assistant.depth = userRoot.depth + 1;
    assistant.siblingIndex = index;
    userRoot.children.push(assistant);
  }

  return [userRoot, ...remainingRoots];
}

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

  for (const message of messages) {
    if (!message) {
      continue;
    }

    messageMap[message.messageId] = {
      ...applyFileMap(message, fileMap),
      children: [],
      depth: 0,
      siblingIndex: 0,
    };
  }

  for (const message of messages) {
    if (!message) {
      continue;
    }

    const node = messageMap[message.messageId];
    const parentId = message.parentMessageId ?? '';

    if (!isRootParent(parentId) && messageMap[parentId]) {
      const parentMessage = messageMap[parentId];
      childrenCount[parentId] = (childrenCount[parentId] ?? 0) + 1;
      node.siblingIndex = childrenCount[parentId] - 1;
      node.depth = parentMessage.depth + 1;
      parentMessage.children.push(node);
      continue;
    }

    rootMessages.push(node);
  }

  return healOrphanAssistantRoots(rootMessages);
}
