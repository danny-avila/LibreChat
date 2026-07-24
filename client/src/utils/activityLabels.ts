import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TActivityLabelEvent, TMessageContentParts } from 'librechat-data-provider';

type ActivityLabelPart = Extract<TMessageContentParts, { type: ContentTypes.ACTIVITY_LABEL }>;

/** Returns the activity-label content part when `part` is one, else undefined. */
export function getActivityLabelPart(
  part: TMessageContentParts | undefined,
): ActivityLabelPart | undefined {
  return part?.type === ContentTypes.ACTIVITY_LABEL ? (part as ActivityLabelPart) : undefined;
}

/**
 * The generated description, or empty when none exists yet.
 *
 * There is deliberately NO fallback string. A templated stand-in
 * ("ran 1 command") only restates the tool card rendered directly beneath
 * it, and showing one changes the UI before anything worth reading exists.
 * Callers render nothing until this returns text.
 */
export function getActivityLabelText(part: ActivityLabelPart | undefined): string {
  if (!part) {
    return '';
  }
  const label = part[ContentTypes.ACTIVITY_LABEL];
  return typeof label === 'string' ? label.trim() : '';
}

/**
 * Resolves the assistant response message an activity-label event targets.
 * Exact-id assistant match when `responseMessageId` is present (a miss
 * returns -1 so the caller retries next frame); best-effort last assistant
 * otherwise. Mirrors `findSteerMessageIndex`.
 */
export function findActivityLabelMessageIndex(
  messages: TMessage[],
  event: TActivityLabelEvent,
): number {
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

/**
 * Places an activity-label part at its absolute content index on the target
 * response message. The server claimed that slot (subsequent SDK events were
 * emitted with already-shifted indices), so the write never collides with
 * streamed parts. Pure with a referential-stability contract: returns the
 * SAME message reference when the write would be a no-op — including when a
 * stale pending placeholder arrives AFTER the resolved label (out-of-order
 * publish), which must never overwrite the filled text.
 */
export function applyActivityLabelPart(message: TMessage, event: TActivityLabelEvent): TMessage {
  const { index, part } = event;
  if (typeof index !== 'number' || index < 0 || part == null) {
    return message;
  }
  const content = Array.isArray(message.content) ? message.content : [];
  const existing = getActivityLabelPart(content[index] as TMessageContentParts | undefined);
  if (
    existing != null &&
    existing[ContentTypes.ACTIVITY_LABEL] === part[ContentTypes.ACTIVITY_LABEL] &&
    existing.pending === part.pending
  ) {
    return message;
  }
  const existingText = existing?.[ContentTypes.ACTIVITY_LABEL];
  if (
    existing != null &&
    existing.pending !== true &&
    typeof existingText === 'string' &&
    existingText.length > 0 &&
    part.pending === true
  ) {
    return message;
  }
  const nextContent = [...content] as TMessageContentParts[];
  nextContent[index] = part as TMessageContentParts;
  return { ...message, content: nextContent };
}
