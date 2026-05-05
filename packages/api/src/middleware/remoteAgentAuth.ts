import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { getTenantId, logger } from '@librechat/data-schemas';
import { SystemRoles, isRemoteOidcUrlAllowed } from 'librechat-data-provider';
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import type { AppConfig, IUser, UserMethods } from '@librechat/data-schemas';
import type { Algorithm, JwtPayload, VerifyOptions } from 'jsonwebtoken';
import type { TAgentsEndpoint } from 'librechat-data-provider';
import type { RequestInit } from 'undici';
import type { GetAppConfigOptions } from '../app/service';
import { findOpenIDUser, getOpenIdEmail, normalizeOpenIdIssuer } from '../auth/openid';
import { isEnabled, math } from '~/utils';

export interface RemoteAgentAuthDeps {
  apiKeyMiddleware: RequestHandler;
  findUser: UserMethods['findUser'];
  updateUser: UserMethods['updateUser'];
  getAppConfig: (options?: GetAppConfigOptions) => Promise<AppConfig>;
}

type OidcConfig = NonNullable<
  NonNullable<NonNullable<TAgentsEndpoint['remoteApi']>['auth']>['oidc']
>;

type AgentAuthConfig = NonNullable<NonNullable<TAgentsEndpoint['remoteApi']>['auth']>;
type EnabledOidcConfig = OidcConfig & { issuer: string };
type JwksCacheOptions = {
  enabled: boolean;
  maxAge: number;
};
type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};
type ScopeClaim = string | string[] | undefined;
type UserResolution =
  | { status: 'resolved'; user: IUser; updateData: Partial<IUser> }
  | { status: 'missing' }
  | { status: 'rejected'; error: string };

const OIDC_DISCOVERY_TIMEOUT_MS = 10000;
const MAX_JWKS_CACHE_ENTRIES = 100;
const JWT_ALGORITHMS: Algorithm[] = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
];
const jwksUriCache = new Map<string, CacheEntry<string>>();
const jwksClientCache = new Map<string, CacheEntry<jwksRsa.JwksClient>>();

export function clearRemoteAgentAuthCache(): void {
  jwksUriCache.clear();
  jwksClientCache.clear();
}

function pruneExpiredEntries<T>(cache: Map<string, CacheEntry<T>>): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

function setCacheEntry<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  entry: CacheEntry<T>,
): void {
  pruneExpiredEntries(cache);

  while (cache.size >= MAX_JWKS_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey == null) break;
    cache.delete(oldestKey);
  }

  cache.set(key, entry);
}

function extractBearer(authHeader: string | undefined): string | null {
  const match = authHeader?.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1] ?? null;
}

function splitScopes(scopes: string): string[] {
  return scopes.trim().split(/\s+/).filter(Boolean);
}

function getTokenScopes(scopeClaim: ScopeClaim): string[] {
  if (Array.isArray(scopeClaim)) return scopeClaim.flatMap(splitScopes);
  return scopeClaim ? splitScopes(scopeClaim) : [];
}

function hasRequiredScopes(requiredScope: string | undefined, payload: JwtPayload): boolean {
  if (!requiredScope) return true;

  const requiredScopes = splitScopes(requiredScope);
  if (requiredScopes.length === 0) return true;

  const rawScope = (payload['scp'] ?? payload['scope']) as ScopeClaim;
  const tokenScopes = getTokenScopes(rawScope);
  return requiredScopes.every((scope) => tokenScopes.includes(scope));
}

function getJwksCacheOptions(): JwksCacheOptions {
  return {
    enabled: process.env.OPENID_JWKS_URL_CACHE_ENABLED
      ? isEnabled(process.env.OPENID_JWKS_URL_CACHE_ENABLED)
      : true,
    maxAge: Math.max(math(process.env.OPENID_JWKS_URL_CACHE_TIME, 60000), 0),
  };
}

function buildDiscoveryOptions(controller: AbortController): RequestInit {
  const options: RequestInit = { signal: controller.signal };

  if (process.env.PROXY) {
    options.dispatcher = new ProxyAgent(process.env.PROXY);
  }

  return options;
}

function ensureRemoteOidcUrlAllowed(value: string, label: string): string {
  if (isRemoteOidcUrlAllowed(value)) return value;
  throw new Error(`${label} must use https:// unless targeting localhost`);
}

