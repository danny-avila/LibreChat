import { Constants, ContentTypes } from 'librechat-data-provider';
import type {
  TMessage,
  TPendingSteer,
  TSteerAppliedEvent,
  TMessageContentParts,
} from 'librechat-data-provider';
import type { QueuedMessage, QueuedMessageOrigin } from '~/store/families';

type SteerPart = Extract<TMessageContentParts, { type: ContentTypes.STEER }>;

/** Returns the steer content part when `part` is one, else undefined. */
export function getSteerPart(part: TMessageContentParts | undefined): SteerPart | undefined {
  return part?.type === ContentTypes.STEER ? (part as SteerPart) : undefined;
}

/** Server/client ids embedded in applied steer parts, whether passed a raw
 * content array or message objects. Used during reconnect to retire a failed
 * optimistic chip whose POST ACK was lost before the steer applied offline. */
export function collectAppliedSteerIds(values: unknown[] | undefined): string[] {
  if (!values) {
    return [];
  }
  const ids = new Set<string>();
  for (const value of values) {
    if (value == null || typeof value !== 'object') {
      continue;
    }
    const object = value as {
      type?: unknown;
      steerId?: unknown;
      clientSteerId?: unknown;
      content?: unknown;
    };
    const parts = Array.isArray(object.content) ? object.content : [object];
    for (const part of parts) {
      if (part == null || typeof part !== 'object') {
        continue;
      }
      const candidate = part as {
        type?: unknown;
        steerId?: unknown;
        clientSteerId?: unknown;
      };
      if (candidate.type !== ContentTypes.STEER) {
        continue;
      }
      if (typeof candidate.steerId === 'string') {
        ids.add(candidate.steerId);
      }
      if (typeof candidate.clientSteerId === 'string') {
        ids.add(candidate.clientSteerId);
      }
    }
  }
  return [...ids];
}

/**
 * Places an injected steer part at its absolute content index on the target
 * response message. The server reserved that slot (subsequent SDK events were
 * emitted with already-shifted indices), so the write never collides with
 * streamed parts — the array is written by index, holes included, exactly like
 * the streaming content handler.
 *
 * Pure with a referential-stability contract shared with `applyPendingAction`:
 * returns the SAME message reference when the part is already present
 * (duplicate event replay), a new message otherwise.
 */
export function applySteerPart(message: TMessage, event: TSteerAppliedEvent): TMessage {
  const { index, part } = event;
  if (typeof index !== 'number' || index < 0 || part == null) {
    return message;
  }
  const content = Array.isArray(message.content) ? message.content : [];
  const existing = getSteerPart(content[index] as TMessageContentParts | undefined);
  if (existing != null && existing.steerId === part.steerId) {
    return message;
  }
  const nextContent = [...content] as TMessageContentParts[];
  nextContent[index] = part as TMessageContentParts;
  return { ...message, content: nextContent };
}

/**
 * Conversation key for the run-end queue signal. An early-aborted FIRST turn
 * has no server-side conversation (the client restores /c/new), so keying the
 * signal by the optimistic stream id would park queued follow-ups under an id
 * the user never sees again — key under NEW_CONVO (and drop the migration
 * flag) so `useQueueDrain` leaves the queue on the new-chat composer.
 */
export function resolveRunEndTarget(params: {
  conversationId: string;
  earlyAbort: boolean;
  startedAsNewConvo: boolean;
}): { conversationId: string; startedAsNewConvo: boolean } {
  const { conversationId, earlyAbort, startedAsNewConvo } = params;
  if (earlyAbort && startedAsNewConvo) {
    return { conversationId: String(Constants.NEW_CONVO), startedAsNewConvo: false };
  }
  return { conversationId, startedAsNewConvo };
}

/**
 * Targets for consuming an abort HTTP response's leftover steers. The server
 * echoes the RESOLVED job id (`aborted`), which is authoritative when the
 * client still holds the `new` placeholder on a just-started first turn.
 * Chips and the interrupt-drain signal land where the mounted composer's
 * queue/drain machinery looks: a `new`-held turn hasn't navigated, so they
 * stay keyed under NEW_CONVO (same rule as `resolveRunEndTarget`'s early-abort
 * case), while the parked-copy claim uses the resolved id the server keyed
 * the parked steers under.
 */
