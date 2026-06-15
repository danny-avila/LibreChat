import { useEffect, useMemo, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys } from 'librechat-data-provider';
import type { TMessage, TConversation, TModelTokenomics } from 'librechat-data-provider';
import type { BranchTotals, BranchUsage } from '~/utils/tokens';
import type { ContextSnapshot } from '~/store/usage';
import {
  liveTokensFamily,
  totalUsageFamily,
  removeUsageAtoms,
  hydrateSnapshots,
  pendingUsageFamily,
  branchTotalsFamily,
  contextSnapshotFamily,
  snapshotsByAnchorFamily,
} from '~/store/usage';
import {
  buildIndex,
  sumBranch,
  clearIndex,
  mergeUsage,
  sumTotalUsage,
  findBranchSnapshotAnchor,
} from '~/utils';
import { useLatestMessageId } from '~/hooks/Messages/useLatestMessage';
import useTokenLimits from './useTokenLimits';

export interface TokenUsageParams {
  index: number;
  conversation: TConversation | null;
  isSubmitting: boolean;
}

export interface TokenUsageView {
  usedTokens: number;
  maxTokens?: number;
  /** 0–100, clamped; 0 when max is unknown */
  percent: number;
  /** True when derived from per-message counts instead of a backend snapshot */
  isEstimate: boolean;
  snapshot: ContextSnapshot | null;
  snapshotActive: boolean;
  branchTotals: BranchTotals;
  /** Provider usage along the active branch (matches the gauge), incl. in-flight */
  branchUsage: BranchUsage;
  /** Provider usage across all branches of the conversation */
  totalUsage: BranchUsage;
  /** Whether any usage is available to display (branch has token usage) */
  hasUsage: boolean;
  /** Authoritative branch cost; the cost row is gated on `interface.contextCost` at render */
  branchCost: number;
  /** Authoritative cost across all branches (shown when it differs from branch) */
  totalCost: number;
  liveTokens: number;
  rates?: TModelTokenomics;
}

/**
 * View-model for the context usage indicator. Mount only inside the
 * indicator so its subscriptions never re-render the chat tree.
 */
