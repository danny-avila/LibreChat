import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { TContextUsageEvent } from 'librechat-data-provider';
import type { BranchTotals } from '~/utils/tokens';
import { EMPTY_BRANCH } from '~/utils/tokens';

/** Latest backend context snapshot, anchored to the run's user message for staleness checks */
export interface ContextSnapshot extends TContextUsageEvent {
  anchorMessageId: string | null;
}

/** Cumulative provider-reported usage for the conversation's current session */
export interface UsageTotals {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  costUSD: number;
  eventCount: number;
}

export const EMPTY_USAGE_TOTALS: UsageTotals = {
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
  costUSD: 0,
  eventCount: 0,
};

/**
 * Split into small per-conversation atoms so high-frequency writes (live
 * stream estimates) re-render only the subscribers that draw them.
 */
export const branchTotalsFamily = atomFamily((_conversationId: string) =>
  atom<BranchTotals>(EMPTY_BRANCH),
);

export const contextSnapshotFamily = atomFamily((_conversationId: string) =>
  atom<ContextSnapshot | null>(null),
);

export const usageTotalsFamily = atomFamily((_conversationId: string) =>
  atom<UsageTotals>(EMPTY_USAGE_TOTALS),
);

/** Throttled in-flight output token estimate for the current model call */
export const liveTokensFamily = atomFamily((_conversationId: string) => atom<number>(0));

/** Last known provider-vs-estimate calibration ratio for the conversation */
export const calibrationFamily = atomFamily((_conversationId: string) => atom<number>(1));

/** Jotai atomFamily entries are never GC'd — call on conversation switch/cleanup */
export function removeUsageAtoms(conversationId: string): void {
  branchTotalsFamily.remove(conversationId);
  contextSnapshotFamily.remove(conversationId);
  usageTotalsFamily.remove(conversationId);
  liveTokensFamily.remove(conversationId);
  calibrationFamily.remove(conversationId);
}
