import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { TContextUsageEvent } from 'librechat-data-provider';
import type { BranchTotals } from '~/utils/tokens';
import { EMPTY_BRANCH } from '~/utils/tokens';

/** Latest backend context snapshot, anchored to the run's user message for staleness checks */
export interface ContextSnapshot extends TContextUsageEvent {
  anchorMessageId: string | null;
  /** Output tokens finalized after this pre-call snapshot (the last call's response) */
  completedOutputTokens?: number;
}

/** Cumulative provider-reported usage for the conversation's current session */
export interface UsageTotals {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  eventCount: number;
  /** Summed authoritative per-event cost from the backend (premium tiers,
   *  cache rates). Populated only when `interface.contextCost` is enabled. */
  costUSD: number;
}

export const EMPTY_USAGE_TOTALS: UsageTotals = {
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
  eventCount: 0,
  costUSD: 0,
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

/**
 * Per-conversation set of usage-event identities already folded into the
 * totals. Lets the live path and resume backfill fold each model call exactly
 * once, so reconnect mid-stream preserves earlier prompts' usage instead of
 * resetting the session totals.
 */
const foldedUsageKeys = new Map<string, Set<string>>();

/** Records an event identity; returns false if it was already folded. */
export function markUsageFolded(conversationId: string, key: string): boolean {
  let seen = foldedUsageKeys.get(conversationId);
  if (seen == null) {
    seen = new Set<string>();
    foldedUsageKeys.set(conversationId, seen);
  }
  if (seen.has(key)) {
    return false;
  }
  seen.add(key);
  return true;
}

/** Moves folded-key tracking from a temporary convo id to the persisted one. */
export function migrateUsageFolded(fromId: string, toId: string): void {
  const seen = foldedUsageKeys.get(fromId);
  if (seen == null) {
    return;
  }
  const target = foldedUsageKeys.get(toId) ?? new Set<string>();
  for (const key of seen) {
    target.add(key);
  }
  foldedUsageKeys.set(toId, target);
  foldedUsageKeys.delete(fromId);
}

/** Jotai atomFamily entries are never GC'd — call on conversation switch/cleanup */
export function removeUsageAtoms(conversationId: string): void {
  branchTotalsFamily.remove(conversationId);
  contextSnapshotFamily.remove(conversationId);
  usageTotalsFamily.remove(conversationId);
  liveTokensFamily.remove(conversationId);
  calibrationFamily.remove(conversationId);
  foldedUsageKeys.delete(conversationId);
}
