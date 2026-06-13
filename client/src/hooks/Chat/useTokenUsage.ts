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
} from '~/store/usage';
import { useLatestMessageId } from '~/hooks/Messages/useLatestMessage';
import { buildIndex, sumBranch, clearIndex } from '~/utils';
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
    setBranchTotals(sumBranch(conversationKey, tailId, anchorId));
  }, [conversationKey, tailId, anchorId, setBranchTotals]);

  return useMemo(() => {
    const snapshotActive =
      snapshot != null &&
      (isSubmitting || snapshot.anchorMessageId == null || branchTotals.containsAnchor);

    if (snapshotActive && snapshot) {
      const breakdown = snapshot.breakdown;
      const maxTokens = snapshot.contextBudget ?? breakdown.maxContextTokens;
      const instructionTokens = snapshot.effectiveInstructionTokens ?? breakdown.instructionTokens;
      const baseUsed =
        snapshot.remainingContextTokens != null
          ? maxTokens - snapshot.remainingContextTokens
          : instructionTokens + breakdown.messageTokens;
      /** The snapshot is pre-invoke: in-flight output rides on `liveTokens`,
       *  and the last call's finalized output on `completedOutputTokens` */
      const usedTokens = Math.max(0, baseUsed) + liveTokens + (snapshot.completedOutputTokens ?? 0);
      return {
        usedTokens,
        maxTokens,
        percent: maxTokens > 0 ? Math.min((usedTokens / maxTokens) * 100, 100) : 0,
        isEstimate: false,
        snapshot,
        snapshotActive,
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
      snapshot,
      snapshotActive: false,
      branchTotals,
      usageTotals,
      liveTokens,
      rates: limits.rates,
      costUSD,
    };
  }, [snapshot, isSubmitting, branchTotals, usageTotals, liveTokens, limits, costUSD]);
}
