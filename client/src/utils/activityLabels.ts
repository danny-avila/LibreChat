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
 * Deterministic fallback header: renders instantly at batch end from tool-name
 * counts; the fast-model label replaces it when it arrives.
 */
export function buildActivityCountsPhrase(counts?: ActivityLabelPart['counts']): string {
  if (!counts) {
    return '';
  }
  const { searches, reads, writes, commands, other } = counts;
  const segments: string[] = [];
  if (searches > 0) {
    segments.push(`searched ${searches} ${searches === 1 ? 'source' : 'sources'}`);
  }
  if (reads > 0) {
    segments.push(`read ${reads} ${reads === 1 ? 'file' : 'files'}`);
  }
  if (writes > 0) {
    segments.push(`wrote ${writes} ${writes === 1 ? 'file' : 'files'}`);
  }
  if (commands > 0) {
    segments.push(`ran ${commands} ${commands === 1 ? 'command' : 'commands'}`);
  }
  if (other > 0) {
    segments.push(`used ${other} ${other === 1 ? 'tool' : 'tools'}`);
  }
  return segments.join(' · ');
}

/** Fast-model label when present, deterministic counts phrase otherwise. */
export function getActivityLabelText(part: ActivityLabelPart | undefined): string {
  if (!part) {
    return '';
  }
  const label = part[ContentTypes.ACTIVITY_LABEL];
  if (typeof label === 'string' && label.length > 0) {
    return label;
  }
  return buildActivityCountsPhrase(part.counts);
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
 * SAME message reference when the slot already holds an identical label
 * (duplicate event replay), a new message otherwise.
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
  const nextContent = [...content] as TMessageContentParts[];
  nextContent[index] = part as TMessageContentParts;
  return { ...message, content: nextContent };
}
