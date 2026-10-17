import { createContext, useMemo } from 'react';
import { atom, useAtomValue } from 'jotai';
import { Constants, ContentTypes } from 'librechat-data-provider';
import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import type { SubagentContentPart } from '~/utils/subagentContent';
import { subagentProgressByToolCallId, subagentProgressKey } from './state';

type NestedPart = TMessageContentParts | SubagentContentPart | undefined;
type ToolCallFields = {
  id?: string;
  name?: string;
  subagent_content?: TMessageContentParts[];
  subagentAttachmentToolCallIds?: string[];
};

const EMPTY: TAttachment[] = [];
const NO_LIVE_CALLS: ReadonlyMap<string, string[]> = new Map();
const NO_NESTED: ReadonlyMap<string, TAttachment[]> = new Map();

/**
 * Attachments no top-level part of the message accepts. A tool run inside a
 * subagent saves its files under the child tool call id, which only appears
 * inside the parent `subagent` call, so that call's part claims its files out
 * of this list.
 */
export const SubagentAttachmentsContext = createContext<TAttachment[]>(EMPTY);

const toolCallOf = (part: NestedPart): ToolCallFields | undefined =>
  part?.type === ContentTypes.TOOL_CALL
    ? (part[ContentTypes.TOOL_CALL] as ToolCallFields | undefined)
    : undefined;

/**
 * Every tool call id in `parts`, descending into nested `subagent_content`. A
 * preview that left the transcript out still names the ids its files were
 * saved under in `subagentAttachmentToolCallIds`.
 */
export function collectToolCallIds(
  parts: ReadonlyArray<NestedPart> | undefined,
  ids: Set<string> = new Set(),
): Set<string> {
  for (const part of parts ?? []) {
    const toolCall = toolCallOf(part);
    if (toolCall?.id) {
      ids.add(toolCall.id);
    }
    for (const id of toolCall?.subagentAttachmentToolCallIds ?? []) {
      ids.add(id);
    }
    if (Array.isArray(toolCall?.subagent_content)) {
      collectToolCallIds(toolCall.subagent_content, ids);
    }
  }
  return ids;
}

/** Tool attachments that `claimed` (what the top-level parts accept) leaves out. */
export function selectUnclaimedAttachments(
  attachments: TAttachment[],
  claimed: ReadonlySet<TAttachment>,
): TAttachment[] {
  const unclaimed = attachments.filter(
    (attachment) => attachment.toolCallId != null && !claimed.has(attachment),
  );
  return unclaimed.length > 0 ? unclaimed : EMPTY;
}

/**
 * Hands each unclaimed attachment to the first tool call part in `content`
 * whose transcript (stored, previewed, or streaming in `live`) holds the tool
 * call it was saved under, keyed by that part's tool call id. The first owner
 * wins, so a child id two subagents share still renders the file once.
 */
export function assignNestedAttachments(
  content: ReadonlyArray<NestedPart> | undefined,
  unclaimed: TAttachment[],
  live: ReadonlyMap<string, string[]>,
): ReadonlyMap<string, TAttachment[]> {
  if (unclaimed.length === 0) {
    return NO_NESTED;
  }
  const assigned = new Map<string, TAttachment[]>();
  const taken = new Set<TAttachment>();
  for (const part of content ?? []) {
    const toolCall = toolCallOf(part);
    if (!toolCall?.id) {
      continue;
    }
    const childIds = collectToolCallIds(toolCall.subagent_content);
    for (const id of toolCall.subagentAttachmentToolCallIds ?? []) {
      childIds.add(id);
    }
    for (const id of live.get(toolCall.id) ?? []) {
      childIds.add(id);
    }
    if (childIds.size === 0) {
      continue;
    }
    for (const attachment of unclaimed) {
      if (taken.has(attachment) || !childIds.has(attachment.toolCallId ?? '')) {
        continue;
      }
      taken.add(attachment);
      const files = assigned.get(toolCall.id) ?? [];
      files.push(attachment);
      assigned.set(toolCall.id, files);
    }
  }
  return assigned.size > 0 ? assigned : NO_NESTED;
}

/**
 * Child tool call ids of each subagent call in `content` that is still
 * streaming, keyed by the subagent call id. Until the run is saved those calls
 * exist only in the live progress atom. The atom yields a signature string so
 * the caller re-renders when a child call appears, not on every delta. Only the
 * message that is streaming reads progress (`enabled`): reading creates the
 * atom family member, which nothing would release for a settled message.
 */
export function useLiveSubagentToolCalls(
  content: ReadonlyArray<NestedPart> | undefined,
  messageId: string,
  contentIndices: ReadonlyArray<number> | undefined,
  contentIndexOffset: number,
  enabled: boolean,
): ReadonlyMap<string, string[]> {
  const keys = useMemo(() => {
    const entries: Array<[string, string]> = [];
    if (!enabled) {
      return entries;
    }
    (content ?? []).forEach((part, index) => {
      const toolCall = toolCallOf(part);
      if (toolCall?.id && toolCall.name === Constants.SUBAGENT) {
        entries.push([
          toolCall.id,
          subagentProgressKey(
            messageId,
            toolCall.id,
            contentIndices?.[index] ?? index + contentIndexOffset,
          ),
        ]);
      }
    });
    return entries;
  }, [content, messageId, contentIndices, contentIndexOffset, enabled]);
  const signatureAtom = useMemo(
    () =>
      atom((get) =>
        keys
          .map(([id, key]) => {
            const childIds = collectToolCallIds(
              get(subagentProgressByToolCallId(key))?.contentParts,
            );
            return childIds.size === 0 ? '' : [id, ...childIds].join('\u0000');
          })
          .filter(Boolean)
          .join('\n'),
      ),
    [keys],
  );
  const signature = useAtomValue(signatureAtom);
  return useMemo(() => {
    if (signature === '') {
      return NO_LIVE_CALLS;
    }
    return new Map(
      signature.split('\n').map((entry) => {
        const [id, ...childIds] = entry.split('\u0000');
        return [id, childIds];
      }),
    );
  }, [signature]);
}
