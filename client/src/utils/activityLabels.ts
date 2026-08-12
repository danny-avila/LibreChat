import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TActivityLabelEvent, TMessageContentParts } from 'librechat-data-provider';

type ActivityLabelPart = Extract<TMessageContentParts, { type: ContentTypes.ACTIVITY_LABEL }> & {
  activity_label_type?: 'phase';
  activity_start_index?: number;
  activity_end_index?: number;
  activity_count?: number;
  agent_ids?: string[];
};

export type ActivityPhaseSegment =
  | {
      type: 'content';
      content: Array<TMessageContentParts | undefined>;
      startIndex: number;
    }
  | {
      type: 'phase';
      content: Array<TMessageContentParts | undefined>;
      startIndex: number;
      labelPart: ActivityLabelPart;
      labelIndex: number;
      hasContent: boolean;
    };

function isVisibleContentPart(part: TMessageContentParts | undefined): boolean {
  return (
    part != null &&
    !(
      part.type === ContentTypes.ACTIVITY_LABEL &&
      getActivityLabelText(getActivityLabelPart(part)).length === 0
    )
  );
}

function isLogicallyEarlierPhaseMarker(
  parts: ReadonlyArray<TMessageContentParts | undefined>,
  index: number,
): boolean {
  const part = parts[index];
  const label = getActivityLabelPart(part);
  if (!isPhaseActivityLabel(label) || typeof label?.activity_end_index !== 'number') {
    return false;
  }
  const endIndex = Math.max(0, Math.min(index, label.activity_end_index));
  if (endIndex >= index) {
    return false;
  }
  return parts.slice(endIndex, index).some((trailingPart) => {
    if (!isVisibleContentPart(trailingPart)) {
      return false;
    }
    if (trailingPart?.type !== ContentTypes.TEXT) {
      return true;
    }
    const text =
      typeof trailingPart.text === 'string' ? trailingPart.text : trailingPart.text?.value;
    return typeof text === 'string' && text.length > 0;
  });
}

function isLateActivityLabelConsumedByPhase(
  parts: ReadonlyArray<TMessageContentParts | undefined>,
  index: number,
): boolean {
  if (getBatchActivityLabelPart(parts[index]) == null) {
    return false;
  }
  for (let markerIndex = index + 1; markerIndex < parts.length; markerIndex += 1) {
    const marker = getActivityLabelPart(parts[markerIndex]);
    if (
      isPhaseActivityLabel(marker) &&
      marker?.pending !== true &&
      getActivityLabelText(marker).length > 0 &&
      typeof marker.activity_end_index === 'number' &&
      marker.activity_end_index <= index
    ) {
      return true;
    }
  }
  return false;
}

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

/** Maps a completion-local half-open boundary into edited-response coordinates. */
export function offsetActivityPhaseBoundary(
  boundary: number,
  prefixLength: number,
  foldedFirstPart: boolean,
): number {
  return boundary + prefixLength - (foldedFirstPart && boundary <= 1 ? 1 : 0);
}

/**
 * Partitions completed phase markers into collapsed parent groups while
 * carrying absolute start offsets alongside dense content slices. Empty/pending
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
  /** Disjoint slices copy every ordinary part at most once. A phase slice can
   *  remain sparse when it adopts a late child label across trailing text;
   *  `startIndex` preserves the label's absolute transcript coordinate. */
  const slice = (start: number, end: number) => {
    const segmentContent = content.slice(start, end);
    return {
      content: segmentContent,
      startIndex: start,
      hasContent: segmentContent.some(isVisibleContentPart),
    };
  };
  for (const { part, index } of completed) {
    if (!part) continue;
    const start = Math.max(
      cursor,
      Math.min(index, Math.max(0, part.activity_start_index ?? index)),
    );
    const end = Math.max(start, Math.min(index, Math.max(0, part.activity_end_index ?? index)));
    const lateLabelIndices: number[] = [];
    for (let trailingIndex = end; trailingIndex < index; trailingIndex += 1) {
      if (getBatchActivityLabelPart(content[trailingIndex]) != null) {
        lateLabelIndices.push(trailingIndex);
      }
    }
    if (start > cursor) {
      const adjacent = slice(cursor, start);
      segments.push({
        type: 'content',
        content: adjacent.content,
        startIndex: adjacent.startIndex,
      });
    }
    const phase = slice(start, end);
    if (lateLabelIndices.length > 0) {
      phase.content.length = index - start;
      for (const lateLabelIndex of lateLabelIndices) {
        phase.content[lateLabelIndex - start] = content[lateLabelIndex];
      }
      phase.hasContent = phase.content.some(isVisibleContentPart);
    }
    segments.push({
      type: 'phase',
      content: phase.content,
      startIndex: phase.startIndex,
      labelPart: part,
      labelIndex: index,
      hasContent: phase.hasContent,
    });
    if (end < index) {
      const trailing = slice(end, index);
      for (const lateLabelIndex of lateLabelIndices) {
        trailing.content[lateLabelIndex - end] = undefined;
      }
      segments.push({
        type: 'content',
        content: trailing.content,
        startIndex: trailing.startIndex,
      });
    }
    cursor = index + 1;
  }
  if (cursor < content.length) {
    const adjacent = slice(cursor, content.length);
    segments.push({
      type: 'content',
      content: adjacent.content,
      startIndex: adjacent.startIndex,
    });
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
  while (last >= 0 && last in parts) {
    if (
      isVisibleContentPart(parts[last]) &&
      !isLogicallyEarlierPhaseMarker(parts, last) &&
      !isLateActivityLabelConsumedByPhase(parts, last)
    ) {
      return last;
    }
    last -= 1;
  }
  if (last < 0) {
    return -1;
  }
  /** Streaming/resume arrays can retain absolute indices as true holes. Jump
   *  between defined slots instead of walking the whole index space. */
  const definedIndices = Object.keys(parts);
  for (let i = definedIndices.length - 1; i >= 0; i -= 1) {
    const index = Number(definedIndices[i]);
    if (
      index <= last &&
      isVisibleContentPart(parts[index]) &&
      !isLogicallyEarlierPhaseMarker(parts, index) &&
      !isLateActivityLabelConsumedByPhase(parts, index)
    ) {
      return index;
    }
  }
  return -1;
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
  const incoming = part as ActivityLabelPart;
  if (
    existing != null &&
    existing[ContentTypes.ACTIVITY_LABEL] === part[ContentTypes.ACTIVITY_LABEL] &&
    existing.pending === part.pending &&
    existing.activity_label_type === incoming.activity_label_type &&
    existing.activity_start_index === incoming.activity_start_index &&
    existing.activity_end_index === incoming.activity_end_index &&
    existing.activity_count === incoming.activity_count
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
