import { Constants } from 'librechat-data-provider';

/** The minimum a converted message must expose for the parent graph to be
 * repaired. Both the ChatGPT and Claude converters produce richer messages;
 * the guarantees below depend on nothing else. */
export interface TreeNode {
  messageId: string;
  parentMessageId: string;
  createdAt: Date;
}

export function indexById<T extends TreeNode>(messages: T[]): Map<string, T> {
  const byId = new Map<string, T>();
  for (const message of messages) {
    byId.set(message.messageId, message);
  }
  return byId;
}

/**
 * Breaks any cycle in the parent graph by rooting the message that closes the
 * loop. Real exports occasionally reference an ancestor as its own descendant;
 * `buildTree` requires an acyclic graph so this must run before rendering.
 */
export function breakCycles<T extends TreeNode>(messages: T[], byId: Map<string, T>): void {
  for (const message of messages) {
    const seen = new Set<string>([message.messageId]);
    let current = message.parentMessageId;
    while (current !== Constants.NO_PARENT) {
      const parent = byId.get(current);
      if (!parent) {
        break;
      }
      if (seen.has(current)) {
        message.parentMessageId = Constants.NO_PARENT;
        break;
      }
      seen.add(current);
      current = parent.parentMessageId;
    }
  }
}

/**
 * Nudges a child's timestamp past its parent's when the export's creation
 * times are out of order, via a single BFS from the roots so every parent is
 * visited before its children.
 */
export function enforceOrdering<T extends TreeNode>(messages: T[], byId: Map<string, T>): void {
  const children = new Map<string, T[]>();
  for (const message of messages) {
    const siblings = children.get(message.parentMessageId);
    if (siblings) {
      siblings.push(message);
      continue;
    }
    children.set(message.parentMessageId, [message]);
  }

  const queue = [...(children.get(Constants.NO_PARENT) ?? [])];
  while (queue.length > 0) {
    const node = queue.shift() as T;
    const parent = byId.get(node.parentMessageId);
    if (parent && node.createdAt.getTime() <= parent.createdAt.getTime()) {
      node.createdAt = new Date(parent.createdAt.getTime() + 1);
    }
    const kids = children.get(node.messageId);
    if (kids) {
      queue.push(...kids);
    }
  }
}

/**
 * Makes a converted message list safe for `buildTree`: acyclic, and with every
 * child timestamped after its parent. Both import formats need identical
 * guarantees, so both call this rather than reimplementing them.
 */
export function orderTree<T extends TreeNode>(messages: T[]): void {
  const byId = indexById(messages);
  breakCycles(messages, byId);
  enforceOrdering(messages, byId);
}
