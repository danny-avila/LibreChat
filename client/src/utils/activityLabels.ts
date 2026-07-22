import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TActivityLabelEvent, TMessageContentParts } from 'librechat-data-provider';
import type { LocalizeFunction } from '~/common';

type ActivityLabelPart = Extract<TMessageContentParts, { type: ContentTypes.ACTIVITY_LABEL }>;

/** Returns the activity-label content part when `part` is one, else undefined. */
export function getActivityLabelPart(
  part: TMessageContentParts | undefined,
): ActivityLabelPart | undefined {
  return part?.type === ContentTypes.ACTIVITY_LABEL ? (part as ActivityLabelPart) : undefined;
}

const COUNT_SEGMENTS: Array<{
  key: keyof NonNullable<ActivityLabelPart['counts']>;
  one: Parameters<LocalizeFunction>[0];
  other: Parameters<LocalizeFunction>[0];
}> = [
  { key: 'searches', one: 'com_ui_activity_searched_one', other: 'com_ui_activity_searched_other' },
  { key: 'reads', one: 'com_ui_activity_read_one', other: 'com_ui_activity_read_other' },
  { key: 'writes', one: 'com_ui_activity_wrote_one', other: 'com_ui_activity_wrote_other' },
  { key: 'commands', one: 'com_ui_activity_ran_one', other: 'com_ui_activity_ran_other' },
  { key: 'other', one: 'com_ui_activity_used_one', other: 'com_ui_activity_used_other' },
];

/**
 * Deterministic fallback header: renders instantly at batch end from tool-name
 * counts; the fast-model label replaces it when it arrives.
 */
export function buildActivityCountsPhrase(
  counts: ActivityLabelPart['counts'] | undefined,
  localize: LocalizeFunction,
): string {
  if (!counts) {
    return '';
  }
  const segments: string[] = [];
  for (const segment of COUNT_SEGMENTS) {
    const count = counts[segment.key];
    if (count > 0) {
      segments.push(localize(count === 1 ? segment.one : segment.other, { 0: String(count) }));
    }
  }
  return segments.join(' · ');
}

/** Fast-model label when present, localized deterministic counts phrase otherwise. */
export function getActivityLabelText(
  part: ActivityLabelPart | undefined,
  localize: LocalizeFunction,
): string {
  if (!part) {
    return '';
  }
  const label = part[ContentTypes.ACTIVITY_LABEL];
  if (typeof label === 'string' && label.length > 0) {
    return label;
  }
  return buildActivityCountsPhrase(part.counts, localize);
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
