import { useEffect, useMemo, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys } from 'librechat-data-provider';
import type { TMessage, TConversation, TModelTokenomics } from 'librechat-data-provider';
import type { ContextSnapshot, UsageTotals } from '~/store/usage';
import type { BranchTotals } from '~/utils/tokens';
import {
  liveTokensFamily,
  usageTotalsFamily,
  branchTotalsFamily,
  contextSnapshotFamily,
} from '~/store/usage';
import { useLatestMessageId } from '~/hooks/Messages/useLatestMessage';
import { buildIndex, sumBranch, costFromUnits } from '~/utils';
import { useTokenConfigQuery } from '~/data-provider';
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
  const { data: tokenConfig } = useTokenConfigQuery();

  /** Priced at render so events folded before the token-config load still count */
  const costUSD = useMemo(() => {
    if (usageTotals.eventCount === 0) {
      return undefined;
    }
    let total = 0;
    for (const bucket of Object.values(usageTotals.byRate)) {
      /** Resolution order, most to least specific:
       *  1. the usage event's own endpoint (a custom endpoint pricing a known
       *     model name differently)
       *  2. the agent's resolved backing endpoint — an Agents conversation
       *     reports endpoint `agents` and adapter provider `openAI`, neither of
       *     which keys the custom endpoint's tokenConfig
       *  3. the adapter provider, as a last resort */
      const rates =
        tokenConfig?.[bucket.endpoint]?.[bucket.model] ??
        (limits.endpoint != null ? tokenConfig?.[limits.endpoint]?.[bucket.model] : undefined) ??
        (bucket.provider != null ? tokenConfig?.[bucket.provider]?.[bucket.model] : undefined);
      total += costFromUnits(bucket, rates);
    }
    return total;
  }, [usageTotals, tokenConfig, limits.endpoint]);

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
    return unsubscribe;
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
