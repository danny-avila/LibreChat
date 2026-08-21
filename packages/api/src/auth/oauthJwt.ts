import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { isRemoteOidcUrlAllowed } from 'librechat-data-provider';
import type { Algorithm, JwtPayload, VerifyOptions } from 'jsonwebtoken';
import type { RequestInit } from 'undici';
import { normalizeOpenIdIssuer } from './openid';
import { isEnabled, math } from '~/utils';

export type OAuthJwtIssuerConfig = {
  issuer: string;
  audience?: string;
  jwksUri?: string;
};

export type ScopeClaim = string | string[] | undefined;

type JwksCacheOptions = {
  enabled: boolean;
  maxAge: number;
};

type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

const OAUTH_DISCOVERY_TIMEOUT_MS = 10000;
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

export function clearOAuthJwtVerifierCache(): void {
  jwksUriCache.clear();
  jwksClientCache.clear();
}

export function extractBearer(authHeader: string | undefined): string | null {
  const match = authHeader?.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1] ?? null;
}

export function splitScopes(scopes: string): string[] {
  return scopes.trim().split(/\s+/).filter(Boolean);
}

export function getTokenScopes(scopeClaim: ScopeClaim): string[] {
  if (Array.isArray(scopeClaim)) return scopeClaim.flatMap(splitScopes);
  return scopeClaim ? splitScopes(scopeClaim) : [];
}

export function hasRequiredScopes(requiredScope: string | undefined, payload: JwtPayload): boolean {
  if (!requiredScope) return true;

  const requiredScopes = splitScopes(requiredScope);
  if (requiredScopes.length === 0) return true;

  const rawScope = (payload['scp'] ?? payload['scope']) as ScopeClaim;
  const tokenScopes = getTokenScopes(rawScope);
  return requiredScopes.every((scope) => tokenScopes.includes(scope));
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
  const normalizedIssuer = normalizeOpenIdIssuer(
    ensureRemoteOidcUrlAllowed(issuer, 'OAuth issuer'),
  );
  if (!normalizedIssuer) throw new Error('OAuth issuer is required');

  const discoveryUrl = `${normalizedIssuer}/.well-known/openid-configuration`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OAUTH_DISCOVERY_TIMEOUT_MS);

  try {
    const res = await undiciFetch(discoveryUrl, buildDiscoveryOptions(controller));
    if (!res.ok) throw new Error(`OAuth discovery failed: ${res.status} ${res.statusText}`);

    const meta = (await res.json()) as { jwks_uri?: string };
    if (!meta.jwks_uri) throw new Error('OAuth discovery response missing jwks_uri');

    return ensureRemoteOidcUrlAllowed(meta.jwks_uri, 'OAuth JWKS URI');
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveJwksUri(
  issuerConfig: OAuthJwtIssuerConfig,
  cacheOptions: JwksCacheOptions,
): Promise<string> {
  if (issuerConfig.jwksUri) {
    return ensureRemoteOidcUrlAllowed(issuerConfig.jwksUri, 'OAuth JWKS URI');
  }

  if (!cacheOptions.enabled) return discoverJwksUri(issuerConfig.issuer);

  const cacheKey = issuerConfig.issuer;
  const cached = jwksUriCache.get(cacheKey);
  if (cached != null && cached.expiresAt > Date.now()) return cached.promise;
  if (cached != null) jwksUriCache.delete(cacheKey);

  const promise = discoverJwksUri(issuerConfig.issuer).catch((err) => {
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

async function getJwksClient(issuerConfig: OAuthJwtIssuerConfig): Promise<jwksRsa.JwksClient> {
  const cacheOptions = getJwksCacheOptions();
  const uri = await resolveJwksUri(issuerConfig, cacheOptions);

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

function getVerifyOptions(issuerConfig: OAuthJwtIssuerConfig): VerifyOptions {
  const normalizedIssuer = normalizeOpenIdIssuer(issuerConfig.issuer);
  const issuer =
    normalizedIssuer && normalizedIssuer !== issuerConfig.issuer
      ? [issuerConfig.issuer, normalizedIssuer]
      : issuerConfig.issuer;

  return {
    algorithms: JWT_ALGORITHMS,
    ...(issuerConfig.audience ? { audience: issuerConfig.audience } : {}),
    issuer,
  };
}

function verifyJwt(
  token: string,
  signingKey: jwksRsa.SigningKey,
  issuerConfig: OAuthJwtIssuerConfig,
): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, signingKey.getPublicKey(), getVerifyOptions(issuerConfig), (err, payload) => {
      if (err != null || payload == null) return reject(err ?? new Error('Empty payload'));
      if (typeof payload === 'string') return reject(new Error('Invalid JWT payload'));
      resolve(payload);
    });
  });
}

async function verifyWithSigningKeys(
  token: string,
  signingKeys: jwksRsa.SigningKey[],
  issuerConfig: OAuthJwtIssuerConfig,
): Promise<JwtPayload> {
  let lastError: Error | null = null;

  for (const signingKey of signingKeys) {
    try {
      return await verifyJwt(token, signingKey, issuerConfig);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('No signing keys in JWKS');
}

export async function verifyOAuthJwtBearer(
  token: string,
  issuerConfig: OAuthJwtIssuerConfig,
): Promise<JwtPayload> {
  ensureRemoteOidcUrlAllowed(issuerConfig.issuer, 'OAuth issuer');

  const decoded = jwt.decode(token, { complete: true });
  if (decoded == null || typeof decoded === 'string') throw new Error('Invalid JWT: cannot decode');

  const kid = typeof decoded.header?.kid === 'string' ? decoded.header.kid : undefined;
  const client = await getJwksClient(issuerConfig);

  if (kid != null) {
    const signingKey = await client.getSigningKey(kid);
    return verifyJwt(token, signingKey, issuerConfig);
  }

  return verifyWithSigningKeys(token, await client.getSigningKeys(), issuerConfig);
}
