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
  EMPTY_USAGE_TOTALS,
  liveTokensFamily,
  calibrationFamily,
  usageTotalsFamily,
  branchTotalsFamily,
  removeUsageAtoms,
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
  finalizeUsage: (data: FinalDataLike, submission: UsageSubmissionLike) => void;
  resetLive: (submission: UsageSubmissionLike) => void;
  /** Replaces accumulated totals with the run's collected usage on resume */
  backfillUsage: (entries: TTokenUsageEvent[], submission: UsageSubmissionLike) => void;
  /** Seeds the live estimate from already-streamed output chars on resume */
  seedLive: (chars: number, submission: UsageSubmissionLike) => void;
}

function getConvoKey(submission: UsageSubmissionLike): string {
  return submission.conversation?.conversationId ?? Constants.NEW_CONVO;
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

    const foldUsage = (data: TTokenUsageEvent, submission: UsageSubmissionLike) => {
      const convoKey = getConvoKey(submission);
      const endpoint = submission.conversation?.endpoint ?? '';
      const model = data.model ?? submission.conversation?.model ?? '';
      const units = normalizeUsageUnits(data);
      /** Cost is priced at render from these buckets — never baked in here,
       *  so events arriving before the token config load still get priced */
      const bucketKey = `${data.provider ?? ''}|${endpoint}|${model}`;

      const totalsAtom = usageTotalsFamily(convoKey);
      const prev = jotai.get(totalsAtom);
      const bucket = prev.byRate[bucketKey];
      jotai.set(totalsAtom, {
        input: prev.input + (data.input_tokens ?? 0),
        output: prev.output + (data.output_tokens ?? 0),
        cacheWrite: prev.cacheWrite + (data.input_token_details?.cache_creation ?? 0),
        cacheRead: prev.cacheRead + (data.input_token_details?.cache_read ?? 0),
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
    };

    const usageHandler: UsageHandlers['usageHandler'] = (data, submission) => {
      foldUsage(data, submission);

      /** Only primary-call usage drives the live context estimate; tagged
       *  buckets (summarization, subagent) fold into totals/cost only */
      if (data.usage_type != null) {
        return;
      }
      confirmedRef.current += data.output_tokens ?? 0;
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

    const resetLive: UsageHandlers['resetLive'] = (submission) => {
      streamCharsRef.current = 0;
      confirmedRef.current = 0;
      setLive(getConvoKey(submission), 0);
    };

    const backfillUsage: UsageHandlers['backfillUsage'] = (entries, submission) => {
      jotai.set(usageTotalsFamily(getConvoKey(submission)), EMPTY_USAGE_TOTALS);
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
      finalizeUsage,
      resetLive,
      backfillUsage,
      seedLive,
    };
  }, []);
}
