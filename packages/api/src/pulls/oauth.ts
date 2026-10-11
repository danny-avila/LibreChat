import jwt from 'jsonwebtoken';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { decryptV2, encryptV2, logger } from '@librechat/data-schemas';
import type { PullRequestProvider } from 'librechat-data-provider';
import type { PullRequestOAuthConfig } from './settings';
import type { PullRequestFetch } from './shared';
import { getOAuthCallbackUrl } from '~/oauth/url';
import { getSafeErrorMetadata } from '~/utils';
import { isRecord } from './shared';

export const PULL_REQUEST_OAUTH_TYPE = 'pr_oauth';
export const PULL_REQUEST_OAUTH_CALLBACK_PATH = '/api/pull-requests/oauth/callback';
const STATE_AUDIENCE = 'librechat:pull-request-oauth';
const STATE_TTL_SECONDS = 10 * 60;
const REQUEST_TIMEOUT_MS = 10_000;
/** An access token this close to expiring is refreshed first, so a lookup never starts with it. */
const REFRESH_SKEW_MS = 60_000;
/** How long a grant is kept when the provider does not say how long its refresh token lives. */
const DEFAULT_GRANT_LIFETIME_SECONDS = 180 * 24 * 60 * 60;
const MAX_TOKEN_LENGTH = 8_192;

/** Where users authorize and where the code is exchanged, on the configured host. */
export function oauthEndpoints(
  provider: PullRequestProvider,
  host: string,
): { authorize: string; token: string; defaultScope?: string; basicAuth: boolean } {
  if (provider === 'gitlab') {
    return {
      authorize: `https://${host}/oauth/authorize`,
      token: `https://${host}/oauth/token`,
      defaultScope: 'read_api',
      basicAuth: false,
    };
  }
  if (provider === 'bitbucket') {
    return {
      authorize: 'https://bitbucket.org/site/oauth2/authorize',
      token: 'https://bitbucket.org/site/oauth2/access_token',
      basicAuth: true,
    };
  }
  return {
    authorize: `https://${host}/login/oauth/authorize`,
    token: `https://${host}/login/oauth/access_token`,
    basicAuth: false,
  };
}

/** The fields of a stored token row this module reads and writes; plain values, no documents. */
export type PullRequestOAuthRow = { token: string };

export type PullRequestOAuthRowInput = {
  userId: string;
  type: string;
  identifier: string;
  token: string;
  /** Seconds until the row may be deleted. */
  expiresIn: number;
};

/** The token persistence this module needs, supplied by the caller (the app's token methods). */
export type PullRequestOAuthStore = {
  findToken(query: { scope: string }): Promise<PullRequestOAuthRow | null>;
  /** Writes `data` only while the row still holds `expected` (or is absent, for `null`). */
  replaceTokenIfCurrent(
    scope: string,
    expected: string | null,
    data: PullRequestOAuthRowInput,
  ): Promise<boolean>;
  deleteTokens(query: { scope: string; token?: string }): Promise<unknown>;
};

/** What a verified `state` carries back to the callback. */
export type PullRequestOAuthState = {
  userId: string;
  provider: PullRequestProvider;
  host: string;
  tenantId?: string;
  /** Binds the CSRF cookie to this one flow. */
  flowId: string;
  nonce: string;
};

/** A grant as stored, encrypted, in one row per user and provider host. */
type Grant = {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds; absent for a token that does not expire. */
  accessExpiresAt?: number;
  /** The app that issued it; a grant of a replaced app is treated as no connection. */
  clientId: string;
};

/** Thrown for a grant the provider refused, as opposed to one it could not be asked about. */
class GrantRejectedError extends Error {
  constructor() {
    super('The provider rejected the grant');
    this.name = 'GrantRejectedError';
  }
}

const base64url = (value: Buffer): string => value.toString('base64url');

const isToken = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_TOKEN_LENGTH;

const isSeconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export type PullRequestOAuth = {
  /** Where to send the user, and the flow id its CSRF cookie must be bound to. */
  authorizationUrl(
    user: { id: string; tenantId?: string },
    config: PullRequestOAuthConfig,
  ): { url: string; flowId: string };
  /** The claims of a `state` this server issued and that has not expired; null otherwise. */
  verifyState(state: string): PullRequestOAuthState | null;
  /** Exchanges the code and stores the grant for the user the state names. */
  complete(
    state: PullRequestOAuthState,
    code: string,
    config: PullRequestOAuthConfig,
  ): Promise<void>;
  /** The user's access token, refreshed when it is about to expire; null when not connected. */
  token(userId: string, config: PullRequestOAuthConfig): Promise<string | null>;
  connected(userId: string, config: PullRequestOAuthConfig): Promise<boolean>;
  disconnect(userId: string, config: PullRequestOAuthConfig): Promise<void>;
};

