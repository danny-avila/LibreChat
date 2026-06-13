import { useRef, useMemo } from 'react';
import { getDefaultStore } from 'jotai';
import { Constants } from 'librechat-data-provider';
import type {
  TMessage,
  TConversation,
  TTokenUsageEvent,
  TContextUsageEvent,
} from 'librechat-data-provider';
import {
  markUsageFolded,
  liveTokensFamily,
  removeUsageAtoms,
  calibrationFamily,
  usageTotalsFamily,
  branchTotalsFamily,
  migrateUsageFolded,
  contextSnapshotFamily,
} from '~/store/usage';
import {
  sumBranch,
  upsertEntries,
  migrateIndex,
  estimateTokens,
  normalizeUsageUnits,
} from '~/utils';

const FLUSH_INTERVAL_MS = 250;

interface UsageSubmissionLike {
  userMessage?: Pick<TMessage, 'messageId'> | null;
  conversation?: Partial<Pick<TConversation, 'conversationId' | 'endpoint' | 'model'>> | null;
}

interface FinalDataLike {
  requestMessage?: Partial<TMessage> | null;
  responseMessage?: Partial<TMessage> | null;
  conversation?: Partial<TConversation> | null;
}

export interface UsageHandlers {
  contextHandler: (data: TContextUsageEvent, submission: UsageSubmissionLike) => void;
  usageHandler: (data: TTokenUsageEvent, submission: UsageSubmissionLike) => void;
  tapStream: (data: { delta?: { content?: unknown } }, submission: UsageSubmissionLike) => void;
  /** Live estimate for the legacy content path, which streams cumulative
   *  (not incremental) text per part — sets rather than accumulates */
  tapContent: (text: unknown, submission: UsageSubmissionLike) => void;
  finalizeUsage: (data: FinalDataLike, submission: UsageSubmissionLike) => void;
  resetLive: (submission: UsageSubmissionLike) => void;
  /** Idempotently folds the resumed run's collected usage into the totals */
  backfillUsage: (entries: TTokenUsageEvent[], submission: UsageSubmissionLike) => void;
  /** Seeds the live estimate from already-streamed output chars on resume */
  seedLive: (chars: number, submission: UsageSubmissionLike) => void;
}

function getConvoKey(submission: UsageSubmissionLike): string {
  return submission.conversation?.conversationId ?? Constants.NEW_CONVO;
}

/** Cumulative text of a content-path part: a raw string or a `{ value }` part */
function extractContentText(text: unknown): string {
  if (typeof text === 'string') {
    return text;
  }
  const value = (text as { value?: unknown })?.value;
  return typeof value === 'string' ? value : '';
}

function countDeltaChars(content: unknown): number {
  const parts = Array.isArray(content) ? content : [content];
  let chars = 0;
  for (const part of parts) {
    if (part == null || typeof part !== 'object') {
      continue;
    }
    const { text, think } = part as { text?: unknown; think?: unknown };
    if (typeof text === 'string') {
      chars += text.length;
    } else if (typeof think === 'string') {
      chars += think.length;
    }
  }
  return chars;
}

/**
 * Imperative writers for the per-conversation token usage atoms, driven by
 * SSE events. All state lives in refs/atoms — the returned handlers are
 * stable and never cause re-renders themselves.
 */
