import { createContext, useEffect, useMemo, useRef } from 'react';
import { atom, useStore, useAtomValue } from 'jotai';
import { Constants, ContentTypes } from 'librechat-data-provider';
import type { TAttachment, TMessageContentParts, Agents } from 'librechat-data-provider';
import type { SubagentContentPart } from '~/utils/subagentContent';
import { subagentProgressKey, retainSubagentProgress, subagentProgressByToolCallId } from './state';

type NestedPart = TMessageContentParts | SubagentContentPart | undefined;
/** A tool call inside a subagent run, with the scope its files may carry. */
export type NestedCall = Agents.SubagentAttachmentCall;
type ToolCallFields = {
  id?: string;
  name?: string;
  stepId?: string;
  subagent_content?: TMessageContentParts[];
  subagentAttachmentCalls?: NestedCall[];
};

const EMPTY: TAttachment[] = [];
const NO_LIVE_CALLS: ReadonlyMap<number, NestedCall[]> = new Map();
const NO_NESTED: ReadonlyMap<NestedPart, TAttachment[]> = new Map();

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
 * The tool calls of a subagent transcript, nested runs included, with their
 * scope. A preview that left a transcript out names the calls its files were
 * saved under in `subagentAttachmentCalls`.
 */
export function collectNestedCalls(
  parts: ReadonlyArray<NestedPart> | undefined,
  calls: NestedCall[] = [],
): NestedCall[] {
  for (const part of parts ?? []) {
    const toolCall = toolCallOf(part);
    if (toolCall?.id) {
      const agentId = (part as { agentId?: string } | undefined)?.agentId;
      calls.push({
        id: toolCall.id,
        ...(agentId == null ? {} : { agentId }),
        ...(toolCall.stepId == null ? {} : { stepId: toolCall.stepId }),
      });
    }
    calls.push(...(toolCall?.subagentAttachmentCalls ?? []));
    if (Array.isArray(toolCall?.subagent_content)) {
      collectNestedCalls(toolCall.subagent_content, calls);
    }
  }
  return calls;
}

/** The ownership rule top-level parts apply: a scope both sides carry must agree. */
const ownsAttachment = (call: NestedCall, attachment: TAttachment): boolean => {
  const { agentId, stepId } = attachment as { agentId?: string; stepId?: string };
  return (
    call.id === attachment.toolCallId &&
    (call.agentId == null || agentId == null || call.agentId === agentId) &&
    (call.stepId == null || stepId == null || call.stepId === stepId)
  );
};

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
 * whose transcript (stored, previewed, or streaming in `live`, keyed by content
 * index) holds the tool call it was saved under, under the same agent and step
 * scope rule top-level parts apply. The map is keyed by the part itself, so two
 * calls sharing an id keep their own files, and the first owner wins, so a
 * child id two subagents share still renders the file once.
 */
export function assignNestedAttachments(
  content: ReadonlyArray<NestedPart> | undefined,
  unclaimed: TAttachment[],
  live: ReadonlyMap<number, NestedCall[]>,
): ReadonlyMap<NestedPart, TAttachment[]> {
  if (unclaimed.length === 0) {
    return NO_NESTED;
  }
  const assigned = new Map<NestedPart, TAttachment[]>();
  const taken = new Set<TAttachment>();
  (content ?? []).forEach((part, index) => {
    const toolCall = toolCallOf(part);
    if (!toolCall?.id) {
      return;
    }
    const calls = collectNestedCalls(toolCall.subagent_content);
    calls.push(...(toolCall.subagentAttachmentCalls ?? []), ...(live.get(index) ?? []));
    if (calls.length === 0) {
      return;
    }
    for (const attachment of unclaimed) {
      if (taken.has(attachment) || !calls.some((call) => ownsAttachment(call, attachment))) {
        continue;
      }
      taken.add(attachment);
      const files = assigned.get(part) ?? [];
      files.push(attachment);
      assigned.set(part, files);
    }
  });
  return assigned.size > 0 ? assigned : NO_NESTED;
}

/**
 * Child tool calls of each subagent call in `content` that is still streaming,
 * keyed by the call's index in `content`. Until the run is saved those calls
 * exist only in the live progress atom. The atom yields a signature string so
 * the caller re-renders when a child call appears, not on every delta. Only the
 * message that is streaming reads progress (`enabled`), and each member it
 * reads is retained like a card's, so one no update ever reached is freed on
 * unmount. Calls already seen are kept while the invocation streams, since the
 * bounded live activity evicts early parts before the transcript is saved.
 */
export function useLiveSubagentToolCalls(
  content: ReadonlyArray<NestedPart> | undefined,
  messageId: string,
  contentIndices: ReadonlyArray<number> | undefined,
  contentIndexOffset: number,
  enabled: boolean,
): ReadonlyMap<number, NestedCall[]> {
  const keys = useMemo(() => {
    const entries: Array<[number, string]> = [];
    if (!enabled) {
      return entries;
    }
    (content ?? []).forEach((part, index) => {
      const toolCall = toolCallOf(part);
      if (toolCall?.id && toolCall.name === Constants.SUBAGENT) {
        entries.push([
          index,
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
  const store = useStore();
  useEffect(() => {
    const releases = keys.map(([, key]) => retainSubagentProgress(store, key));
    return () => releases.forEach((release) => release());
  }, [keys, store]);
  const signatureAtom = useMemo(
    () =>
      atom((get) => {
        const live: Array<[string, NestedCall[]]> = [];
        for (const [, key] of keys) {
          const calls = collectNestedCalls(get(subagentProgressByToolCallId(key))?.contentParts);
          if (calls.length > 0) {
            live.push([key, calls]);
          }
        }
        return live.length === 0 ? '' : JSON.stringify(live);
      }),
    [keys],
  );
  const signature = useAtomValue(signatureAtom);
  const seenCalls = useRef(new Map<string, Map<string, NestedCall>>());
  return useMemo(() => {
    const current = new Map<string, NestedCall[]>(
      signature === '' ? [] : (JSON.parse(signature) as Array<[string, NestedCall[]]>),
    );
    const seen = seenCalls.current;
    const active = new Set(keys.map(([, key]) => key));
    for (const key of seen.keys()) {
      if (!active.has(key)) {
        seen.delete(key);
      }
    }
    const live = new Map<number, NestedCall[]>();
    for (const [index, key] of keys) {
      const calls = seen.get(key) ?? new Map<string, NestedCall>();
      for (const call of current.get(key) ?? []) {
        calls.set([call.id, call.agentId ?? '', call.stepId ?? ''].join('\u0000'), call);
      }
      if (calls.size > 0) {
        seen.set(key, calls);
        live.set(index, [...calls.values()]);
      }
    }
    return live.size > 0 ? live : NO_LIVE_CALLS;
  }, [signature, keys]);
}
