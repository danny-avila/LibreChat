import { logger } from '@librechat/data-schemas';
import { getRefillEligibilityDate } from 'librechat-data-provider';
import type { RefillIntervalUnit } from 'librechat-data-provider';

export interface RefillRecord {
  tokenCredits: number;
  autoRefillEnabled?: boolean;
  refillAmount?: number;
  lastRefill?: Date;
  refillIntervalValue?: number;
  refillIntervalUnit?: RefillIntervalUnit;
}

export interface RefillDeps {
  createAutoRefillTransaction: (data: {
    user: string;
    tokenType: string;
    context: string;
    rawAmount: number;
  }) => Promise<{ balance: number } | undefined>;
}

export interface MaybeAutoRefillParams {
  user: string;
  record: RefillRecord;
  tokenCost?: number;
  deps: RefillDeps;
}

/**
 * Returns true when the record's lastRefill is missing/invalid or the refill
 * interval has elapsed.
 */
function isRefillEligible(record: RefillRecord): boolean {
  const lastRefillDate = new Date(record.lastRefill ?? 0);
  if (isNaN(lastRefillDate.getTime())) {
    return true;
  }
  const eligibilityDate = getRefillEligibilityDate(
    lastRefillDate,
    record.refillIntervalValue ?? 0,
    record.refillIntervalUnit ?? 'days',
  );
  return new Date() >= eligibilityDate;
}

/**
 * Applies an auto-refill if the record allows it, the projected balance after
 * `tokenCost` would be at or below zero, and the refill interval has elapsed.
 * Returns the (possibly refreshed) token credit total.
 */
export async function maybeAutoRefill({
  user,
  record,
  tokenCost = 0,
  deps,
}: MaybeAutoRefillParams): Promise<number> {
  const balance = record.tokenCredits;
  const refillable =
    record.autoRefillEnabled === true &&
    typeof record.refillAmount === 'number' &&
    record.refillAmount > 0;
  if (!refillable) {
    return balance;
  }
  if (balance - tokenCost > 0) {
    return balance;
  }
  if (!isRefillEligible(record)) {
    return balance;
  }

  try {
    const result = await deps.createAutoRefillTransaction({
      user,
      tokenType: 'credits',
      context: 'autoRefill',
      rawAmount: record.refillAmount as number,
    });
    if (result) {
      return result.balance;
    }
  } catch (error) {
    logger.error('[Balance.refill] Failed to record auto-refill transaction', error);
  }
  return balance;
}
