import { Constants, ContentTypes } from 'librechat-data-provider';
import type {
  TMessage,
  TPendingSteer,
  TSteerAppliedEvent,
  TMessageContentParts,
} from 'librechat-data-provider';

type SteerPart = Extract<TMessageContentParts, { type: ContentTypes.STEER }>;

/** Returns the steer content part when `part` is one, else undefined. */
export function getSteerPart(part: TMessageContentParts | undefined): SteerPart | undefined {
  return part?.type === ContentTypes.STEER ? (part as SteerPart) : undefined;
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
 *  after the run's final event, so the set is capped rather than cleared. */
const APPLIED_STEER_IDS_CAP = 100;

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
