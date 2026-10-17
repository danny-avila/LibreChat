import { createContext } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import type { SubagentContentPart } from '~/utils/subagentContent';

type NestedPart = TMessageContentParts | SubagentContentPart | undefined;

const EMPTY: TAttachment[] = [];

/**
 * Attachments no top-level part of the message claims by tool call id. A tool
 * run inside a subagent saves its files under the child tool call id, which
 * only appears inside the parent `subagent` call, so the subagent row picks
 * its own files out of this list.
 */
export const SubagentAttachmentsContext = createContext<TAttachment[]>(EMPTY);

/** Every tool call id in `parts`, descending into nested `subagent_content`. */
export function collectToolCallIds(
  parts: ReadonlyArray<NestedPart> | undefined,
  ids: Set<string> = new Set(),
  nested = true,
): Set<string> {
  for (const part of parts ?? []) {
    if (part?.type !== ContentTypes.TOOL_CALL) {
      continue;
    }
    const toolCall = part[ContentTypes.TOOL_CALL] as
      | { id?: string; subagent_content?: TMessageContentParts[] }
      | undefined;
    if (toolCall?.id) {
      ids.add(toolCall.id);
    }
    if (nested && Array.isArray(toolCall?.subagent_content)) {
      collectToolCallIds(toolCall.subagent_content, ids);
    }
  }
  return ids;
}

/** Attachments whose tool call id matches no top-level part of `content`. */
export function selectUnclaimedAttachments(
  content: ReadonlyArray<NestedPart> | undefined,
  attachments: TAttachment[] | undefined,
): TAttachment[] {
  if (attachments == null || attachments.length === 0) {
    return EMPTY;
  }
  const claimed = collectToolCallIds(content, new Set(), false);
  const unclaimed = attachments.filter(
    (attachment) => attachment.toolCallId != null && !claimed.has(attachment.toolCallId),
  );
  return unclaimed.length > 0 ? unclaimed : EMPTY;
}

/** Unclaimed attachments produced by the tool calls nested in a subagent run. */
export function selectNestedAttachments(
  unclaimed: TAttachment[],
  ...sources: Array<ReadonlyArray<NestedPart> | undefined>
): TAttachment[] {
  if (unclaimed.length === 0) {
    return EMPTY;
  }
  const ids = new Set<string>();
  for (const source of sources) {
    collectToolCallIds(source, ids);
  }
  if (ids.size === 0) {
    return EMPTY;
  }
  const nested = unclaimed.filter(
    (attachment) => attachment.toolCallId != null && ids.has(attachment.toolCallId),
  );
  return nested.length > 0 ? nested : EMPTY;
}
