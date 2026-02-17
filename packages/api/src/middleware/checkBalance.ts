import { logger } from '@librechat/data-schemas';
import { ViolationTypes } from 'librechat-data-provider';
import type { ServerRequest } from '~/types/http';
import type { Response } from 'express';

type TimeUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

interface BalanceRecord {
  tokenCredits: number;
  autoRefillEnabled?: boolean;
  refillAmount?: number;
  lastRefill?: Date;
  refillIntervalValue?: number;
  refillIntervalUnit?: TimeUnit;
}

interface TxData {
  user: string;
  model?: string;
  endpoint?: string;
  valueKey?: string;
  tokenType?: string;
  amount: number;
  endpointTokenConfig?: unknown;
  generations?: unknown[];
}

export interface CheckBalanceDeps {
  findBalanceByUser: (user: string) => Promise<BalanceRecord | null>;
  getMultiplier: (params: Record<string, unknown>) => number;
  createAutoRefillTransaction: (
    data: Record<string, unknown>,
  ) => Promise<{ balance: number } | undefined>;
  logViolation: (
    req: unknown,
    res: unknown,
    type: string,
    errorMessage: Record<string, unknown>,
    score: number,
  ) => Promise<void>;
}

function addIntervalToDate(date: Date, value: number, unit: TimeUnit): Date {
  const result = new Date(date);
  switch (unit) {
    case 'seconds':
      result.setSeconds(result.getSeconds() + value);
      break;
    case 'minutes':
      result.setMinutes(result.getMinutes() + value);
      break;
    case 'hours':
      result.setHours(result.getHours() + value);
      break;
    case 'days':
      result.setDate(result.getDate() + value);
      break;
    case 'weeks':
      result.setDate(result.getDate() + value * 7);
      break;
    case 'months':
      result.setMonth(result.getMonth() + value);
      break;
    default:
      break;
  }
  return result;
}

/** Checks a user's balance record and handles auto-refill if needed. */
async function checkBalanceRecord(
  txData: TxData,
  deps: CheckBalanceDeps,
): Promise<{ canSpend: boolean; balance: number; tokenCost: number }> {
  const { user, model, endpoint, valueKey, tokenType, amount, endpointTokenConfig } = txData;
  const multiplier = deps.getMultiplier({
    valueKey,
    tokenType,
    model,
    endpoint,
    endpointTokenConfig,
  });
  const tokenCost = amount * multiplier;

  const record = await deps.findBalanceByUser(user);
  if (!record) {
    logger.debug('[Balance.check] No balance record found for user', { user });
    return { canSpend: false, balance: 0, tokenCost };
  }
  let balance = record.tokenCredits;

  logger.debug('[Balance.check] Initial state', {
    user,
    model,
    endpoint,
    valueKey,
    tokenType,
    amount,
    balance,
    multiplier,
    endpointTokenConfig: !!endpointTokenConfig,
  });

  if (
    balance - tokenCost <= 0 &&
    record.autoRefillEnabled &&
    record.refillAmount &&
    record.refillAmount > 0
  ) {
    const lastRefillDate = new Date(record.lastRefill ?? 0);
    const now = new Date();
    if (
      isNaN(lastRefillDate.getTime()) ||
      now >=
        addIntervalToDate(
          lastRefillDate,
          record.refillIntervalValue ?? 0,
          record.refillIntervalUnit ?? 'days',
        )
    ) {
      try {
        const result = await deps.createAutoRefillTransaction({
          user,
          tokenType: 'credits',
          context: 'autoRefill',
          rawAmount: record.refillAmount,
        });
        if (result) {
          balance = result.balance;
        }
      } catch (error) {
        logger.error('[Balance.check] Failed to record transaction for auto-refill', error);
      }
    }
  }

  logger.debug('[Balance.check] Token cost', { tokenCost });
  return { canSpend: balance >= tokenCost, balance, tokenCost };
}

/**
 * Checks balance for a user and logs a violation if they cannot spend.
 * Throws an error with the balance info if insufficient funds.
 */
export async function checkBalance(
  { req, res, txData }: { req: ServerRequest; res: Response; txData: TxData },
  deps: CheckBalanceDeps,
): Promise<boolean> {
  const { canSpend, balance, tokenCost } = await checkBalanceRecord(txData, deps);
  if (canSpend) {
    return true;
  }

  const type = ViolationTypes.TOKEN_BALANCE;
  const errorMessage: Record<string, unknown> = {
    type,
    balance,
    tokenCost,
    promptTokens: txData.amount,
  };

  if (txData.generations && txData.generations.length > 0) {
    errorMessage.generations = txData.generations;
  }

  await deps.logViolation(req, res, type, errorMessage, 0);
  throw new Error(JSON.stringify(errorMessage));
}
