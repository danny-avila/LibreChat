import type { QueuedMessage } from '~/store/families';

export const compareQueuedMessages = (a: QueuedMessage, b: QueuedMessage): number =>
  Number(b.priority ?? false) - Number(a.priority ?? false) || a.createdAt - b.createdAt;

/** Places one new message without disturbing the order the user chose for
 *  rows already in the queue. */
export function insertQueuedMessage(
  queue: readonly QueuedMessage[],
  item: QueuedMessage,
): QueuedMessage[] {
  const index = queue.findIndex((queued) => compareQueuedMessages(item, queued) < 0);
  if (index < 0) {
    return [...queue, item];
  }
  return [...queue.slice(0, index), item, ...queue.slice(index)];
}

/** Merges independently ordered queue keys while preserving the relative
 *  order within each key, including any manual reordering. */
export function mergeQueuedMessages(
  first: readonly QueuedMessage[],
  second: readonly QueuedMessage[],
): QueuedMessage[] {
  const merged: QueuedMessage[] = [];
  let firstIndex = 0;
  let secondIndex = 0;

  while (firstIndex < first.length && secondIndex < second.length) {
    if (compareQueuedMessages(first[firstIndex], second[secondIndex]) <= 0) {
      merged.push(first[firstIndex]);
      firstIndex += 1;
    } else {
      merged.push(second[secondIndex]);
      secondIndex += 1;
    }
  }

  merged.push(...first.slice(firstIndex), ...second.slice(secondIndex));
  return merged;
}