export default function useUsageHandler(): UsageHandlers {
  /** Streamed chars since the last snapshot or model end (current call only) */
  const streamCharsRef = useRef(0);
  /** Provider-confirmed output tokens since the last snapshot (current run) */
  const confirmedRef = useRef(0);
  const lastFlushRef = useRef(0);

  return useMemo<UsageHandlers>(() => {
    const jotai = getDefaultStore();

    const setLive = (convoKey: string, value: number) => {
      jotai.set(liveTokensFamily(convoKey), value);
    };

    const contextHandler: UsageHandlers['contextHandler'] = (data, submission) => {
      const convoKey = getConvoKey(submission);
      jotai.set(contextSnapshotFamily(convoKey), {
        ...data,
        anchorMessageId: submission.userMessage?.messageId ?? null,
      });
      if (data.calibrationRatio != null && data.calibrationRatio > 0) {
        jotai.set(calibrationFamily(convoKey), data.calibrationRatio);
      }
      streamCharsRef.current = 0;
      confirmedRef.current = 0;
      setLive(convoKey, 0);
    };

    /** Folds one usage event into the totals exactly once per conversation.
     *  Returns false when the event was already counted (live then replayed
     *  on resume), so callers can skip the live-estimate bump too. */
    const foldUsage = (data: TTokenUsageEvent, submission: UsageSubmissionLike): boolean => {
      const convoKey = getConvoKey(submission);
      /** runId+seq is unique per model call; fall back to the payload when a
       *  source predates the sequence tag */
      const usageKey =
        data.runId != null && data.seq != null ? `${data.runId}:${data.seq}` : JSON.stringify(data);
      if (!markUsageFolded(convoKey, usageKey)) {
        return false;
      }

      const endpoint = submission.conversation?.endpoint ?? '';
      const model = data.model ?? submission.conversation?.model ?? '';
      const units = normalizeUsageUnits(data);
      /** Cost is priced at render from these buckets — never baked in here,
       *  so events arriving before the token config load still get priced */
      const bucketKey = `${data.provider ?? ''}|${endpoint}|${model}`;

      const totalsAtom = usageTotalsFamily(convoKey);
      const prev = jotai.get(totalsAtom);
      const bucket = prev.byRate[bucketKey];
      /** Display the same normalized units that drive billing: input is the
       *  uncached portion, output includes repaired completion tokens */
      jotai.set(totalsAtom, {
        input: prev.input + units.input,
        output: prev.output + units.output,
        cacheWrite: prev.cacheWrite + units.cacheWrite,
        cacheRead: prev.cacheRead + units.cacheRead,
        eventCount: prev.eventCount + 1,
        byRate: {
          ...prev.byRate,
          [bucketKey]: bucket
            ? {
                ...bucket,
                input: bucket.input + units.input,
                output: bucket.output + units.output,
                cacheWrite: bucket.cacheWrite + units.cacheWrite,
                cacheRead: bucket.cacheRead + units.cacheRead,
              }
            : { provider: data.provider, endpoint, model, ...units },
        },
      });
      return true;
    };

    const usageHandler: UsageHandlers['usageHandler'] = (data, submission) => {
      const folded = foldUsage(data, submission);

      /** Only primary-call usage drives the live context estimate; tagged
       *  buckets (summarization, subagent) fold into totals/cost only. Skip
       *  the bump for an already-counted event replayed on resume. */
      if (!folded || data.usage_type != null) {
        return;
      }
      /** Use the repaired completion count (not raw output_tokens) so the
       *  snapshot gauge keeps the full response for under-reporting providers */
      confirmedRef.current += normalizeUsageUnits(data).output;
      streamCharsRef.current = 0;
      setLive(getConvoKey(submission), confirmedRef.current);
    };

    const tapStream: UsageHandlers['tapStream'] = (data, submission) => {
      const chars = countDeltaChars(data?.delta?.content);
      if (chars <= 0) {
        return;
      }
      streamCharsRef.current += chars;
      const now = Date.now();
      if (now - lastFlushRef.current < FLUSH_INTERVAL_MS) {
        return;
      }
      lastFlushRef.current = now;
      const convoKey = getConvoKey(submission);
      const ratio = jotai.get(calibrationFamily(convoKey));
      setLive(convoKey, confirmedRef.current + estimateTokens(streamCharsRef.current, ratio));
    };

    const tapContent: UsageHandlers['tapContent'] = (text, submission) => {
      const value = extractContentText(text);
      if (value.length === 0) {
        return;
      }
      /** Cumulative per part — replace the running char count, don't add */
      streamCharsRef.current = value.length;
      const now = Date.now();
      if (now - lastFlushRef.current < FLUSH_INTERVAL_MS) {
        return;
      }
      lastFlushRef.current = now;
      const convoKey = getConvoKey(submission);
      const ratio = jotai.get(calibrationFamily(convoKey));
      setLive(convoKey, confirmedRef.current + estimateTokens(streamCharsRef.current, ratio));
    };

    const resetLive: UsageHandlers['resetLive'] = (submission) => {
      streamCharsRef.current = 0;
      confirmedRef.current = 0;
      setLive(getConvoKey(submission), 0);
    };

    const backfillUsage: UsageHandlers['backfillUsage'] = (entries, submission) => {
      /** Fold the resumed run's persisted events idempotently — never reset
       *  the conversation totals, or a reconnect mid-stream would drop the
       *  usage of prompts already completed earlier in the session */
      for (const entry of entries) {
        foldUsage(entry, submission);
      }
    };

    const seedLive: UsageHandlers['seedLive'] = (chars, submission) => {
      if (chars <= 0) {
        return;
      }
      const convoKey = getConvoKey(submission);
      streamCharsRef.current = chars;
      confirmedRef.current = 0;
      setLive(convoKey, estimateTokens(chars, jotai.get(calibrationFamily(convoKey))));
    };

    const finalizeUsage: UsageHandlers['finalizeUsage'] = (data, submission) => {
      const fromKey = getConvoKey(submission);
      const realId = data.conversation?.conversationId ?? fromKey;
      /** From the refs, not the atom — the throttle may not have flushed */
      const liveAtFinalize =
        confirmedRef.current +
        estimateTokens(streamCharsRef.current, jotai.get(calibrationFamily(fromKey)));

      upsertEntries(fromKey, [data.requestMessage, data.responseMessage]);

      if (realId !== fromKey) {
        migrateIndex(fromKey, realId);
        migrateUsageFolded(fromKey, realId);
        jotai.set(contextSnapshotFamily(realId), jotai.get(contextSnapshotFamily(fromKey)));
        jotai.set(usageTotalsFamily(realId), jotai.get(usageTotalsFamily(fromKey)));
        jotai.set(calibrationFamily(realId), jotai.get(calibrationFamily(fromKey)));
        removeUsageAtoms(fromKey);
      }

      const responseMeta = data.responseMessage?.contextMeta;
      if (responseMeta?.calibrationRatio != null && responseMeta.calibrationRatio > 0) {
        jotai.set(calibrationFamily(realId), responseMeta.calibrationRatio);
      }

      const tailId = data.responseMessage?.messageId ?? data.requestMessage?.messageId ?? null;
      const anchorId = submission.userMessage?.messageId ?? null;
      if (tailId) {
        jotai.set(branchTotalsFamily(realId), sumBranch(realId, tailId, anchorId));
      }

      /** The snapshot was taken pre-invoke — carry the output streamed since
       *  then so the gauge keeps the final response after live resets */
      const snapshotAtom = contextSnapshotFamily(realId);
      const snapshot = jotai.get(snapshotAtom);
      if (snapshot != null && liveAtFinalize > 0 && snapshot.anchorMessageId === anchorId) {
        jotai.set(snapshotAtom, { ...snapshot, completedOutputTokens: liveAtFinalize });
      }

      streamCharsRef.current = 0;
      confirmedRef.current = 0;
      setLive(realId, 0);
    };

    return {
      contextHandler,
      usageHandler,
      tapStream,
      tapContent,
      finalizeUsage,
      resetLive,
      backfillUsage,
      seedLive,
    };
  }, []);
}
