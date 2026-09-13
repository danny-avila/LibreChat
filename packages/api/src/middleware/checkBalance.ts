import { randomUUID } from 'crypto';
import { logger } from '@librechat/data-schemas';
import { DEFAULT_BALANCE_RESERVATION_TTL_MS, ViolationTypes } from 'librechat-data-provider';
import type {
  BalanceReservationRequest,
  BalanceReservationRenewal,
  BalanceReservationRelease,
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
  renewBalanceReservation: (params: BalanceReservationRenewal) => Promise<void>;
  releaseBalanceReservation: (params: BalanceReservationRelease) => Promise<void>;
  logViolation: (
    req: unknown,
    res: unknown,
    type: string,
    errorMessage: Record<string, unknown>,
    score: number,
  ) => Promise<void>;
  /** Balance config for lazy initialization when no record exists, and the reservation TTL */
  balanceConfig?: BalanceConfig;
}

/**
 * Credits held for an admitted request until its usage has been recorded. The reservation is
 * renewed every half TTL until released, so only a reservation whose process stopped expires.
 */
export interface BalanceReservation {
  /** Idempotent; stops renewal. A failed release is logged and left to expire. */
  release: () => Promise<void>;
}

/** The balance reservations admitted during one turn. */
export interface BalanceReservations {
  /** Tracks an admission that may still be pending; returns the same promise. */
  track: <T extends BalanceReservation | undefined>(admission: Promise<T>) => Promise<T>;
  /**
   * Releases every tracked reservation, first waiting for admissions still pending so a
   * reservation that settles after its turn failed is released too. Failed admissions hold nothing.
   */
  release: () => Promise<void>;
}

export function createBalanceReservations(): BalanceReservations {
  let admissions: Promise<BalanceReservation | undefined>[] = [];
  return {
    track: (admission) => {
      admissions.push(admission.catch(() => undefined));
      return admission;
    },
    release: async () => {
      const pending = admissions;
      admissions = [];
      const reservations = await Promise.all(pending);
      await Promise.all(reservations.map((reservation) => reservation?.release()));
    },
  };
}

/** Runs one turn and releases whatever balance reservations it admitted once it settles. */
export async function withBalanceReservations<T>(
  run: (reservations: BalanceReservations) => Promise<T>,
): Promise<T> {
  const reservations = createBalanceReservations();
  try {
    return await run(reservations);
  } finally {
    await reservations.release();
  }
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

function buildInitialBalance(user: string, config?: BalanceConfig): IBalanceUpdate | undefined {
  if (config?.startBalance == null) {
    return undefined;
  }
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

/**
 * Admits a request against the user's balance and holds its token cost until the returned
 * reservation is released, so concurrent requests are admitted only against credits that no
 * other in-flight request holds. A missing balance record is created from `startBalance`.
 * Throws with the balance info if the credits are insufficient.
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
  const ttlMs = getReservationTtlMs(deps.balanceConfig);

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

  const result = await deps.reserveBalance({
    user,
    reservationId,
    amount: tokenCost,
    expiresAt: new Date(Date.now() + ttlMs),
    initialBalance: buildInitialBalance(user, deps.balanceConfig),
  });

  if (result?.reserved) {
    const renewal =
      tokenCost > 0
        ? setInterval(() => {
            deps
              .renewBalanceReservation({
                user,
                reservationId,
                expiresAt: new Date(Date.now() + ttlMs),
              })
              .catch((error) => {
                logger.error('[Balance.check] Failed to renew balance reservation', {
                  user,
                  error,
                });
              });
          }, ttlMs / 2)
        : undefined;
    renewal?.unref();
    let released: Promise<void> | undefined;
    return {
      release: () => {
        clearInterval(renewal);
        released ??= deps
          .releaseBalanceReservation({ user, reservationId, amount: tokenCost })
          .catch((error) => {
            logger.error('[Balance.check] Failed to release balance reservation', { user, error });
          });
        return released;
      },
    };
  }

  if (!result) {
    logger.debug('[Balance.check] No balance record found for user', { user });
  }

  const type = ViolationTypes.TOKEN_BALANCE;
  const errorMessage: Record<string, unknown> = {
    type,
    balance: Math.max(0, result?.balance ?? 0),
    tokenCost,
    promptTokens: txData.amount,
  };

  if (txData.generations && txData.generations.length > 0) {
    errorMessage.generations = txData.generations;
  }

  await deps.logViolation(req, res, type, errorMessage, 0);
  throw new Error(JSON.stringify(errorMessage));
}