/**
 * Per-user connections to the configured provider, so pull request lookups run on each user's own
 * token, rate limit and repository access. The `state` is a short-lived signed token, so the
 * callback needs no server-side flow record, and the PKCE verifier is derived from it with the
 * server secret, so it never travels through the browser. Grants are stored encrypted, one row per
 * user and provider host, and replaced only when unchanged since read, so two replicas refreshing
 * at once cannot overwrite each other's newer grant.
 */
export function createPullRequestOAuth({
  store,
  fetchFn,
  secret,
  redirectUri,
  encrypt = encryptV2,
  decrypt = decryptV2,
  now = Date.now,
}: {
  store: PullRequestOAuthStore;
  fetchFn: PullRequestFetch;
  /** Signs the state and derives the PKCE verifier. */
  secret: string;
  redirectUri: string;
  encrypt?: (value: string) => Promise<string>;
  decrypt?: (value: string) => Promise<string>;
  now?: () => number;
}): PullRequestOAuth {
  const scopeOf = (userId: string, config: PullRequestOAuthConfig) =>
    `${PULL_REQUEST_OAUTH_TYPE}:${userId}:${config.provider}:${config.host}`;
  const verifierOf = (nonce: string) =>
    base64url(createHmac('sha256', secret).update(`pull-request-oauth:${nonce}`).digest());

  /** Refreshes in flight in this process, so concurrent lookups of one user refresh once. */
  const refreshing = new Map<string, Promise<string | null>>();

  async function requestGrant(
    config: PullRequestOAuthConfig,
    form: Record<string, string>,
    clientId: string,
  ): Promise<Grant> {
    const endpoints = oauthEndpoints(config.provider, config.host);
    const body = new URLSearchParams(form);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'LibreChat-Pull-Requests',
    };
    if (endpoints.basicAuth) {
      const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`);
      headers.Authorization = `Basic ${credentials.toString('base64')}`;
    } else {
      body.set('client_id', config.clientId);
      body.set('client_secret', config.clientSecret);
    }
    const response = await fetchFn(endpoints.token, {
      method: 'POST',
      headers,
      body: body.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const parsed: unknown = await response.json().catch(() => null);
    /** GitHub answers a refused grant with 200 and an `error` field; others use 400 or 401. */
    const refused =
      response.status === 400 ||
      response.status === 401 ||
      (isRecord(parsed) && typeof parsed.error === 'string');
    if (refused) throw new GrantRejectedError();
    if (!response.ok || !isRecord(parsed) || !isToken(parsed.access_token)) {
      throw new Error(`Token endpoint answered ${response.status}`);
    }
    return {
      accessToken: parsed.access_token,
      ...(isToken(parsed.refresh_token) ? { refreshToken: parsed.refresh_token } : {}),
      ...(isSeconds(parsed.expires_in)
        ? { accessExpiresAt: now() + parsed.expires_in * 1000 }
        : {}),
      clientId,
    };
  }

  /** How long the row may live: as long as a refresh token can, else the access token's life. */
  const lifetimeOf = (grant: Grant): number => {
    if (grant.refreshToken != null) return DEFAULT_GRANT_LIFETIME_SECONDS;
    if (grant.accessExpiresAt != null) {
      return Math.max(1, Math.ceil((grant.accessExpiresAt - now()) / 1000));
    }
    return DEFAULT_GRANT_LIFETIME_SECONDS;
  };

  async function read(
    userId: string,
    config: PullRequestOAuthConfig,
  ): Promise<{ row: PullRequestOAuthRow; grant: Grant } | null> {
    const row = await store.findToken({ scope: scopeOf(userId, config) });
    if (row == null) return null;
    /** A decryption failure (a missing or rotated key) is an outage, not an absent connection,
     *  so it propagates; only a stored value that is not a grant reads as none. */
    const plaintext = await decrypt(row.token);
    let parsed: unknown;
    try {
      parsed = JSON.parse(plaintext);
    } catch {
      return null;
    }
    if (
      !isRecord(parsed) ||
      !isToken(parsed.accessToken) ||
      parsed.clientId !== config.clientId ||
      (parsed.refreshToken !== undefined && !isToken(parsed.refreshToken)) ||
      (parsed.accessExpiresAt !== undefined && typeof parsed.accessExpiresAt !== 'number')
    ) {
      return null;
    }
    return { row, grant: parsed as Grant };
  }

  async function write(
    userId: string,
    config: PullRequestOAuthConfig,
    expected: string | null,
    grant: Grant,
  ): Promise<boolean> {
    return store.replaceTokenIfCurrent(scopeOf(userId, config), expected, {
      userId,
      type: PULL_REQUEST_OAUTH_TYPE,
      identifier: `${config.provider}:${config.host}`,
      token: await encrypt(JSON.stringify(grant)),
      expiresIn: lifetimeOf(grant),
    });
  }

  async function refresh(
    userId: string,
    config: PullRequestOAuthConfig,
    row: PullRequestOAuthRow,
    grant: Grant,
  ): Promise<string | null> {
    if (grant.refreshToken == null) return null;
    let next: Grant;
    try {
      next = await requestGrant(
        config,
        { grant_type: 'refresh_token', refresh_token: grant.refreshToken },
        config.clientId,
      );
    } catch (error) {
      if (error instanceof GrantRejectedError) {
        /** Another replica may have refreshed with this token first; its grant is the answer. */
        const current = await read(userId, config);
        if (current != null && current.row.token !== row.token) {
          return current.grant.accessToken;
        }
        await store.deleteTokens({ scope: scopeOf(userId, config), token: row.token });
        return null;
      }
      throw error;
    }
    /** A provider that does not rotate refresh tokens keeps the one it was given. */
    const stored: Grant = { ...next, refreshToken: next.refreshToken ?? grant.refreshToken };
    if (await write(userId, config, row.token, stored)) return stored.accessToken;
    const current = await read(userId, config);
    return current?.grant.accessToken ?? null;
  }

  return {
    authorizationUrl(user, config) {
      const nonce = base64url(randomBytes(16));
      const state = jwt.sign(
        {
          sub: user.id,
          p: config.provider,
          h: config.host,
          n: nonce,
          ...(user.tenantId ? { t: user.tenantId } : {}),
        },
        secret,
        { audience: STATE_AUDIENCE, expiresIn: STATE_TTL_SECONDS },
      );
      const endpoints = oauthEndpoints(config.provider, config.host);
      const scope = config.scope ?? endpoints.defaultScope;
      const challenge = base64url(createHash('sha256').update(verifierOf(nonce)).digest());
      const query = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        ...(scope ? { scope } : {}),
      });
      return {
        url: `${endpoints.authorize}?${query.toString()}`,
        flowId: flowIdOf(user.id, nonce),
      };
    },

    verifyState(state) {
      let claims: unknown;
      try {
        claims = jwt.verify(state, secret, { audience: STATE_AUDIENCE });
      } catch {
        return null;
      }
      if (
        !isRecord(claims) ||
        typeof claims.sub !== 'string' ||
        typeof claims.h !== 'string' ||
        typeof claims.n !== 'string' ||
        (claims.p !== 'github' && claims.p !== 'gitlab' && claims.p !== 'bitbucket') ||
        (claims.t !== undefined && typeof claims.t !== 'string')
      ) {
        return null;
      }
      return {
        userId: claims.sub,
        provider: claims.p,
        host: claims.h,
        nonce: claims.n,
        flowId: flowIdOf(claims.sub, claims.n),
        ...(typeof claims.t === 'string' ? { tenantId: claims.t } : {}),
      };
    },

    async complete(state, code, config) {
      const response = await requestGrant(
        config,
        {
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: verifierOf(state.nonce),
        },
        config.clientId,
      );
      /** Replaces whatever the user had connected before, read first so the swap is exact. */
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await store.findToken({ scope: scopeOf(state.userId, config) });
        if (await write(state.userId, config, current?.token ?? null, response)) return;
      }
      throw new Error('The grant could not be stored');
    },

    async token(userId, config) {
      const current = await read(userId, config);
      if (current == null) return null;
      const { row, grant } = current;
      if (grant.accessExpiresAt == null || grant.accessExpiresAt - REFRESH_SKEW_MS > now()) {
        return grant.accessToken;
      }
      const key = scopeOf(userId, config);
      const pending = refreshing.get(key);
      if (pending != null) return pending;
      const started = refresh(userId, config, row, grant).catch((error: unknown) => {
        logger.warn('[PullRequests] OAuth refresh failed', getSafeErrorMetadata(error));
        return null;
      });
      refreshing.set(key, started);
      try {
        return await started;
      } finally {
        refreshing.delete(key);
      }
    },

    async connected(userId, config) {
      return (await read(userId, config)) != null;
    },

    async disconnect(userId, config) {
      await store.deleteTokens({ scope: scopeOf(userId, config) });
    },
  };
}

const flowIdOf = (userId: string, nonce: string): string => `pull-request-oauth:${userId}:${nonce}`;

/**
 * The connection service for this deployment, from its environment: the state is signed with
 * `JWT_SECRET` and the callback is on `DOMAIN_SERVER`. Without a secret no user can connect.
 */
export function createPullRequestOAuthFromEnv({
  store,
  fetchFn,
  env,
}: {
  store: PullRequestOAuthStore;
  fetchFn: PullRequestFetch;
  env: Readonly<Record<string, string | undefined>>;
}): PullRequestOAuth | undefined {
  const secret = env.JWT_SECRET;
  if (!secret) return undefined;
  return createPullRequestOAuth({
    store,
    fetchFn,
    secret,
    redirectUri: getOAuthCallbackUrl(
      env.DOMAIN_SERVER || 'http://localhost:3080',
      PULL_REQUEST_OAUTH_CALLBACK_PATH,
    ),
  });
}
