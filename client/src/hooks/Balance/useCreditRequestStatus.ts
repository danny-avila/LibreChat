import { useEffect } from 'react';
import { useToastContext } from '@librechat/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  QueryKeys,
  MutationKeys,
  dataService,
  getRefillEligibilityDate,
} from 'librechat-data-provider';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

const MAX_SCHEDULE_DELAY_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000];

/**
 * Single source of truth for "does the current user have a pending
 * request for more credits" — shared by the Settings button and the
 * out-of-credit chat banner so submitting from one is immediately
 * reflected in the other.
 */
export default function useCreditRequestStatus(): {
  /** Whether the balance feature is on for this deployment at all — callers
   * that gate visibility on running out of credit (e.g. the chat banner)
   * must check this, since `tokenCredits` defaults to 0 whether balance is
   * genuinely zero, disabled, or just not loaded yet, and those are not the
   * same thing. */
  enabled: boolean;
  /** True until the balance query has actually resolved (or the feature is
   * disabled/the user isn't authenticated, in which case it never will) —
   * distinguishes "still finding out" from "confirmed zero." */
  isLoading: boolean;
  tokenCredits: number;
  /** The user's configured auto-refill allocation size, if any — present
   *  independent of whether auto-refill itself is on, used for a "running
   *  low" threshold relative to it. */
  refillAmount: number | undefined;
  /** When auto-refill is on and enough data is present to compute it, the
   *  next moment this user becomes eligible for an automatic refill. */
  nextRefillAt: Date | undefined;
  pendingCreditRequest:
    | { requestId: string; requestedAt: Date | string; reason?: string }
    | undefined;
  submit: (reason?: string) => void;
  isSubmitting: boolean;
} {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();

  const enabled = !!isAuthenticated && !!startupConfig?.balance?.enabled;
  const balanceQuery = useGetUserBalance({ enabled });

  const balanceData = balanceQuery.data;
  const tokenCredits = balanceData?.tokenCredits ?? 0;
  const refillMode = balanceData?.refillMode ?? 'add';
  const nextRefillAt =
    balanceData?.autoRefillEnabled &&
    balanceData.lastRefill != null &&
    balanceData.refillIntervalValue != null &&
    balanceData.refillIntervalUnit != null
      ? getRefillEligibilityDate(
          new Date(balanceData.lastRefill),
          balanceData.refillIntervalValue,
          balanceData.refillIntervalUnit,
        )
      : undefined;
  const nextRefillTime = nextRefillAt?.getTime();

  useEffect(() => {
    if (nextRefillTime == null || (refillMode !== 'reset' && tokenCredits > 0)) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    let retryAttempt = 0;
    let cancelled = false;
    const checkDeadline = () => {
      if (cancelled) {
        return;
      }
      const msRemaining = nextRefillTime - Date.now();
      if (msRemaining > 0) {
        timeoutId = setTimeout(checkDeadline, Math.min(msRemaining, MAX_SCHEDULE_DELAY_MS));
        return;
      }

      queryClient.invalidateQueries([QueryKeys.balance]);
      if (retryAttempt < RETRY_DELAYS_MS.length) {
        timeoutId = setTimeout(checkDeadline, RETRY_DELAYS_MS[retryAttempt]);
        retryAttempt += 1;
      }
    };

    checkDeadline();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [nextRefillTime, queryClient, refillMode, tokenCredits]);

  const mutation = useMutation([MutationKeys.requestCredits], {
    mutationFn: (reason?: string) => dataService.requestBalanceTopUp({ reason }),
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.balance]);
      showToast({
        message: localize('com_nav_balance_request_success_toast'),
        status: 'success',
      });
    },
    onError: () => {
      showToast({
        message: localize('com_nav_balance_request_error_toast'),
        status: 'error',
      });
    },
  });

  return {
    enabled,
    isLoading: enabled && balanceQuery.data == null,
    tokenCredits,
    refillAmount: balanceData?.refillAmount,
    nextRefillAt,
    pendingCreditRequest: balanceQuery.data?.pendingCreditRequest,
    submit: (reason?: string) => mutation.mutate(reason),
    isSubmitting: mutation.isLoading,
  };
}
