import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { SYSTEM_TENANT_ID } from '@librechat/data-schemas';
import type { Algorithm } from 'jsonwebtoken';
import { createTokenMintCache, TOKEN_MINT_CACHE_SECONDS } from '~/crypto/cache';
import { normalizePem } from '~/crypto/keys';

/**
 * Scopes the RAG service recognises, one per capability. `rag:embed` guards its
 * embeddings endpoint and `rag:rerank` its rerank endpoint; both spend
 * inference budget. `rag:documents` guards the stored-chunk routes — reading a
 * file's context, listing ids, deleting a file — and buys no inference at all.
 *
 * Neither plane substitutes for the other, so a token minted to delete a file
 * cannot be replayed against an embedding provider. A strict token carrying no
 * scope at all is refused, so every call path names the scopes it actually uses
 * instead of receiving a blanket grant.
 */
export const RagScopes = {
  embed: 'rag:embed',
  rerank: 'rag:rerank',
  documents: 'rag:documents',
} as const;

export type RagScope = (typeof RagScopes)[keyof typeof RagScopes];

/** Tenant recorded for deployments that never adopted tenants. */
export const BASE_TENANT_ID = '__BASE__';

export interface RagTokenParams {
  /** Token subject — the acting user's id. */
  userId: string;
  /** Scopes this call needs. */
  scopes: RagScope[];
  /**
   * Entity (agent) ids whose documents this call may reach. Pass an empty
   * array when the call has no entity context: that is a statement about the
   * call, not a default, and it keeps the token scoped to the user's own
   * documents.
   */
  entityIds: Array<string | null | undefined>;
  /** Tenant the call acts within. Falls back to the base tenant. */
  tenantId?: string | null;
}

interface RagSigningConfig {
  key: string;
  algorithm: Algorithm;
  issuer: string;
  audience: string;
  kid: string;
  ttlSeconds: number;
}

/**
 * The claims this side authors. `entities` is omitted rather than sent empty:
 * absent means the call carries no entity context and stays scoped to the
 * user's own documents, which is a narrower statement than an empty list.
 */
interface RagPayload {
  tenant: string;
  scopes: string[];
  entities?: string[];
}

const DEFAULT_ISSUER = 'librechat';
const DEFAULT_AUDIENCE = 'rag_api';
const DEFAULT_KID = 'lc-rag-2026-08';
const DEFAULT_TTL_SECONDS = 300;
/**
 * Ceiling on a minted token's lifetime. `RAG_JWT_TTL_SECONDS` can only lower
 * it: the lifetime is a property of the deployment rather than of the caller,
 * so no call path can widen its own token past what the operator allows.
 */
const MAX_TTL_SECONDS = 300;
const LEGACY_EXPIRY = '5m';
const MIN_HMAC_SECRET_LENGTH = 32;

const TRUTHY_VALUES: ReadonlySet<string> = new Set(['true', '1', 'yes', 'on', 'y']);

/**
 * Every algorithm the pinned `jsonwebtoken` can both sign and verify. `EdDSA`
 * is deliberately absent: the pinned `jws`/`jwa` implementation has no Ed25519
 * signer, so offering it would accept a configuration that then throws on the
 * first mint. `jwt.spec.ts` signs and verifies a real key of the matching type
 * for every entry below, so nothing can be listed here without being exercised.
 */
const HMAC_ALGORITHMS: ReadonlySet<Algorithm> = new Set<Algorithm>(['HS256', 'HS384', 'HS512']);
const ASYMMETRIC_ALGORITHMS: ReadonlySet<Algorithm> = new Set<Algorithm>([
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
]);

/**
 * Case-insensitive lookup from configured value to the exact spelling
 * `jsonwebtoken` expects. Matching on an upper-cased copy rather than
 * upper-casing the value itself keeps mixed-case algorithm names (the JOSE
 * registry has them) resolvable instead of silently unmatchable.
 */
const ALGORITHMS_BY_UPPERCASE: ReadonlyMap<string, Algorithm> = new Map(
  [...HMAC_ALGORITHMS, ...ASYMMETRIC_ALGORITHMS].map((algorithm) => [
    algorithm.toUpperCase(),
    algorithm,
  ]),
);

export const supportedRagAlgorithms = (): Algorithm[] => [...ALGORITHMS_BY_UPPERCASE.values()];

/**
 * Mirrors the RAG service's own `RAG_AUTH_ACCEPT_LEGACY` parsing so both sides
 * of the migration read the flag identically.
 */
const acceptsLegacyTokens = (): boolean =>
  TRUTHY_VALUES.has((process.env.RAG_AUTH_ACCEPT_LEGACY ?? 'true').trim().toLowerCase());

const configuredIssuer = (): string => (process.env.RAG_JWT_ISSUER ?? DEFAULT_ISSUER).trim();