export default function useTokenUsage({
  index,
  conversation,
  isSubmitting,
}: TokenUsageParams): TokenUsageView {
  const queryClient = useQueryClient();
  const conversationKey = conversation?.conversationId ?? Constants.NEW_CONVO;

  const tailId = useLatestMessageId(index);
  const snapshot = useAtomValue(contextSnapshotFamily(conversationKey));
  const snapshotsByAnchor = useAtomValue(snapshotsByAnchorFamily(conversationKey));
  const pendingUsage = useAtomValue(pendingUsageFamily(conversationKey));
  const totalUsageBase = useAtomValue(totalUsageFamily(conversationKey));
  const branchTotals = useAtomValue(branchTotalsFamily(conversationKey));
  const liveTokens = useAtomValue(liveTokensFamily(conversationKey));
  const setBranchTotals = useSetAtom(branchTotalsFamily(conversationKey));
  const setTotalUsage = useSetAtom(totalUsageFamily(conversationKey));
  const limits = useTokenLimits(conversation);

  /** Branch/total provider usage is index-derived; the in-flight response is
   *  the only live add (the pending holder), counted into both — it sits on the
   *  active branch tail and inside the conversation. The backend prices each
   *  call (premium tiers, cache rates), so cost sums authoritatively. */
  const pendingAsUsage: BranchUsage = useMemo(
    () => ({
      input: pendingUsage.input,
      output: pendingUsage.output,
      cacheWrite: pendingUsage.cacheWrite,
      cacheRead: pendingUsage.cacheRead,
      cost: pendingUsage.costUSD,
      costKnown: pendingUsage.costKnown,
    }),
    [pendingUsage],
  );
  const branchUsage = useMemo(
    () => mergeUsage(branchTotals.usage, pendingAsUsage),
    [branchTotals.usage, pendingAsUsage],
  );
  const totalUsage = useMemo(
    () => mergeUsage(totalUsageBase, pendingAsUsage),
    [totalUsageBase, pendingAsUsage],
  );
  const hasUsage =
    branchUsage.input + branchUsage.output + branchUsage.cacheRead + branchUsage.cacheWrite > 0;

  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;
  const tailIdRef = useRef(tailId);
  tailIdRef.current = tailId;
  const anchorId = snapshot?.anchorMessageId ?? null;
  const anchorIdRef = useRef(anchorId);
  anchorIdRef.current = anchorId;

  useEffect(() => {
    /** Cache `updated` events fire on every state transition — rebuild the
     *  O(n) index only when the data snapshot reference actually changed */
    let lastIndexed: TMessage[] | undefined;
    const rebuild = (messages?: TMessage[]) => {
      if (messages === lastIndexed && messages !== undefined) {
        return;
      }
      lastIndexed = messages;
      buildIndex(conversationKey, messages);
      /** Restore each branch's persisted breakdown (Part A) without clobbering
       *  a live finalized snapshot for the same response id. */
      hydrateSnapshots(conversationKey, messages);
      setBranchTotals(sumBranch(conversationKey, tailIdRef.current, anchorIdRef.current));
      setTotalUsage(sumTotalUsage(conversationKey));
    };

    rebuild(queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversationKey]));

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (isSubmittingRef.current || event.type !== 'updated') {
        return;
      }
      const queryKey = event.query.queryKey;
      if (
        !Array.isArray(queryKey) ||
        queryKey[0] !== QueryKeys.messages ||
        queryKey[1] !== conversationKey
      ) {
        return;
      }
      rebuild(event.query.state.data as TMessage[] | undefined);
    });
    return () => {
      unsubscribe();
      /** Bound memory to open conversations — drop this one's token index and
       *  usage atoms on switch/unmount; both rebuild from the query cache on
       *  return. NEW_CONVO is migrated to its real id by finalizeUsage, so
       *  leave it alone to avoid racing that handoff. */
      if (conversationKey !== Constants.NEW_CONVO) {
        clearIndex(conversationKey);
        removeUsageAtoms(conversationKey);
      }
    };
  }, [conversationKey, queryClient, setBranchTotals, setTotalUsage]);

  useEffect(() => {
    /** Re-index from the cache on every tail change (created/finalize during a
     *  stream AND branch switches). Branch switches don't fire a cache `updated`
     *  event, so the subscriber below can't catch them; without rebuilding here
     *  the index stays on whatever the last stream left it — which may have
     *  dropped the now-viewed branch's response, so sumBranch would find no
     *  tokens/usage and the gauge + branch cost would blank out. Bounded: tailId
     *  only shifts on created/finalize/branch-switch, never per chunk. Usage for
     *  responses whose cache message lacks `metadata.usage` is restored from the
     *  sticky history inside buildIndex. */
    buildIndex(
      conversationKey,
      queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversationKey]),
    );
    setBranchTotals(sumBranch(conversationKey, tailId, anchorId));
    setTotalUsage(sumTotalUsage(conversationKey));
  }, [conversationKey, tailId, anchorId, setBranchTotals, setTotalUsage, queryClient]);

  return useMemo(() => {
    /** The granular snapshot is for one specific generation. Show the live one
     *  while streaming, or when its (response-message) anchor is on the viewed
     *  branch. A null-anchor snapshot must NOT match every branch — that leaked
     *  one branch's breakdown onto its siblings. */
    const currentActive =
      snapshot != null &&
      (isSubmitting || (snapshot.anchorMessageId != null && branchTotals.containsAnchor));

    /** When the live snapshot belongs to another branch, recover this branch's
     *  own finalized snapshot (if it was generated this session) by walking the
     *  branch for its deepest stored anchor — keeps the granular rows on switch
     *  instead of dropping to coarse totals. */
    let activeSnapshot: ContextSnapshot | null = currentActive ? snapshot : null;
    if (activeSnapshot == null && !isSubmitting && snapshotsByAnchor.size > 0) {
      const anchor = findBranchSnapshotAnchor(
        conversationKey,
        branchTotals.tailId,
        snapshotsByAnchor,
      );
      activeSnapshot = anchor != null ? (snapshotsByAnchor.get(anchor) ?? null) : null;
    }

    if (activeSnapshot != null) {
      const breakdown = activeSnapshot.breakdown;
      const maxTokens = activeSnapshot.contextBudget ?? breakdown.maxContextTokens;
      const instructionTokens =
        activeSnapshot.effectiveInstructionTokens ?? breakdown.instructionTokens;
      const baseUsed =
        activeSnapshot.remainingContextTokens != null
          ? maxTokens - activeSnapshot.remainingContextTokens
          : instructionTokens + breakdown.messageTokens;
      /** The snapshot is pre-invoke: in-flight output rides on `liveTokens`
       *  (0 unless streaming this branch), the last call's finalized output on
       *  `completedOutputTokens`. */
      const usedTokens =
        Math.max(0, baseUsed) + liveTokens + (activeSnapshot.completedOutputTokens ?? 0);
      return {
        usedTokens,
        maxTokens,
        percent: maxTokens > 0 ? Math.min((usedTokens / maxTokens) * 100, 100) : 0,
        isEstimate: false,
        snapshot: activeSnapshot,
        snapshotActive: true,
        branchTotals,
        branchUsage,
        totalUsage,
        hasUsage,
        branchCost: branchUsage.cost,
        totalCost: totalUsage.cost,
        liveTokens,
        rates: limits.rates,
      };
    }

    /** `summaryBaseline` is the compacted-context size from the deepest
     *  summarized response on the branch (0 if none). The branch walk stops
     *  there, so input/output are post-summary only — adding the baseline keeps
     *  the estimate from re-summing the discarded pre-summary history (which
     *  otherwise pins the gauge at 100% forever after a compaction). */
    const usedTokens =
      branchTotals.input + branchTotals.output + branchTotals.summaryBaseline + liveTokens;
    const maxTokens = limits.maxContextTokens;
    return {
      usedTokens,
      maxTokens,
      percent:
        maxTokens != null && maxTokens > 0 ? Math.min((usedTokens / maxTokens) * 100, 100) : 0,
      isEstimate: true,
      snapshot: null,
      snapshotActive: false,
      branchTotals,
      branchUsage,
      totalUsage,
      hasUsage,
      branchCost: branchUsage.cost,
      totalCost: totalUsage.cost,
      liveTokens,
      rates: limits.rates,
    };
  }, [
    snapshot,
    isSubmitting,
    branchTotals,
    branchUsage,
    totalUsage,
    hasUsage,
    liveTokens,
    limits,
    snapshotsByAnchor,
    conversationKey,
  ]);
}
