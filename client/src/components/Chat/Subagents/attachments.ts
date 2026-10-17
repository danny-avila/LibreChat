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
 * The files each tool call part of the message owns through its subagent run,
 * keyed by the part. A tool run inside a subagent saves its files under the
 * child tool call id, which only appears inside the parent `subagent` call. The
 * message assigns them once, so every body it splits into reads one answer.
 */
export const SubagentAttachmentsContext =
  createContext<ReadonlyMap<NestedPart, TAttachment[]>>(NO_NESTED);

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

/**
 * The ownership rule top-level parts apply: a scope both sides carry must
 * agree. `exact` also requires the call to carry every scope the file does, so
 * a call whose scope is still unknown cannot take a file a scoped call owns.
 */
const ownsAttachment = (call: NestedCall, attachment: TAttachment, exact: boolean): boolean => {
  const { agentId, stepId } = attachment as { agentId?: string; stepId?: string };
  const agrees = (own: string | undefined, file: string | undefined) =>
    file == null || (own == null ? !exact : own === file);
  return (
    call.id === attachment.toolCallId &&
    agrees(call.agentId, agentId) &&
    agrees(call.stepId, stepId)
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
 * Hands each unclaimed attachment to one tool call part of the message whose
 * transcript (stored, previewed, or streaming in `live`, keyed by content
 * index) holds the tool call it was saved under. A part whose call matches the
 * file's full scope is preferred over one whose scope is still unknown; within
 * each pass the first part in message order wins, so a child id two subagents
 * share renders the file once. The map is keyed by the part itself, so two
 * calls sharing an id keep their own files.
 */
export function assignNestedAttachments(
  content: ReadonlyArray<NestedPart> | undefined,
  unclaimed: TAttachment[],
  live: ReadonlyMap<number, NestedCall[]>,
): ReadonlyMap<NestedPart, TAttachment[]> {
  if (unclaimed.length === 0) {
    return NO_NESTED;
  }
  const owners: Array<[NestedPart, NestedCall[]]> = [];
  (content ?? []).forEach((part, index) => {
    const toolCall = toolCallOf(part);
    if (!toolCall?.id) {
      return;
    }
    const calls = collectNestedCalls(toolCall.subagent_content);
    calls.push(...(toolCall.subagentAttachmentCalls ?? []), ...(live.get(index) ?? []));
    if (calls.length > 0) {
      owners.push([part, calls]);
    }
  });
  const assigned = new Map<NestedPart, TAttachment[]>();
  for (const attachment of unclaimed) {
    const owner =
      owners.find(([, calls]) => calls.some((call) => ownsAttachment(call, attachment, true))) ??
      owners.find(([, calls]) => calls.some((call) => ownsAttachment(call, attachment, false)));
    if (owner == null) {
      continue;
    }
    const files = assigned.get(owner[0]) ?? [];
    files.push(attachment);
    assigned.set(owner[0], files);
  }
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
  /** A string, so the keys (and the atom reading them) survive the content
   *  array changing on every streamed delta. */
  const keySignature = useMemo(() => {
    if (!enabled) {
      return '';
    }
    const entries: Array<[number, string]> = [];
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
    return entries.length === 0 ? '' : JSON.stringify(entries);
  }, [content, messageId, contentIndices, contentIndexOffset, enabled]);
  const keys = useMemo(
    () => (keySignature === '' ? [] : (JSON.parse(keySignature) as Array<[number, string]>)),
    [keySignature],
  );
  const store = useStore();
  /** Retained one key at a time: releasing a key that is still read would free
   *  the member under the atom subscribed to it. */
  const retained = useRef(new Map<string, () => void>());
  useEffect(() => {
    const next = new Set(keys.map(([, key]) => key));
    for (const [key, release] of retained.current) {
      if (!next.has(key)) {
        release();
        retained.current.delete(key);
      }
    }
    for (const key of next) {
      if (!retained.current.has(key)) {
        retained.current.set(key, retainSubagentProgress(store, key));
      }
    }
  }, [keys, store]);
  useEffect(() => {
    const held = retained.current;
    return () => {
      held.forEach((release) => release());
      held.clear();
    };
  }, []);
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
