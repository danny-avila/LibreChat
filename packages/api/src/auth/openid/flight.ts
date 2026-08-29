import crypto from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type {
  LeaseContext,
  OpenIDLogger,
  OpenIDClaims,
  OpenIDTokenSet,
  RefreshFlightAcquireResult,
  RefreshFlightRecord,
  RefreshKeyInput,
} from './types';
import {
  createOpenIDRefreshOwnershipError,
  isOpenIDRefreshOwnershipError,
  toOpenIDLogArgument,
} from './errors';
import { createOpenIDRefreshIdentityTuple, serializeAuthIdentityTuple } from '~/utils/identity';
import { OPENID_EXPIRY_BUFFER_SECONDS } from '~/oauth/expiry';

const DEFAULT_FLIGHT_TTL_MS = 2 * 60 * 1000;
const DEFAULT_LOCK_TTL_MS = 30 * 1000;
const DEFAULT_WAIT_TIMEOUT_MS = DEFAULT_FLIGHT_TTL_MS;
const DEFAULT_WAIT_INTERVAL_MS = 100;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10 * 1000;
const INTERNAL_BROWSER_REFRESH_TOKEN_FIELD = '__browserRefreshToken';
const INTERNAL_PREDECESSOR_REFRESH_TOKEN_FIELD = '__predecessorRefreshToken';

export interface TokenResult extends Omit<OpenIDTokenSet, 'claims'> {
  tokenset?: OpenIDTokenSet;
  claims?: OpenIDClaims | (() => OpenIDClaims);
  openidIssuer?: string;
  __browserRefreshToken?: string;
  __predecessorRefreshToken?: string;
}

interface FlightAcquireData {
  key: string;
  ownerId: string;
  lockExpiresAt: Date;
  expiresAt: Date;
}

interface FlightOwnerData {
  key: string;
  ownerId: string;
  expiresAt: Date;
}

interface FlightCompleteData extends FlightOwnerData {
  encryptedResult: string;
}

interface FlightRenewData extends FlightOwnerData {
  lockExpiresAt: Date;
}

interface FlightFailData extends FlightOwnerData {
  errorMessage: string;
}

export interface OpenIDRefreshFlightService {
  acquireOpenIDRefreshFlight: (args: {
    key?: string | null;
    ownerId?: string;
    ttl?: number;
    lockTtl?: number;
  }) => Promise<RefreshFlightAcquireResult>;
  completeOpenIDRefreshFlight: (args: {
    key?: string | null;
    ownerId?: string;
    tokens?: TokenResult | null;
    ttl?: number;
  }) => Promise<RefreshFlightRecord | null>;
  createOpenIDRefreshFlightKey: (input: RefreshKeyInput) => string | null;
  failOpenIDRefreshFlight: (args: {
    key?: string | null;
    ownerId?: string;
    error?: Error | { message?: string } | null;
    ttl?: number;
  }) => Promise<RefreshFlightRecord | null>;
  renewOpenIDRefreshFlight: (args: {
    key?: string | null;
    ownerId?: string;
    lockTtl?: number;
    ttl?: number;
  }) => Promise<RefreshFlightRecord | null>;
  revokeOpenIDRefreshFlights: (args: {
    keys?: Array<string | null | undefined>;
    ttl?: number;
  }) => Promise<Array<TokenResult | null>>;
  waitForOpenIDRefreshFlight: (args: {
    key?: string | null;
    timeoutMs?: number;
    intervalMs?: number;
  }) => Promise<TokenResult | null>;
  withOpenIDRefreshFlightLease: <T>(args: {
    key?: string | null;
    ownerId?: string;
    operation: (context: LeaseContext) => Promise<T>;
    heartbeatInterval?: number;
    lockTtl?: number;
    ttl?: number;
  }) => Promise<T>;
  __internals: {
    sha256: (value: string) => string;
    readCompletedFlight: (flight: RefreshFlightRecord | null) => Promise<TokenResult | null>;
    DEFAULT_FLIGHT_TTL_MS: number;
    DEFAULT_LOCK_TTL_MS: number;
    DEFAULT_WAIT_TIMEOUT_MS: number;
    DEFAULT_WAIT_INTERVAL_MS: number;
    DEFAULT_HEARTBEAT_INTERVAL_MS: number;
    INTERNAL_PREDECESSOR_REFRESH_TOKEN_FIELD: string;
    getRenewedWaitDeadline: (deadline: number, flight: RefreshFlightRecord | null) => number;
  };
}

