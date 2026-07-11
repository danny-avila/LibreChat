import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TMessageContentParts, TSteerAppliedEvent } from 'librechat-data-provider';

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