const configuredAudience = (): string => (process.env.RAG_JWT_AUDIENCE ?? DEFAULT_AUDIENCE).trim();

/**
 * Key id stamped into every token header so the RAG service can hold more than
 * one trusted key at a time. Rotation is then additive on the verifying side —
 * publish the new key alongside the old, move the minter, retire the old one —
 * instead of a synchronised restart of both services.
 */
const configuredKid = (): string => (process.env.RAG_JWT_KID ?? '').trim() || DEFAULT_KID;

const parseCappedSeconds = (value: string | undefined, fallback: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
};

/**
 * The audience RAG tokens carry. Blank configuration falls back to the default
 * so the audience rejection in the application's own JWT strategy can never be
 * silently disabled by an empty environment variable.
 */
export const getRagAudience = (): string => configuredAudience() || DEFAULT_AUDIENCE;

/**
 * Whether a decoded token's `aud` claim marks it as minted for the RAG service.
 * Such a token is never a valid application session token, even if it somehow
 * verifies — the two are signed with separate keys precisely so that neither
 * can stand in for the other.
 */
export const isRagAudience = (audience?: string | string[] | null): boolean => {
  if (audience == null) {
    return false;
  }
  const ragAudience = getRagAudience();
  if (Array.isArray(audience)) {
    return audience.some((entry) => entry === ragAudience);
  }
  return audience === ragAudience;
};

/**
 * Resolves the dedicated signing configuration, or `null` when the deployment
 * has not adopted one yet and legacy tokens are still accepted.
 *
 * Every failure mode throws rather than degrading to `JWT_SECRET`: sharing that
 * key would make every RAG token a full application session token and vice
 * versa, which is the whole reason the dedicated key exists.
 */
function buildSigningConfig(): RagSigningConfig | null {
  const configured = (process.env.RAG_JWT_ALGORITHM ?? 'HS256').trim();
  const algorithm = ALGORITHMS_BY_UPPERCASE.get(configured.toUpperCase());

  if (!algorithm) {
    throw new Error(`[generateShortLivedToken] RAG_JWT_ALGORITHM '${configured}' is not supported`);
  }

  const isHmac = HMAC_ALGORITHMS.has(algorithm);
  const keyVariable = isHmac ? 'RAG_JWT_SECRET' : 'RAG_JWT_PRIVATE_KEY';
  const key = isHmac ? process.env.RAG_JWT_SECRET : process.env.RAG_JWT_PRIVATE_KEY;

  if (!key) {
    if (!acceptsLegacyTokens()) {
      throw new Error(
        `[generateShortLivedToken] RAG_AUTH_ACCEPT_LEGACY=false requires ${keyVariable}`,
      );
    }
    if (!isHmac) {
      throw new Error(
        `[generateShortLivedToken] RAG_JWT_ALGORITHM '${algorithm}' requires ${keyVariable}`,
      );
    }
    return null;
  }

  if (isHmac) {
    if (key === process.env.JWT_SECRET) {
      throw new Error(
        '[generateShortLivedToken] RAG_JWT_SECRET must differ from JWT_SECRET: sharing the key makes every RAG token a full application session token and vice versa',
      );
    }
    if (key.length < MIN_HMAC_SECRET_LENGTH) {
      throw new Error(
        `[generateShortLivedToken] RAG_JWT_SECRET must be at least ${MIN_HMAC_SECRET_LENGTH} characters for ${algorithm}`,
      );
    }
  }

  /**
   * An HMAC secret is opaque bytes and has to reach the signer exactly as the
   * RAG service reads it; a PEM is structured text that environments routinely
   * flatten to one line with literal `\n` escapes, which Node's key parser
   * rejects.
   */
  const signingKey = isHmac ? key : normalizePem(key);

  const issuer = configuredIssuer();
  if (!issuer) {
    throw new Error('[generateShortLivedToken] RAG_JWT_ISSUER must not be empty');
  }

  const audience = configuredAudience();
  if (!audience) {
    throw new Error('[generateShortLivedToken] RAG_JWT_AUDIENCE must not be empty');
  }

  return {
    key: signingKey,
    algorithm,
    issuer,
    audience,
    kid: configuredKid(),
    ttlSeconds: parseCappedSeconds(
      process.env.RAG_JWT_TTL_SECONDS,
      DEFAULT_TTL_SECONDS,
      MAX_TTL_SECONDS,
    ),
  };
}

/**
 * The environment values the signing configuration is derived from. Comparing
 * this against the cached copy is what makes rebuilding cheap while still
 * reacting to a rotated key or a changed algorithm within the process.
 */