export interface OpenIDRefreshFlightDeps {
  db: {
    acquireOpenIDRefreshFlight: (data: FlightAcquireData) => Promise<{ acquired: boolean }>;
    completeOpenIDRefreshFlight: (data: FlightCompleteData) => Promise<RefreshFlightRecord | null>;
    renewOpenIDRefreshFlight: (data: FlightRenewData) => Promise<RefreshFlightRecord | null>;
    failOpenIDRefreshFlight: (data: FlightFailData) => Promise<RefreshFlightRecord | null>;
    revokeOpenIDRefreshFlight: (data: {
      key: string;
      expiresAt: Date;
    }) => Promise<RefreshFlightRecord | null>;
    findOpenIDRefreshFlight: (data: { key: string }) => Promise<RefreshFlightRecord | null>;
  };
  logger: Pick<OpenIDLogger, 'warn'>;
  encrypt: (value: string) => Promise<string>;
  decrypt: (value: string) => Promise<string>;
}

export function createOpenIDRefreshFlightService({
  db,
  logger,
  encrypt,
  decrypt,
}: OpenIDRefreshFlightDeps): OpenIDRefreshFlightService {
  const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

  function createOpenIDRefreshFlightKey({
    req,
    user,
    refreshToken,
    identityContext,
  }: RefreshKeyInput): string | null {
    const identitySource = identityContext
      ? {
          id: identityContext.appUserId,
          openidId: identityContext.openidSubject,
          tenantId: identityContext.tenantId,
          openidIssuer: identityContext.openidIssuer,
        }
      : user;
    const tuple = createOpenIDRefreshIdentityTuple({
      user: identitySource,
      requestUser: req?.user,
    });
    if (!tuple || !refreshToken) return null;
    return sha256([serializeAuthIdentityTuple(tuple), sha256(refreshToken)].join('\x1f'));
  }

  async function acquireOpenIDRefreshFlight({
    key,
    ownerId = crypto.randomUUID(),
    ttl = DEFAULT_FLIGHT_TTL_MS,
    lockTtl = DEFAULT_LOCK_TTL_MS,
  }: {
    key?: string | null;
    ownerId?: string;
    ttl?: number;
    lockTtl?: number;
  }): Promise<RefreshFlightAcquireResult> {
    if (!key) return { acquired: true, key: null, ownerId, flight: null };
    const acquired = await db.acquireOpenIDRefreshFlight({
      key,
      ownerId,
      lockExpiresAt: new Date(Date.now() + lockTtl),
      expiresAt: new Date(Date.now() + ttl),
    });
    return { ...acquired, key, ownerId };
  }

  async function completeOpenIDRefreshFlight({
    key,
    ownerId,
    tokens,
    ttl = DEFAULT_FLIGHT_TTL_MS,
  }: {
    key?: string | null;
    ownerId?: string;
    tokens?: TokenResult | null;
    ttl?: number;
  }): Promise<RefreshFlightRecord | null> {
    if (!key || !ownerId || !tokens) return null;
    const serializedTokens: TokenResult = { ...tokens };
    if (tokens.__browserRefreshToken) {
      serializedTokens.__browserRefreshToken = tokens.__browserRefreshToken;
    }
    if (tokens.__predecessorRefreshToken) {
      serializedTokens.__predecessorRefreshToken = tokens.__predecessorRefreshToken;
    }
    const accessTokenExpiresAt = Number(tokens.expires_at) * 1000;
    const usableTokenTtl = Number.isFinite(accessTokenExpiresAt)
      ? Math.max(1, accessTokenExpiresAt - Date.now() - OPENID_EXPIRY_BUFFER_SECONDS * 1000)
      : ttl;
    return db.completeOpenIDRefreshFlight({
      key,
      ownerId,
      encryptedResult: await encrypt(JSON.stringify(serializedTokens)),
      expiresAt: new Date(Date.now() + Math.min(ttl, usableTokenTtl)),
    });
  }

  async function renewOpenIDRefreshFlight({
    key,
    ownerId,
    lockTtl = DEFAULT_LOCK_TTL_MS,
    ttl = DEFAULT_FLIGHT_TTL_MS,
  }: {
    key?: string | null;
    ownerId?: string;
    lockTtl?: number;
    ttl?: number;
  }): Promise<RefreshFlightRecord | null> {
    if (!key || !ownerId) return null;
    return db.renewOpenIDRefreshFlight({
      key,
      ownerId,
      lockExpiresAt: new Date(Date.now() + lockTtl),
      expiresAt: new Date(Date.now() + ttl),
    });
  }

  async function withOpenIDRefreshFlightLease<T>({
    key,
    ownerId,
    operation,
    heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL_MS,
    lockTtl = DEFAULT_LOCK_TTL_MS,
    ttl = DEFAULT_FLIGHT_TTL_MS,
  }: {
    key?: string | null;
    ownerId?: string;
    operation: (context: LeaseContext) => Promise<T>;
    heartbeatInterval?: number;
    lockTtl?: number;
    ttl?: number;
  }): Promise<T> {
    if (!key || !ownerId)
      return operation({ assertLeaseOwned: async () => true, markLeaseSettled: () => {} });
    let renewalPromise: Promise<RefreshFlightRecord | null> | null = null;
    let ownershipLost = false;
    let settled = false;
    const ownershipError = () =>
      createOpenIDRefreshOwnershipError(
        'OpenID refresh coordination ownership was lost before completion',
      );
    const renewLease = async () => {
      if (ownershipLost) throw ownershipError();
      if (!renewalPromise)
        renewalPromise = renewOpenIDRefreshFlight({ key, ownerId, lockTtl, ttl }).finally(() => {
          renewalPromise = null;
        });
      const flight = await renewalPromise;
      if (!flight) {
        if (settled) return null;
        const terminalFlight = await db.findOpenIDRefreshFlight({ key });
        if (terminalFlight?.ownerId === ownerId && terminalFlight?.status === 'completed') {
          return terminalFlight;
        }
        ownershipLost = true;
        throw ownershipError();
      }
      return flight;
    };
    const heartbeat = setInterval(() => {
      renewLease().catch((error) =>
        logger.warn('[OpenIDRefreshFlight] Refresh flight lease renewal failed', {
          key,
          error: error?.message,
        }),
      );
    }, heartbeatInterval);
    heartbeat.unref?.();
    let result: T;
    try {
      result = await operation({
        assertLeaseOwned: renewLease,
        markLeaseSettled: () => {
          settled = true;
        },
      });
      if (ownershipLost) throw ownershipError();
    } catch (error) {
      clearInterval(heartbeat);
      if (renewalPromise) {
        try {
          await renewalPromise;
        } catch (cleanupError) {
          logger.warn('[OpenIDRefreshFlight] Lease cleanup also failed after the operation', {
            key,
            error: toOpenIDLogArgument(cleanupError),
          });
        }
      }
      throw error;
    }
    clearInterval(heartbeat);
    if (renewalPromise) {
      try {
        await renewalPromise;
      } catch (error) {
        if (!settled || isOpenIDRefreshOwnershipError(error)) {
          throw error;
        }
      }
    }
    if (ownershipLost) {
      throw ownershipError();
    }
    return result;
  }

  async function failOpenIDRefreshFlight({
    key,
    ownerId,
    error,
    ttl = DEFAULT_FLIGHT_TTL_MS,
  }: {
    key?: string | null;
    ownerId?: string;
    error?: Error | { message?: string } | null;
    ttl?: number;
  }): Promise<RefreshFlightRecord | null> {
    if (!key || !ownerId) return null;
    const errorMessage =
      typeof error?.message === 'string' && error.message ? error.message : 'OpenID refresh failed';
    return db.failOpenIDRefreshFlight({
      key,
      ownerId,
      errorMessage,
      expiresAt: new Date(Date.now() + ttl),
    });
  }

  async function revokeOpenIDRefreshFlights({
    keys,
    ttl = DEFAULT_FLIGHT_TTL_MS,
  }: {
    keys?: Array<string | null | undefined>;
    ttl?: number;
  }): Promise<Array<TokenResult | null>> {
    const uniqueKeys = [...new Set<string>((keys ?? []).filter((key): key is string => !!key))];
    if (uniqueKeys.length === 0) return [];
    const expiresAt = new Date(Date.now() + ttl);
    const revoked = await Promise.all(
      uniqueKeys.map((key) => db.revokeOpenIDRefreshFlight({ key, expiresAt })),
    );
    return Promise.all(
      revoked.map(async (flight) => {
        if (!flight?.encryptedResult) return null;
        return restoreInternalTokenFields(
          JSON.parse(await decrypt(flight.encryptedResult)) as TokenResult,
        );
      }),
    );
  }

  function restoreInternalTokenFields(tokens: TokenResult): TokenResult {
    for (const [field, value] of [
      [INTERNAL_BROWSER_REFRESH_TOKEN_FIELD, tokens.__browserRefreshToken],
      [INTERNAL_PREDECESSOR_REFRESH_TOKEN_FIELD, tokens.__predecessorRefreshToken],
    ] as const) {
      if (value) {
        delete tokens[field];
        Object.defineProperty(tokens, field, { value, enumerable: false, configurable: true });
      }
    }
    return tokens;
  }

  async function readCompletedFlight(
    flight: RefreshFlightRecord | null,
  ): Promise<TokenResult | null> {
    if (!flight) return null;
    if (flight.status === 'revoked')
      throw new Error(flight.errorMessage || 'OpenID refresh was revoked by logout');
    if (flight.status === 'failed')
      throw new Error(flight.errorMessage || 'OpenID refresh failed in another worker');
    if (flight.status !== 'completed' || !flight.encryptedResult) return null;
    const tokens = JSON.parse(await decrypt(flight.encryptedResult)) as TokenResult;
    const accessTokenExpiresAt = Number(tokens.expires_at) * 1000;
    if (
      Number.isFinite(accessTokenExpiresAt) &&
      accessTokenExpiresAt <= Date.now() + OPENID_EXPIRY_BUFFER_SECONDS * 1000
    ) {
      return null;
    }
    return restoreInternalTokenFields(tokens);
  }

  function getRenewedWaitDeadline(deadline: number, flight: RefreshFlightRecord | null): number {
    const renewedExpiry = flight?.expiresAt ? new Date(flight.expiresAt).getTime() : NaN;
    return Number.isFinite(renewedExpiry) ? Math.max(deadline, renewedExpiry) : deadline;
  }

  async function waitForOpenIDRefreshFlight({
    key,
    timeoutMs,
    intervalMs = DEFAULT_WAIT_INTERVAL_MS,
  }: {
    key?: string | null;
    timeoutMs?: number;
    intervalMs?: number;
  }): Promise<TokenResult | null> {
    if (!key) return null;
    const followRenewals = timeoutMs == null;
    let deadline = Date.now() + (timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS);
    while (Date.now() <= deadline) {
      const flight = await db.findOpenIDRefreshFlight({ key });
      const completed = await readCompletedFlight(flight);
      if (completed) return completed;
      if (flight?.status === 'completed') return null;
      if (!flight) return null;
      if (followRenewals) {
        deadline = getRenewedWaitDeadline(deadline, flight);
      }
      await delay(intervalMs);
    }
    logger.warn('[OpenIDRefreshFlight] Timed out waiting for refresh flight', { key });
    return null;
  }

  return {
    acquireOpenIDRefreshFlight,
    completeOpenIDRefreshFlight,
    createOpenIDRefreshFlightKey,
    failOpenIDRefreshFlight,
    renewOpenIDRefreshFlight,
    revokeOpenIDRefreshFlights,
    waitForOpenIDRefreshFlight,
    withOpenIDRefreshFlightLease,
    __internals: {
      sha256,
      readCompletedFlight,
      DEFAULT_FLIGHT_TTL_MS,
      DEFAULT_LOCK_TTL_MS,
      DEFAULT_WAIT_TIMEOUT_MS,
      DEFAULT_WAIT_INTERVAL_MS,
      DEFAULT_HEARTBEAT_INTERVAL_MS,
      INTERNAL_PREDECESSOR_REFRESH_TOKEN_FIELD,
      getRenewedWaitDeadline,
    },
  };
}
