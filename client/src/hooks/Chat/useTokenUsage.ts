import { useEffect, useMemo, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys } from 'librechat-data-provider';
import type { TMessage, TConversation, TModelTokenomics } from 'librechat-data-provider';
import type { ContextSnapshot, UsageTotals } from '~/store/usage';
import type { BranchTotals } from '~/utils/tokens';
import {
  liveTokensFamily,
  removeUsageAtoms,
  usageTotalsFamily,
  branchTotalsFamily,
  contextSnapshotFamily,
  snapshotsByAnchorFamily,
} from '~/store/usage';
import { buildIndex, sumBranch, clearIndex, findBranchSnapshotAnchor } from '~/utils';
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
  usageTotals: UsageTotals;
  liveTokens: number;
  rates?: TModelTokenomics;
  /** Session cost from provider-reported usage; undefined until usage events arrive */
  costUSD?: number;
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
  const usageTotals = useAtomValue(usageTotalsFamily(conversationKey));
  const branchTotals = useAtomValue(branchTotalsFamily(conversationKey));
  const liveTokens = useAtomValue(liveTokensFamily(conversationKey));
  const setBranchTotals = useSetAtom(branchTotalsFamily(conversationKey));
  const limits = useTokenLimits(conversation);

  /** Authoritative session cost: the backend prices each call (premium tiers,
   *  cache rates) and emits it on the usage event; we just sum. Undefined
   *  until usage events arrive — the cost row is additionally gated on
   *  `interface.contextCost`, under which the backend actually emits cost. */
  const costUSD = usageTotals.eventCount > 0 ? usageTotals.costUSD : undefined;

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
      setBranchTotals(sumBranch(conversationKey, tailIdRef.current, anchorIdRef.current));
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
  }, [conversationKey, queryClient, setBranchTotals]);

  useEffect(() => {
    /** The cache subscriber is muted during streaming to avoid per-chunk O(n)
     *  rebuilds, but the `created` event still moves the tail to the new
     *  response message. Without a snapshot (non-agent streams, or a lib that
     *  predates on_context_usage) sumBranch would miss that tail in the stale
     *  index and drop history + prompt. Re-index from the cache on tail change
     *  while submitting — bounded, since tailId only shifts on
     *  created/finalize/branch-switch, never per chunk. */
    if (isSubmittingRef.current) {
      buildIndex(
        conversationKey,
        queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversationKey]),
      );
    }
    setBranchTotals(sumBranch(conversationKey, tailId, anchorId));
  }, [conversationKey, tailId, anchorId, setBranchTotals, queryClient]);

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
        usageTotals,
        liveTokens,
        rates: limits.rates,
        costUSD,
      };
    }

    const usedTokens = branchTotals.input + branchTotals.output + liveTokens;
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
      usageTotals,
      liveTokens,
      rates: limits.rates,
      costUSD,
    };
  }, [
    snapshot,
    isSubmitting,
    branchTotals,
    usageTotals,
    liveTokens,
    limits,
    costUSD,
    snapshotsByAnchor,
    conversationKey,
  ]);
}