export function resolveAbortSteerTarget(params: { conversationId: string; resolvedId?: string }): {
  chipConvoId: string;
  claimConvoId: string;
} {
  const { conversationId, resolvedId } = params;
  const claimConvoId = resolvedId ?? conversationId;
  const chipConvoId =
    conversationId === String(Constants.NEW_CONVO) ? conversationId : claimConvoId;
  return { chipConvoId, claimConvoId };
}

/** Bounds the per-conversation applied-steer id set. A late 202 ACK can land
 * after the run's final event, so the set is capped rather than cleared.
 * Modern steers contribute both a server and client correlation id; retain
 * two ids for every one of the server's 100 durable receipt slots. */
const APPLIED_STEER_IDS_CAP = 200;

/**
 * Appends steer ids to an applied-id set, deduped and capped. Returns the
 * same array when nothing new lands so Recoil writers keep referential
 * stability.
 */
export function appendAppliedSteerIds(prev: string[], steerIds: string[]): string[] {
  const fresh = steerIds.filter((id) => !prev.includes(id));
  if (fresh.length === 0) {
    return prev;
  }
  return [...prev, ...fresh].slice(-APPLIED_STEER_IDS_CAP);
}

export type SteerCarriedContext = { quotes?: string[]; manualSkills?: string[] };

/** Quotes/skill picks are client-only (a steer never sends them to the
 *  server); chip mints, reseeds, and queued conversions carry them from the
 *  local source so the context survives a steer that never injects. */
export function carriedSteerContext(source?: SteerCarriedContext): SteerCarriedContext {
  const quotes = source?.quotes;
  const manualSkills = source?.manualSkills;
  return {
    ...(quotes && quotes.length > 0 && { quotes }),
    ...(manualSkills && manualSkills.length > 0 && { manualSkills }),
  };
}

/**
 * The queue's one ordering rule, shared by every writer so a reorder cannot be
 * undone by the next enqueue re-sorting on a different key: the priority tier
 * first ("Interrupt & send" front-inserts, "Send next" promotions), then most
 * recent promotion within that tier, then enqueue order.
 */
export function compareQueuedMessages(a: QueuedMessage, b: QueuedMessage): number {
  const tier = Number(b.priority === true) - Number(a.priority === true);
  if (tier !== 0) {
    return tier;
  }
  if (a.bumpedAt !== b.bumpedAt) {
    return (b.bumpedAt ?? 0) - (a.bumpedAt ?? 0);
  }
  return a.createdAt - b.createdAt;
}

/** Queued texts are separate thoughts, so a join reads as paragraphs. */
export const QUEUED_TEXT_SEPARATOR = '\n\n';

/**
 * A row bound to a parked server source cannot be merged or rewritten: the
 * recovery turn must reproduce that source's exact text and file set, and its
 * user-row identity is the receipt id, so two sources cannot become one turn.
 * Discarding the parked copy first (`discardQueued`) downgrades the row and
 * makes it mergeable like any local follow-up.
 */
export function isMergeableQueuedMessage(item: QueuedMessage): boolean {
  return item.recoverySteerId == null && item.clientRequestId == null;
}

const dedupeFiles = (items: QueuedMessage[]): TMessage['files'] => {
  const byId = new Map<string, NonNullable<TMessage['files']>[number]>();
  for (const item of items) {
    for (const file of item.files ?? []) {
      const key = file.file_id ?? file.filepath ?? '';
      if (key.length > 0 && !byId.has(key)) {
        byId.set(key, file);
      }
    }
  }
  return byId.size > 0 ? [...byId.values()] : undefined;
};

const dedupeStrings = (values: Array<string[] | undefined>): string[] | undefined => {
  const merged = new Set<string>();
  for (const list of values) {
    for (const value of list ?? []) {
      merged.add(value);
    }
  }
  return merged.size > 0 ? [...merged] : undefined;
};

/**
 * Folds queued rows into the one turn they were probably always meant to be —
 * each extra turn costs a full model round trip and context replay. Keeps the
 * front-most row's identity and position so the merged message drains exactly
 * where the first of its parts would have, and takes the LATEST predecessor
 * fence of the batch so the merged turn is gated on everything it followed.
 */
