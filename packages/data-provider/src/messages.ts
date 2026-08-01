import type { TFile } from './types/files';
import type { TMessage } from './types';

export type ParentMessage = TMessage & { children: TMessage[]; depth: number };
/**
 * Builds the render tree from the flat messages array. Order-robust: live
 * stream/steer/preempt cache writes can momentarily place a child before its
 * parent, and a single-pass link would hoist such rows into phantom root
 * branches — folding the visible thread to one dangling branch until a
 * refetch restores creation order. Linking happens only after every message
 * is indexed, so array order never changes the tree shape.
 */
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
  const orderedMessages: ParentMessage[] = [];
  const rootMessages: ParentMessage[] = [];
  const childrenCount: Record<string, number> = {};

  for (const message of messages) {
    if (!message) {
      continue;
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
    orderedMessages.push(extendedMessage);
  }

  for (const extendedMessage of orderedMessages) {
    const parentMessage = messageMap[extendedMessage.parentMessageId ?? ''];
    if (parentMessage && parentMessage !== extendedMessage) {
      parentMessage.children.push(extendedMessage);
    } else {
      rootMessages.push(extendedMessage);
    }
  }

  /** Depth comes from a roots-down walk (a child linked before its parent
   *  can't inherit depth at link time). The `visited` set doubles as the
   *  cycle guard: nodes on a corrupt parent cycle are unreachable from any
   *  root, so they resurface as roots instead of disappearing. */
  const visited = new Set<ParentMessage>();
  const assignDepths = (root: ParentMessage) => {
    visited.add(root);
    const stack: ParentMessage[] = [root];
    while (stack.length > 0) {
      const node = stack.pop() as ParentMessage;
      for (const child of node.children as ParentMessage[]) {
        if (visited.has(child)) {
          continue;
        }
        child.depth = node.depth + 1;
        visited.add(child);
        stack.push(child);
      }
    }
  };
  for (const root of rootMessages) {
    assignDepths(root);
  }
  for (const extendedMessage of orderedMessages) {
    if (!visited.has(extendedMessage)) {
      rootMessages.push(extendedMessage);
      assignDepths(extendedMessage);
    }
  }

  return rootMessages as TMessage[];
}
