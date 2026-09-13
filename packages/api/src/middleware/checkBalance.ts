import { randomUUID } from 'crypto';
import { logger } from '@librechat/data-schemas';
import { DEFAULT_BALANCE_RESERVATION_TTL_MS, ViolationTypes } from 'librechat-data-provider';
import type {
  BalanceReservationRequest,
  BalanceReservationResult,
  IBalanceUpdate,
  BalanceConfig,
} from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

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
  getMultiplier: (params: Record<string, unknown>) => number;
  reserveBalance: (request: BalanceReservationRequest) => Promise<BalanceReservationResult | null>;
  releaseBalanceReservation: (params: { user: string; reservationId: string }) => Promise<void>;
  logViolation: (
    req: unknown,
    res: unknown,
    type: string,
    errorMessage: Record<string, unknown>,
    score: number,
  ) => Promise<void>;
  /** Balance config for lazy initialization when no record exists, and the reservation TTL */
  balanceConfig?: BalanceConfig;
  /** Upsert function for lazy initialization when no record exists */
  upsertBalanceFields?: (
    userId: string,
    fields: IBalanceUpdate,
  ) => Promise<{ tokenCredits: number } | null>;
}

/** Credits held for an admitted request until its usage has been recorded. */
export interface BalanceReservation {
  /** Idempotent; a failed release is logged and left to expire. */
  release: () => Promise<void>;
}

let warnedInvalidReservationTtl = false;

function getReservationTtlMs(config?: BalanceConfig): number {
  const ttl = config?.reservationTtlMs;
  if (ttl == null) {
    return DEFAULT_BALANCE_RESERVATION_TTL_MS;
  }
  if (Number.isFinite(ttl) && ttl > 0) {
    return ttl;
  }
  if (!warnedInvalidReservationTtl) {
    warnedInvalidReservationTtl = true;
    logger.warn('[Balance.check] Ignoring invalid balance.reservationTtlMs; using the default', {
      reservationTtlMs: ttl,
      defaultMs: DEFAULT_BALANCE_RESERVATION_TTL_MS,
    });
  }
  return DEFAULT_BALANCE_RESERVATION_TTL_MS;
}

function buildInitialBalance(user: string, config: BalanceConfig): IBalanceUpdate {
  const fields: IBalanceUpdate = { user, tokenCredits: config.startBalance };
  if (
    config.autoRefillEnabled &&
    config.refillIntervalValue != null &&
    config.refillIntervalUnit != null &&
    config.refillAmount != null
  ) {
    fields.autoRefillEnabled = config.autoRefillEnabled;
    fields.refillIntervalValue = config.refillIntervalValue;
    fields.refillIntervalUnit = config.refillIntervalUnit;
    fields.refillAmount = config.refillAmount;
    fields.lastRefill = new Date();
  }
  return fields;
}

/** Reserves against the user's balance record, lazily creating it from config when absent. */
async function reserveBalanceRecord(
  request: BalanceReservationRequest,
  deps: CheckBalanceDeps,
): Promise<BalanceReservationResult> {
  const { user } = request;
  const result = await deps.reserveBalance(request);
  if (result) {
    return result;
  }

  const config = deps.balanceConfig;
  if (config?.startBalance == null || !deps.upsertBalanceFields) {
    logger.debug('[Balance.check] No balance record found for user', { user });
    return { reserved: false, balance: 0 };
  }

  logger.debug('[Balance.check] Lazy-initializing balance record for user', {
    user,
    startBalance: config.startBalance,
  });
  try {
    await deps.upsertBalanceFields(user, buildInitialBalance(user, config));
  } catch (error) {
    logger.error('[Balance.check] Failed to lazy-initialize balance record', { user, error });
    return { reserved: false, balance: 0 };
  }
  return (await deps.reserveBalance(request)) ?? { reserved: false, balance: 0 };
}

/**
 * Admits a request against the user's balance and holds its token cost until the returned
 * reservation is released, so concurrent requests are admitted only against credits that no
 * other in-flight request holds. Throws with the balance info if the credits are insufficient.
 */
export async function checkBalance(
  { req, res, txData }: { req: ServerRequest; res: Response; txData: TxData },
  deps: CheckBalanceDeps,
): Promise<BalanceReservation> {
  const { user, model, endpoint, valueKey, tokenType, amount, endpointTokenConfig } = txData;
  const multiplier = deps.getMultiplier({
    valueKey,
    tokenType,
    model,
    endpoint,
    endpointTokenConfig,
  });
  const tokenCost = amount * multiplier;
  const reservationId = randomUUID();

  logger.debug('[Balance.check] Reserving token cost', {
    user,
    model,
    endpoint,
    valueKey,
    tokenType,
    amount,
    multiplier,
    tokenCost,
    endpointTokenConfig: !!endpointTokenConfig,
  });

  const { reserved, balance } = await reserveBalanceRecord(
    {
      user,
      reservationId,
      amount: tokenCost,
      expiresAt: new Date(Date.now() + getReservationTtlMs(deps.balanceConfig)),
    },
    deps,
  );

  if (reserved) {
    let released: Promise<void> | undefined;
    return {
      release: () => {
        released ??= deps.releaseBalanceReservation({ user, reservationId }).catch((error) => {
          logger.error('[Balance.check] Failed to release balance reservation', { user, error });
        });
        return released;
      },
    };
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