export function mergeQueuedMessages(items: QueuedMessage[]): QueuedMessage | null {
  if (items.length < 2 || items.some((item) => !isMergeableQueuedMessage(item))) {
    return null;
  }
  const [first] = items;
  const files = dedupeFiles(items);
  const quotes = dedupeStrings(items.map((item) => item.quotes));
  const manualSkills = dedupeStrings(items.map((item) => item.manualSkills));
  const fences = items
    .map((item) => item.expectedPredecessorCreatedAt)
    .filter((value): value is number => value != null);
  return {
    id: first.id,
    text: items.map((item) => item.text).join(QUEUED_TEXT_SEPARATOR),
    createdAt: first.createdAt,
    ...(first.priority === true && { priority: true }),
    ...(first.bumpedAt != null && { bumpedAt: first.bumpedAt }),
    ...(fences.length > 0 && { expectedPredecessorCreatedAt: Math.max(...fences) }),
    ...(files && { files }),
    ...(quotes && { quotes }),
    ...(manualSkills && { manualSkills }),
  };
}

/** Promotes an item to drain next, leaving every other item's order intact. */
export function bumpQueuedMessage(
  queue: QueuedMessage[],
  id: string,
  bumpedAt: number,
): QueuedMessage[] {
  const index = queue.findIndex((item) => item.id === id);
  if (index < 0) {
    return queue;
  }
  const next = [...queue];
  next[index] = { ...next[index], priority: true, bumpedAt };
  return next.sort(compareQueuedMessages);
}

/** Restore a temporarily removed queue item using surviving original
 * neighbours first, then the queue's durable priority/time ordering. */
export function insertQueuedOrigin(
  queue: QueuedMessage[],
  origin: QueuedMessageOrigin,
  expectedPredecessorCreatedAt?: number,
): QueuedMessage[] {
  const rebasePredecessor = (item: QueuedMessage): QueuedMessage => {
    if (expectedPredecessorCreatedAt === undefined) {
      return item;
    }
    return item.expectedPredecessorCreatedAt === expectedPredecessorCreatedAt
      ? item
      : { ...item, expectedPredecessorCreatedAt };
  };

  const existingIndex = queue.findIndex((queued) => queued.id === origin.item.id);
  if (existingIndex >= 0) {
    const rebased = rebasePredecessor(queue[existingIndex]);
    if (rebased === queue[existingIndex]) {
      return queue;
    }
    const next = [...queue];
    next[existingIndex] = rebased;
    return next;
  }
  const restoredItem = rebasePredecessor(origin.item);
  let index = -1;
  for (const id of origin.afterIds) {
    index = queue.findIndex((queued) => queued.id === id);
    if (index >= 0) {
      break;
    }
  }
  if (index < 0) {
    for (let i = origin.beforeIds.length - 1; i >= 0; i -= 1) {
      const beforeIndex = queue.findIndex((queued) => queued.id === origin.beforeIds[i]);
      if (beforeIndex >= 0) {
        index = beforeIndex + 1;
        break;
      }
    }
  }
  if (index < 0) {
    index = queue.findIndex((queued) => compareQueuedMessages(restoredItem, queued) < 0);
    if (index < 0) {
      index = queue.length;
    }
  }
  return [...queue.slice(0, index), restoredItem, ...queue.slice(index)];
}

/** Merges steer lists into one id-deduped conversion batch (first wins). */
export function dedupeSteersById(...lists: Array<TPendingSteer[] | undefined>): TPendingSteer[] {
  const seen = new Set<string>();
  const merged: TPendingSteer[] = [];
  for (const list of lists) {
    for (const steer of list ?? []) {
      if (seen.has(steer.steerId)) {
        continue;
      }
      seen.add(steer.steerId);
      merged.push(steer);
    }
  }
  return merged;
}

/**
 * Resolves the assistant response message a steer event targets. Exact-id
 * assistant match when `responseMessageId` is present (a miss returns -1 so
 * the caller retries next frame — same rationale as
 * `findPendingActionMessageIndex`); best-effort last assistant otherwise.
 */
export function findSteerMessageIndex(messages: TMessage[], event: TSteerAppliedEvent): number {
  const isAssistant = (message: TMessage | undefined) => message?.isCreatedByUser === false;
  const { responseMessageId } = event;
  if (responseMessageId) {
    return messages.findIndex(
      (message) => message.messageId === responseMessageId && isAssistant(message),
    );
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isAssistant(messages[i])) {
      return i;
    }
  }
  return -1;
}