const signingConfigFingerprint = (): string =>
  JSON.stringify([
    process.env.RAG_JWT_ALGORITHM,
    process.env.RAG_JWT_SECRET,
    process.env.RAG_JWT_PRIVATE_KEY,
    process.env.RAG_JWT_ISSUER,
    process.env.RAG_JWT_AUDIENCE,
    process.env.RAG_JWT_KID,
    process.env.RAG_JWT_TTL_SECONDS,
    process.env.RAG_AUTH_ACCEPT_LEGACY,
    process.env.JWT_SECRET,
  ]);

let cachedFingerprint: string | null = null;
let cachedSigningConfig: RagSigningConfig | null = null;
const tokenCache = createTokenMintCache();

/**
 * Resolves the dedicated signing configuration, or `null` when the deployment
 * has not adopted one yet and legacy tokens are still accepted.
 *
 * The result is memoised against the environment it came from, so validation
 * runs once per configuration rather than once per mint. Any change invalidates
 * the minted-token cache as well — a token signed with a retired key must never
 * outlive the key itself.
 */
function resolveSigningConfig(): RagSigningConfig | null {
  const fingerprint = signingConfigFingerprint();
  if (fingerprint === cachedFingerprint) {
    return cachedSigningConfig;
  }

  const config = buildSigningConfig();
  cachedFingerprint = fingerprint;
  cachedSigningConfig = config;
  tokenCache.clear();
  return config;
}

function signLegacyToken(userId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      '[generateShortLivedToken] Neither RAG_JWT_SECRET nor JWT_SECRET is set; refusing to mint an unsigned token',
    );
  }
  return jwt.sign({ id: userId }, secret, { expiresIn: LEGACY_EXPIRY, algorithm: 'HS256' });
}

const uniqueValues = (values: Array<string | null | undefined>): string[] => {
  const collected = new Set<string>();
  for (const value of values) {
    if (value) {
      collected.add(value);
    }
  }
  return [...collected];
};

/**
 * Identifies a token by everything that distinguishes what it may do, so a
 * cached token is only ever handed back to a call that would have minted the
 * same claims. The signing material is deliberately absent: a change there
 * empties the cache outright rather than partitioning it.
 */
const mintCacheKey = (config: RagSigningConfig, subject: string, payload: RagPayload): string =>
  JSON.stringify([
    config.algorithm,
    config.kid,
    config.issuer,
    config.audience,
    subject,
    payload.tenant,
    payload.scopes,
    payload.entities ?? [],
  ]);

/**
 * Mints a short-lived bearer token for the RAG service.
 *
 * With a dedicated signing key configured the token carries the strict claim
 * set — issuer, audience, subject, expiry, key id, token id, tenant, scopes and
 * the entity ids the call may act for. Without one it keeps minting the
 * `{ id }` shape older RAG deployments accept, so an upgrade can be staged:
 * point both sides at the dedicated key first, then stop accepting the legacy
 * shape.
 *
 * Tokens are reused for a bounded window. Paths that mint per file — reading
 * attachment context, deleting a file's chunks — would otherwise pay for a
 * signature per file, which is far from free under the RSA and PSS algorithms.
 */
export const generateShortLivedToken = ({
  userId,
  scopes,
  entityIds,
  tenantId,
}: RagTokenParams): string => {
  if (!userId) {
    throw new Error('[generateShortLivedToken] A user id is required');
  }

  const config = resolveSigningConfig();
  if (!config) {
    return signLegacyToken(userId);
  }

  const grantedScopes = uniqueValues(scopes);
  if (grantedScopes.length === 0) {
    throw new Error('[generateShortLivedToken] At least one scope is required');
  }

  const tenant = tenantId?.trim() || BASE_TENANT_ID;
  if (tenant === SYSTEM_TENANT_ID) {
    throw new Error('[generateShortLivedToken] The system tenant may not call the RAG service');
  }

  const entities = uniqueValues(entityIds);
  const payload: RagPayload =
    entities.length > 0
      ? { tenant, scopes: grantedScopes, entities }
      : { tenant, scopes: grantedScopes };

  const now = Math.floor(Date.now() / 1000);
  const cacheKey = mintCacheKey(config, userId, payload);
  const cached = tokenCache.get(cacheKey, now);
  if (cached) {
    return cached;
  }

  const token = signRagToken(config, userId, payload);
  tokenCache.set(cacheKey, token, now + config.ttlSeconds, now, TOKEN_MINT_CACHE_SECONDS);
  return token;
};

function signRagToken(config: RagSigningConfig, subject: string, payload: RagPayload): string {
  return jwt.sign(payload, config.key, {
    algorithm: config.algorithm,
    expiresIn: config.ttlSeconds,
    issuer: config.issuer,
    audience: config.audience,
    subject,
    keyid: config.kid,
    jwtid: randomUUID(),
    notBefore: 0,
  });
}
