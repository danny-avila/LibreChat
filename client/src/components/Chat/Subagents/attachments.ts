import { createContext, useMemo } from 'react';
import { atom, useAtomValue } from 'jotai';
import { Constants, ContentTypes } from 'librechat-data-provider';
import type { TAttachment, TMessageContentParts } from 'librechat-data-provider';
import type { SubagentContentPart } from '~/utils/subagentContent';
import { subagentProgressByToolCallId, subagentProgressKey } from './state';

type NestedPart = TMessageContentParts | SubagentContentPart | undefined;
type ToolCallFields = { id?: string; name?: string; subagent_content?: TMessageContentParts[] };

const EMPTY: TAttachment[] = [];
const NO_LIVE_CALLS: ReadonlyMap<string, string[]> = new Map();

/**
 * Attachments no top-level part of the message claims by tool call id. A tool
 * run inside a subagent saves its files under the child tool call id, which
 * only appears inside the parent `subagent` call, so that call's part claims
 * its files out of this list.
 */
export const SubagentAttachmentsContext = createContext<TAttachment[]>(EMPTY);

const toolCallOf = (part: NestedPart): ToolCallFields | undefined =>
  part?.type === ContentTypes.TOOL_CALL
    ? (part[ContentTypes.TOOL_CALL] as ToolCallFields | undefined)
    : undefined;

/** Every tool call id in `parts`, descending into nested `subagent_content`. */
export function collectToolCallIds(
  parts: ReadonlyArray<NestedPart> | undefined,
  ids: Set<string> = new Set(),
  nested = true,
): Set<string> {
  for (const part of parts ?? []) {
    const toolCall = toolCallOf(part);
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

/** Unclaimed attachments produced by the given child tool call ids. */
export function selectNestedAttachments(
  unclaimed: TAttachment[],
  ids: ReadonlySet<string>,
): TAttachment[] {
  if (unclaimed.length === 0 || ids.size === 0) {
    return EMPTY;
  }
  const nested = unclaimed.filter(
    (attachment) => attachment.toolCallId != null && ids.has(attachment.toolCallId),
  );
  return nested.length > 0 ? nested : EMPTY;
}

/**
 * Child tool call ids of each subagent call in `content` that is still
 * streaming, keyed by the subagent call id. Until the run is saved those calls
 * exist only in the live progress atom. The atom yields a signature string so
 * the caller re-renders when a child call appears, not on every delta.
 */
export function useLiveSubagentToolCalls(
  content: ReadonlyArray<NestedPart> | undefined,
  messageId: string,
  contentIndices: ReadonlyArray<number> | undefined,
  contentIndexOffset: number,
): ReadonlyMap<string, string[]> {
  const keys = useMemo(() => {
    const entries: Array<[string, string]> = [];
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
  }, [content, messageId, contentIndices, contentIndexOffset]);
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
