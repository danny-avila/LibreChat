import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { logger } from '@librechat/data-schemas';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SystemRoles } from 'librechat-data-provider';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import type { AppConfig, IUser, UserMethods } from '@librechat/data-schemas';
import type { Algorithm, JwtPayload, VerifyOptions } from 'jsonwebtoken';
import type { TAgentsEndpoint } from 'librechat-data-provider';
import type { RequestInit } from 'undici';
import { findOpenIDUser } from '../auth/openid';
import { isEnabled, math } from '~/utils';

export interface RemoteAgentAuthDeps {
  apiKeyMiddleware: RequestHandler;
  findUser: UserMethods['findUser'];
  updateUser: UserMethods['updateUser'];
  getAppConfig: () => Promise<AppConfig | null>;
}

type OidcConfig = NonNullable<
  NonNullable<NonNullable<TAgentsEndpoint['remoteApi']>['auth']>['oidc']
>;

type EnabledOidcConfig = OidcConfig & { issuer: string };
type JwksCacheOptions = {
  enabled: boolean;
  maxAge: number;
};
type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};
type UserResolution =
  | { status: 'resolved'; user: IUser }
  | { status: 'missing' }
  | { status: 'rejected'; error: string };

const OIDC_DISCOVERY_TIMEOUT_MS = 10000;
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

function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

function getEmail(payload: JwtPayload): string | undefined {
  return (
    (payload['email'] as string | undefined) ??
    (payload['preferred_username'] as string | undefined) ??
    (payload['upn'] as string | undefined)
  );
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

async function discoverJwksUri(issuer: string): Promise<string> {
  const normalizedIssuer = issuer.replace(/\/$/, '');
  const discoveryUrl = `${normalizedIssuer}/.well-known/openid-configuration`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OIDC_DISCOVERY_TIMEOUT_MS);

  try {
    const res = await undiciFetch(discoveryUrl, buildDiscoveryOptions(controller));
    if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status} ${res.statusText}`);

    const meta = (await res.json()) as { jwks_uri?: string };
    if (!meta.jwks_uri) throw new Error('OIDC discovery response missing jwks_uri');

    return meta.jwks_uri;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveJwksUri(
  oidcConfig: EnabledOidcConfig,
  cacheOptions: JwksCacheOptions,
): Promise<string> {
  if (oidcConfig.jwksUri) return oidcConfig.jwksUri;
  if (process.env.OPENID_JWKS_URL) return process.env.OPENID_JWKS_URL;

  if (!cacheOptions.enabled) return discoverJwksUri(oidcConfig.issuer);

  const cacheKey = oidcConfig.issuer;
  const cached = jwksUriCache.get(cacheKey);
  if (cached != null && cached.expiresAt > Date.now()) return cached.promise;
  if (cached != null) jwksUriCache.delete(cacheKey);

  const promise = discoverJwksUri(oidcConfig.issuer).catch((err) => {
    jwksUriCache.delete(cacheKey);
    throw err;
  });

  jwksUriCache.set(cacheKey, {
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

  const promise = Promise.resolve()
    .then(() => buildJwksClient(uri, cacheOptions))
    .catch((err) => {
      jwksClientCache.delete(cacheKey);
      throw err;
    });

  jwksClientCache.set(cacheKey, {
    promise,
    expiresAt: Date.now() + cacheOptions.maxAge,
  });
  return promise;
}

function getVerifyOptions(oidcConfig: EnabledOidcConfig): VerifyOptions {
  return {
    algorithms: JWT_ALGORITHMS,
    issuer: oidcConfig.issuer,
    ...(oidcConfig.audience ? { audience: oidcConfig.audience } : {}),
  };
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
  findUser: UserMethods['findUser'],
  updateUser: UserMethods['updateUser'],
): Promise<UserResolution> {
  const { user, error, migration } = await findOpenIDUser({
    findUser,
    email: getEmail(payload),
    openidId: payload.sub ?? '',
    idOnTheSource: payload['oid'] as string | undefined,
    strategyName: 'remoteAgentAuth',
  });

  if (error != null) return { status: 'rejected', error };
  if (user == null) return { status: 'missing' };

  user.id = String(user._id);

  const updateData: Partial<IUser> = {};

  if (migration && payload.sub != null) {
    updateData.provider = 'openid';
    updateData.openidId = payload.sub;
  }

  if (!user.role) {
    user.role = SystemRoles.USER;
    updateData.role = SystemRoles.USER;
  }

  if (Object.keys(updateData).length > 0) {
    await updateUser(user.id, updateData);
  }

  user.federatedTokens = { access_token: token, expires_at: payload.exp };
  return { status: 'resolved', user };
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
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = await getAppConfig();
      const authConfig = config?.endpoints?.agents?.remoteApi?.auth;
      const apiKeyEnabled = authConfig?.apiKey?.enabled !== false;

      if (authConfig?.oidc?.enabled !== true) {
        if (apiKeyEnabled) return apiKeyMiddleware(req, res, next);
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!authConfig.oidc.issuer) {
        logger.error('[remoteAgentAuth] OIDC issuer is required when OIDC auth is enabled');
        res.status(500).json({ error: 'Internal server error' });
        return;
      }

      const oidcConfig: EnabledOidcConfig = {
        ...authConfig.oidc,
        issuer: authConfig.oidc.issuer,
      };

      const token = extractBearer(req.headers.authorization);
      if (token == null) {
        if (apiKeyEnabled) return apiKeyMiddleware(req, res, next);
        res.status(401).json({ error: 'Bearer token required' });
        return;
      }

      let payload: JwtPayload;

      try {
        payload = await verifyOidcBearer(token, oidcConfig);
        if (oidcConfig.scope != null) {
          const rawScope = payload['scp'] ?? payload['scope'];
          const tokenScopes: string[] = Array.isArray(rawScope)
            ? rawScope
            : ((rawScope as string | undefined)?.split(' ') ?? []);
          if (!tokenScopes.includes(oidcConfig.scope)) {
            logger.warn(`[remoteAgentAuth] Token missing required scope: ${oidcConfig.scope}`);
            if (apiKeyEnabled) return apiKeyMiddleware(req, res, next);
            res.status(401).json({ error: 'Unauthorized' });
            return;
          }
        }
      } catch (oidcErr) {
        logger.error('[remoteAgentAuth] OIDC verification failed:', oidcErr);
        if (apiKeyEnabled) return apiKeyMiddleware(req, res, next);
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const userResolution = await resolveUser(token, payload, findUser, updateUser);

      if (userResolution.status === 'rejected') {
        logger.warn(`[remoteAgentAuth] OpenID user rejected: ${userResolution.error}`);
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (userResolution.status === 'missing') {
        logger.warn('[remoteAgentAuth] OIDC token valid but no matching LibreChat user');
        if (apiKeyEnabled) return apiKeyMiddleware(req, res, next);
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      req.user = userResolution.user;
      return next();
    } catch (err) {
      logger.error('[remoteAgentAuth] Unexpected error', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
  };
}
