import { logger } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';

/** The identity, parent link and timestamp of a message whose lineage is being ordered. */
export interface LineageMessage {
  messageId: string;
  parentMessageId?: string | null;
  createdAt: Date;
}

function indexById<T extends LineageMessage>(messages: readonly T[]): Map<string, T> {
  const byId = new Map<string, T>();
  for (const message of messages) {
    byId.set(message.messageId, message);
  }
  return byId;
}

function parentOf<T extends LineageMessage>(message: T, byId: Map<string, T>): T | undefined {
  const { parentMessageId } = message;
  if (!parentMessageId || parentMessageId === Constants.NO_PARENT) {
    return undefined;
  }
  return byId.get(parentMessageId);
}

/**
 * Severs the parent link that closes each cycle so the messages form a forest.
 * Every message joins at most one walk, so the pass is linear in the message count.
 * @returns Whether any cycle was found.
 */
export function breakParentCycles<T extends LineageMessage>(messages: readonly T[]): boolean {
  const byId = indexById(messages);
  const settled = new Set<T>();
  let cycleFound = false;

  for (const message of messages) {
    const chain = new Set<T>();
    let current: T | undefined = message;
    while (current != null && !settled.has(current)) {
      if (chain.has(current)) {
        current.parentMessageId = Constants.NO_PARENT;
        cycleFound = true;
        break;
      }
      chain.add(current);
      current = parentOf(current, byId);
    }
    for (const member of chain) {
      settled.add(member);
    }
  }

  return cycleFound;
}

/**
 * Moves each child's `createdAt` to one millisecond after its parent's whenever the child
 * would otherwise sort at or before it. Each chain is resolved once, downward from its
 * nearest settled ancestor, so the pass is linear in the message count. A cycle that
 * remains is treated as rooted where the walk re-entered it.
 */
export function orderParentTimestamps<T extends LineageMessage>(messages: readonly T[]): void {
  const byId = indexById(messages);
  const settled = new Set<T>();

  for (const message of messages) {
    const chain: T[] = [];
    const pending = new Set<T>();
    let current: T | undefined = message;
    while (current != null && !settled.has(current) && !pending.has(current)) {
      chain.push(current);
      pending.add(current);
      current = parentOf(current, byId);
    }

    let parentCreatedAt = current != null && settled.has(current) ? current.createdAt : undefined;
    for (let i = chain.length - 1; i >= 0; i--) {
      const member = chain[i];
      if (parentCreatedAt != null && member.createdAt <= parentCreatedAt) {
        member.createdAt = new Date(parentCreatedAt.getTime() + 1);
      }
      parentCreatedAt = member.createdAt;
      settled.add(member);
    }
  }
}

/**
 * Makes imported messages a forest whose children sort after their parents:
 * cyclic parent links are severed first, then timestamps are ordered in one pass.
 */
export function orderMessageLineage<T extends LineageMessage>(messages: readonly T[]): void {
  if (breakParentCycles(messages)) {
    logger.warn(
      '[importers] Detected cyclic parent relationships while adjusting import timestamps',
    );
  }
  orderParentTimestamps(messages);
}
