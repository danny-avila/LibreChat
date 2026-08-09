import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TActivityLabelEvent, TMessageContentParts } from 'librechat-data-provider';

type ActivityLabelPart = Extract<TMessageContentParts, { type: ContentTypes.ACTIVITY_LABEL }> & {
  activity_label_type?: 'phase';
  activity_start_index?: number;
  activity_count?: number;
  agent_ids?: string[];
};

export type ActivityPhaseSegment =
  | { type: 'content'; content: Array<TMessageContentParts | undefined> }
  | {
      type: 'phase';
      content: Array<TMessageContentParts | undefined>;
      labelPart: ActivityLabelPart;
      labelIndex: number;
    };

export function isPhaseActivityLabel(part: ActivityLabelPart | undefined): boolean {
  return part?.activity_label_type === 'phase';
}

export function getBatchActivityLabelPart(
  part: TMessageContentParts | undefined,
): ActivityLabelPart | undefined {
  const label = getActivityLabelPart(part);
  return label != null && !isPhaseActivityLabel(label) ? label : undefined;
}

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
 * Partitions completed phase markers into collapsed parent groups while
 * retaining absolute indices through sparse content arrays. Empty/pending
 * markers deliberately return no phase segment, preserving feature-off UI.
 */
export function groupActivityPhases(
  content: Array<TMessageContentParts | undefined> | undefined,
): ActivityPhaseSegment[] | undefined {
  if (!content) {
    return undefined;
  }
  const completed = content
    .map((part, index) => ({ part: getActivityLabelPart(part), index }))
    .filter(
      ({ part }) =>
        isPhaseActivityLabel(part) &&
        part?.pending !== true &&
        getActivityLabelText(part).length > 0 &&
        typeof part?.activity_start_index === 'number',
    );
  if (completed.length === 0) {
    return undefined;
  }

  const segments: ActivityPhaseSegment[] = [];
  let cursor = 0;
  const sliceSparse = (start: number, end: number) =>
    content.map((part, index) => (index >= start && index < end ? part : undefined));
  for (const { part, index } of completed) {
    if (!part) continue;
    const start = Math.max(
      cursor,
      Math.min(index, Math.max(0, part.activity_start_index ?? index)),
    );
    if (start > cursor) {
      segments.push({ type: 'content', content: sliceSparse(cursor, start) });
    }
    if (index > start) {
      segments.push({
        type: 'phase',
        content: sliceSparse(start, index),
        labelPart: part,
        labelIndex: index,
      });
    }
    cursor = index + 1;
  }
  if (cursor < content.length) {
    segments.push({ type: 'content', content: sliceSparse(cursor, content.length) });
  }
  return segments;
}

/**
 * Last content index that actually renders something. Trailing BLANK label
 * reservations are invisible (every batch publishes one at batch end), so
 * counting one as the last part would suppress the streaming cursor and
 * other last-item affordances on the last VISIBLE part for the whole
 * interval until the label fills or the next delta arrives. Used by both
 * the sequential and parallel content renderers so they stay in lockstep.
 */
export function lastVisibleContentIdx(
  content: ReadonlyArray<TMessageContentParts | undefined> | undefined,
): number {
  const parts = content ?? [];
  let last = parts.length - 1;
  while (last >= 0) {
    const tail = parts[last];
    if (tail == null) {
      last -= 1;
    } else if (
      tail.type === ContentTypes.ACTIVITY_LABEL &&
      getActivityLabelText(getActivityLabelPart(tail)).length === 0
    ) {
      last -= 1;
    } else {
      break;
    }
  }
  return last;
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
    existing.pending === part.pending &&
    existing.activity_label_type ===
      (part as TActivityLabelEvent['part'] & { activity_label_type?: 'phase' }).activity_label_type
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