async function discoverJwksUri(issuer: string): Promise<string> {
  const normalizedIssuer = normalizeOpenIdIssuer(ensureRemoteOidcUrlAllowed(issuer, 'OIDC issuer'));
  if (!normalizedIssuer) throw new Error('OIDC issuer is required');

  const discoveryUrl = `${normalizedIssuer}/.well-known/openid-configuration`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OIDC_DISCOVERY_TIMEOUT_MS);

  try {
    const res = await undiciFetch(discoveryUrl, buildDiscoveryOptions(controller));
    if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status} ${res.statusText}`);

    const meta = (await res.json()) as { jwks_uri?: string };
    if (!meta.jwks_uri) throw new Error('OIDC discovery response missing jwks_uri');

    return ensureRemoteOidcUrlAllowed(meta.jwks_uri, 'OIDC JWKS URI');
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveJwksUri(
  oidcConfig: EnabledOidcConfig,
  cacheOptions: JwksCacheOptions,
): Promise<string> {
  if (oidcConfig.jwksUri) return ensureRemoteOidcUrlAllowed(oidcConfig.jwksUri, 'OIDC JWKS URI');
  if (process.env.OPENID_JWKS_URL) {
    return ensureRemoteOidcUrlAllowed(process.env.OPENID_JWKS_URL, 'OIDC JWKS URI');
  }

  if (!cacheOptions.enabled) return discoverJwksUri(oidcConfig.issuer);

  const cacheKey = oidcConfig.issuer;
  const cached = jwksUriCache.get(cacheKey);
  if (cached != null && cached.expiresAt > Date.now()) return cached.promise;
  if (cached != null) jwksUriCache.delete(cacheKey);

  const promise = discoverJwksUri(oidcConfig.issuer).catch((err) => {
    jwksUriCache.delete(cacheKey);
    throw err;
  });

  setCacheEntry(jwksUriCache, cacheKey, {
    promise,
    expiresAt: Date.now() + cacheOptions.maxAge,
  });
  return promise;
}

function buildJwksClient(uri: string, cacheOptions: JwksCacheOptions): jwksRsa.JwksClient {
  const options: jwksRsa.Options = {
    cache: cacheOptions.enabled,
    cacheMaxAge: cacheOptions.maxAge,
    jwksUri: uri,
  };

  if (process.env.PROXY) {
    options.requestAgent = new HttpsProxyAgent(process.env.PROXY);
  }

  return jwksRsa(options);
}

async function getJwksClient(oidcConfig: EnabledOidcConfig): Promise<jwksRsa.JwksClient> {
  const cacheOptions = getJwksCacheOptions();
  const uri = await resolveJwksUri(oidcConfig, cacheOptions);

  if (!cacheOptions.enabled) return buildJwksClient(uri, cacheOptions);

  const cacheKey = uri;
  const cached = jwksClientCache.get(cacheKey);
  if (cached != null && cached.expiresAt > Date.now()) return cached.promise;
  if (cached != null) jwksClientCache.delete(cacheKey);

  let client: jwksRsa.JwksClient;
  try {
    client = buildJwksClient(uri, cacheOptions);
  } catch (err) {
    jwksClientCache.delete(cacheKey);
    throw err;
  }

  const promise = Promise.resolve(client);

  setCacheEntry(jwksClientCache, cacheKey, {
    promise,
    expiresAt: Date.now() + cacheOptions.maxAge,
  });
  return promise;
}

function getVerifyOptions(oidcConfig: EnabledOidcConfig): VerifyOptions {
  const normalizedIssuer = normalizeOpenIdIssuer(oidcConfig.issuer);
  const issuer =
    normalizedIssuer && normalizedIssuer !== oidcConfig.issuer
      ? [oidcConfig.issuer, normalizedIssuer]
      : oidcConfig.issuer;

  return {
    algorithms: JWT_ALGORITHMS,
    issuer,
    ...(oidcConfig.audience ? { audience: oidcConfig.audience } : {}),
  };
}

function getConfigOptions(req: Request): GetAppConfigOptions {
  const user = req.user as { tenantId?: string } | undefined;
  const tenantId = user?.tenantId ?? getTenantId();

  if (tenantId) return { tenantId };
  return { baseOnly: true };
}

function getUserConfigOptions(user: IUser): GetAppConfigOptions {
  if (user.tenantId) return { tenantId: user.tenantId };
  return { baseOnly: true };
}

function isResolvedUserConfigScope(initialOptions: GetAppConfigOptions, user: IUser): boolean {
  const userOptions = getUserConfigOptions(user);
  return (
    initialOptions.tenantId === userOptions.tenantId &&
    initialOptions.baseOnly === userOptions.baseOnly
  );
}

function getRemoteAuthConfig(config: AppConfig): AgentAuthConfig | undefined {
  return config.endpoints?.agents?.remoteApi?.auth;
}

function getEnabledOidcConfig(
  authConfig: AgentAuthConfig | undefined,
): EnabledOidcConfig | undefined {
  if (authConfig?.oidc?.enabled !== true) return undefined;
  if (!authConfig.oidc.issuer) throw new Error('OIDC issuer is required when OIDC auth is enabled');
  return { ...authConfig.oidc, issuer: authConfig.oidc.issuer };
}

function isApiKeyEnabled(config: AppConfig): boolean {
  return getRemoteAuthConfig(config)?.apiKey?.enabled !== false;
}

async function enforceApiKeyTenantPolicy(
  req: Request,
  res: Response,
  next: NextFunction,
  getAppConfig: RemoteAgentAuthDeps['getAppConfig'],
): Promise<void> {
  const config = await getAppConfig(getConfigOptions(req));

  if (!isApiKeyEnabled(config)) {
    logger.warn('[remoteAgentAuth] API key rejected by resolved tenant auth policy');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

async function runApiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
  apiKeyMiddleware: RequestHandler,
  getAppConfig: RemoteAgentAuthDeps['getAppConfig'],
): Promise<void> {
  let postAuth: Promise<void> | undefined;

  const wrappedNext: NextFunction = (err?: unknown) => {
    if (err != null) {
      next(err);
      return;
    }

    postAuth = enforceApiKeyTenantPolicy(req, res, next, getAppConfig);
  };

  await Promise.resolve(apiKeyMiddleware(req, res, wrappedNext));
  if (postAuth) await postAuth;
}

async function enforceOidcTenantPolicy(
  token: string,
  user: IUser,
  initialOptions: GetAppConfigOptions,
  getAppConfig: RemoteAgentAuthDeps['getAppConfig'],
): Promise<boolean> {
  if (isResolvedUserConfigScope(initialOptions, user)) return true;

  const config = await getAppConfig(getUserConfigOptions(user));
  const oidcConfig = getEnabledOidcConfig(getRemoteAuthConfig(config));
  if (!oidcConfig) {
    logger.warn('[remoteAgentAuth] OIDC rejected by resolved tenant auth policy');
    return false;
  }

  try {
    const payload = await verifyOidcBearer(token, oidcConfig);
    if (hasRequiredScopes(oidcConfig.scope, payload)) return true;
    logger.warn(
      `[remoteAgentAuth] Token missing resolved tenant required scope: ${oidcConfig.scope}`,
    );
  } catch (err) {
    logger.warn('[remoteAgentAuth] OIDC token rejected by resolved tenant auth policy:', err);
  }

  return false;
}

function verifyJwt(
  token: string,
  signingKey: jwksRsa.SigningKey,
  oidcConfig: EnabledOidcConfig,
): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, signingKey.getPublicKey(), getVerifyOptions(oidcConfig), (err, payload) => {
      if (err != null || payload == null) return reject(err ?? new Error('Empty payload'));
      if (typeof payload === 'string') return reject(new Error('Invalid JWT payload'));
      resolve(payload);
    });
  });
}

async function verifyWithSigningKeys(
  token: string,
  signingKeys: jwksRsa.SigningKey[],
  oidcConfig: EnabledOidcConfig,
): Promise<JwtPayload> {
  let lastError: Error | null = null;

  for (const signingKey of signingKeys) {
    try {
      return await verifyJwt(token, signingKey, oidcConfig);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('No signing keys in JWKS');
}

async function verifyOidcBearer(token: string, oidcConfig: EnabledOidcConfig): Promise<JwtPayload> {
  ensureRemoteOidcUrlAllowed(oidcConfig.issuer, 'OIDC issuer');

  const decoded = jwt.decode(token, { complete: true });
  if (decoded == null || typeof decoded === 'string') throw new Error('Invalid JWT: cannot decode');

  const kid = typeof decoded.header?.kid === 'string' ? decoded.header.kid : undefined;
  const client = await getJwksClient(oidcConfig);

  if (kid != null) {
    const signingKey = await client.getSigningKey(kid);
    return verifyJwt(token, signingKey, oidcConfig);
  }

  return verifyWithSigningKeys(token, await client.getSigningKeys(), oidcConfig);
}

async function resolveUser(
  token: string,
  payload: JwtPayload,
  oidcConfig: EnabledOidcConfig,
  findUser: UserMethods['findUser'],
): Promise<UserResolution> {
  if (typeof payload.sub !== 'string' || payload.sub.trim() === '') {
    return { status: 'rejected', error: 'missing_sub_claim' };
  }

  const { user, error, migration } = await findOpenIDUser({
    findUser,
    email: getOpenIdEmail(payload, 'remoteAgentAuth'),
    openidId: payload.sub,
    openidIssuer: oidcConfig.issuer,
    idOnTheSource: payload['oid'] as string | undefined,
    strategyName: 'remoteAgentAuth',
  });

  if (error != null) return { status: 'rejected', error };
  if (user == null) return { status: 'missing' };

  user.id = String(user._id);

  const updateData: Partial<IUser> = {};

  if (migration) {
    updateData.provider = 'openid';
    updateData.openidId = payload.sub;
    updateData.openidIssuer = normalizeOpenIdIssuer(oidcConfig.issuer);
  }

  if (!user.role) {
    user.role = SystemRoles.USER;
    updateData.role = SystemRoles.USER;
  }

  user.federatedTokens = {
    access_token: token,
    ...(payload.exp != null ? { expires_at: payload.exp } : {}),
  };
  return { status: 'resolved', user, updateData };
}

/**
 * Factory for Remote Agent API auth middleware.
 *
 * Validates Bearer tokens against configured OIDC issuer via JWKS,
 * falling back to API key auth when enabled. Stateless — no session dependency.
 *
 * ```yaml
 * endpoints:
 *   agents:
 *     remoteApi:
 *       auth:
 *         apiKey:
 *           enabled: false
 *         oidc:
 *           enabled: true
 *           issuer: <issuer>
 *           jwksUri: <jwksUri>
 *           audience: <audience>
 *           scope: <scope>
 * ```
 */
export function createRemoteAgentAuth({
  apiKeyMiddleware,
  findUser,
  updateUser,
  getAppConfig,
}: RemoteAgentAuthDeps): RequestHandler {
  const handler: RequestHandler = async (req, res, next) => {
    try {
      const initialConfigOptions = getConfigOptions(req);
      const config = await getAppConfig(initialConfigOptions);
      const authConfig = getRemoteAuthConfig(config);
      const apiKeyEnabled = isApiKeyEnabled(config);

      if (authConfig?.oidc?.enabled !== true) {
        if (apiKeyEnabled) {
          await runApiKeyAuth(req, res, next, apiKeyMiddleware, getAppConfig);
          return;
        }
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!authConfig.oidc.issuer) {
        logger.error('[remoteAgentAuth] OIDC issuer is required when OIDC auth is enabled');
        res.status(500).json({ error: 'Internal server error' });
        return;
      }

      const oidcConfig = getEnabledOidcConfig(authConfig);
      if (!oidcConfig) throw new Error('OIDC issuer is required when OIDC auth is enabled');

      const token = extractBearer(req.headers.authorization);
      if (token == null) {
        if (apiKeyEnabled) {
          await runApiKeyAuth(req, res, next, apiKeyMiddleware, getAppConfig);
          return;
        }
        res.status(401).json({ error: 'Bearer token required' });
        return;
      }

      let payload: JwtPayload;

      try {
        payload = await verifyOidcBearer(token, oidcConfig);
        if (!hasRequiredScopes(oidcConfig.scope, payload)) {
          logger.warn(`[remoteAgentAuth] Token missing required scope: ${oidcConfig.scope}`);
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
      } catch (oidcErr) {
        if (apiKeyEnabled) {
          logger.debug('[remoteAgentAuth] OIDC verification failed; trying API key auth:', oidcErr);
          await runApiKeyAuth(req, res, next, apiKeyMiddleware, getAppConfig);
          return;
        }
        logger.error('[remoteAgentAuth] OIDC verification failed:', oidcErr);
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const userResolution = await resolveUser(token, payload, oidcConfig, findUser);

      if (userResolution.status === 'rejected') {
        logger.warn(`[remoteAgentAuth] OpenID user rejected: ${userResolution.error}`);
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (userResolution.status === 'missing') {
        logger.warn('[remoteAgentAuth] OIDC token valid but no matching LibreChat user');
        if (apiKeyEnabled) {
          await runApiKeyAuth(req, res, next, apiKeyMiddleware, getAppConfig);
          return;
        }
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (
        !(await enforceOidcTenantPolicy(
          token,
          userResolution.user,
          initialConfigOptions,
          getAppConfig,
        ))
      ) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (Object.keys(userResolution.updateData).length > 0) {
        await updateUser(userResolution.user.id, userResolution.updateData);
      }

      req.user = userResolution.user;
      return next();
    } catch (err) {
      logger.error('[remoteAgentAuth] Unexpected error', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
  };
  return handler;
}
