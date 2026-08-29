/* eslint-disable @typescript-eslint/no-explicit-any -- dependency-injected legacy API boundary */
import crypto from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createOpenIDRefreshIdentityTuple, serializeAuthIdentityTuple } from '~/utils/identity';
import { OPENID_EXPIRY_BUFFER_SECONDS } from '~/oauth/expiry';

const DEFAULT_FLIGHT_TTL_MS = 2 * 60 * 1000;
const DEFAULT_LOCK_TTL_MS = 30 * 1000;
const DEFAULT_WAIT_TIMEOUT_MS = DEFAULT_FLIGHT_TTL_MS;
const DEFAULT_WAIT_INTERVAL_MS = 100;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10 * 1000;
const INTERNAL_BROWSER_REFRESH_TOKEN_FIELD = '__browserRefreshToken';
const INTERNAL_PREDECESSOR_REFRESH_TOKEN_FIELD = '__predecessorRefreshToken';

type TokenResult = Record<string, any>;
type FlightRecord = {
  status?: string;
  ownerId?: string;
  encryptedResult?: string;
  errorMessage?: string;
  expiresAt?: Date | string;
  [key: string]: any;
};

export interface OpenIDRefreshFlightDeps {
  db: {
    acquireOpenIDRefreshFlight: (data: Record<string, any>) => Promise<Record<string, any>>;
    completeOpenIDRefreshFlight: (data: Record<string, any>) => Promise<FlightRecord | null>;
    renewOpenIDRefreshFlight: (data: Record<string, any>) => Promise<FlightRecord | null>;
    failOpenIDRefreshFlight: (data: Record<string, any>) => Promise<FlightRecord | null>;
    revokeOpenIDRefreshFlight: (data: Record<string, any>) => Promise<FlightRecord | null>;
    findOpenIDRefreshFlight: (data: { key: string }) => Promise<FlightRecord | null>;
  };
  logger: { warn: (...args: any[]) => void };
  encrypt: (value: string) => Promise<string>;
  decrypt: (value: string) => Promise<string>;
}

export function createOpenIDRefreshFlightService({
  db,
  logger,
  encrypt,
  decrypt,
}: OpenIDRefreshFlightDeps): any {
  const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

  function createOpenIDRefreshFlightKey({ req, user, refreshToken, identityContext }: any) {
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
    return sha256(
      [
        serializeAuthIdentityTuple(tuple),
        req?.sessionID ?? 'no-session',
        sha256(refreshToken),
      ].join('\x1f'),
    );
  }

  async function acquireOpenIDRefreshFlight({
    key,
    ownerId = crypto.randomUUID(),
    ttl = DEFAULT_FLIGHT_TTL_MS,
    lockTtl = DEFAULT_LOCK_TTL_MS,
  }: any) {
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
  }: any) {
    if (!key || !ownerId || !tokens) return null;
    const serializedTokens: TokenResult = { ...tokens };
    for (const field of [
      INTERNAL_BROWSER_REFRESH_TOKEN_FIELD,
      INTERNAL_PREDECESSOR_REFRESH_TOKEN_FIELD,
    ]) {
      const value = tokens[field];
      if (typeof value === 'string' && value) serializedTokens[field] = value;
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
  }: any) {
    if (!key || !ownerId) return null;
    return db.renewOpenIDRefreshFlight({
      key,
      ownerId,
      lockExpiresAt: new Date(Date.now() + lockTtl),
      expiresAt: new Date(Date.now() + ttl),
    });
  }

  async function withOpenIDRefreshFlightLease({
    key,
    ownerId,
    operation,
    heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL_MS,
    lockTtl = DEFAULT_LOCK_TTL_MS,
    ttl = DEFAULT_FLIGHT_TTL_MS,
  }: any) {
    if (!key || !ownerId)
      return operation({ assertLeaseOwned: async () => true, markLeaseSettled: () => {} });
    let renewalPromise: Promise<FlightRecord | null> | null = null;
    let ownershipLost = false;
    let settled = false;
    const ownershipError = () =>
      new Error('OpenID refresh coordination ownership was lost before completion');
    const renewLease = async () => {
      if (ownershipLost) throw ownershipError();
      if (!renewalPromise)
        renewalPromise = renewOpenIDRefreshFlight({ key, ownerId, lockTtl, ttl }).finally(() => {
          renewalPromise = null;
        });
      const flight = await renewalPromise;
      if (!flight) {
        if (settled) return null;
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
    try {
      const result = await operation({
        assertLeaseOwned: renewLease,
        markLeaseSettled: () => {
          settled = true;
        },
      });
      if (ownershipLost) throw ownershipError();
      return result;
    } finally {
      clearInterval(heartbeat);
      if (renewalPromise) await renewalPromise;
    }
  }

  async function failOpenIDRefreshFlight({
    key,
    ownerId,
    error,
    ttl = DEFAULT_FLIGHT_TTL_MS,
  }: any) {
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

  async function revokeOpenIDRefreshFlights({ keys, ttl = DEFAULT_FLIGHT_TTL_MS }: any) {
    const uniqueKeys = [...new Set<string>((keys ?? []).filter(Boolean))];
    if (uniqueKeys.length === 0) return [];
    const expiresAt = new Date(Date.now() + ttl);
    return Promise.all(uniqueKeys.map((key) => db.revokeOpenIDRefreshFlight({ key, expiresAt })));
  }

  async function readCompletedFlight(flight: FlightRecord | null): Promise<TokenResult | null> {
    if (!flight) return null;
    if (flight.status === 'revoked')
      throw new Error(flight.errorMessage || 'OpenID refresh was revoked by logout');
    if (flight.status === 'failed')
      throw new Error(flight.errorMessage || 'OpenID refresh failed in another worker');
    if (flight.status !== 'completed' || !flight.encryptedResult) return null;
    const tokens: TokenResult = JSON.parse(await decrypt(flight.encryptedResult));
    const accessTokenExpiresAt = Number(tokens.expires_at) * 1000;
    if (
      Number.isFinite(accessTokenExpiresAt) &&
      accessTokenExpiresAt <= Date.now() + OPENID_EXPIRY_BUFFER_SECONDS * 1000
    ) {
      return null;
    }
    for (const field of [
      INTERNAL_BROWSER_REFRESH_TOKEN_FIELD,
      INTERNAL_PREDECESSOR_REFRESH_TOKEN_FIELD,
    ]) {
      const value = tokens[field];
      if (typeof value === 'string' && value) {
        delete tokens[field];
        Object.defineProperty(tokens, field, {
          value,
          enumerable: false,
          configurable: true,
        });
      }
    }
    return tokens;
  }

  function getRenewedWaitDeadline(deadline: number, flight: FlightRecord | null): number {
    const renewedExpiry = flight?.expiresAt ? new Date(flight.expiresAt).getTime() : NaN;
    return Number.isFinite(renewedExpiry) ? Math.max(deadline, renewedExpiry) : deadline;
  }

  async function waitForOpenIDRefreshFlight({
    key,
    timeoutMs,
    intervalMs = DEFAULT_WAIT_INTERVAL_MS,
  }: any) {
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
