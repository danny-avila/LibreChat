import jwt from 'jsonwebtoken';
import { SYSTEM_TENANT_ID } from '@librechat/data-schemas';
import type { Algorithm } from 'jsonwebtoken';

/**
 * Scopes the RAG service recognises. `rag:embed` guards its embeddings
 * endpoint, `rag:rerank` its rerank endpoint. A strict token carrying no scope
 * at all is refused, so every call path names the scopes it actually uses
 * instead of receiving a blanket grant.
 */
export const RagScopes = {
  embed: 'rag:embed',
  rerank: 'rag:rerank',
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
  expireIn?: string;
}

interface RagSigningConfig {
  key: string;
  algorithm: Algorithm;
  issuer: string;
  audience: string;
}

const DEFAULT_ISSUER = 'librechat';
const DEFAULT_AUDIENCE = 'rag_api';
const DEFAULT_EXPIRY = '5m';
const MIN_HMAC_SECRET_LENGTH = 32;

const TRUTHY_VALUES: ReadonlySet<string> = new Set(['true', '1', 'yes', 'on', 'y']);

const HMAC_ALGORITHMS: ReadonlySet<string> = new Set(['HS256', 'HS384', 'HS512']);
const ASYMMETRIC_ALGORITHMS: ReadonlySet<string> = new Set([
  'RS256',
  'RS384',
  'RS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
]);

/**
 * Mirrors the RAG service's own `RAG_AUTH_ACCEPT_LEGACY` parsing so both sides
 * of the migration read the flag identically.
 */
const acceptsLegacyTokens = (): boolean =>
  TRUTHY_VALUES.has((process.env.RAG_AUTH_ACCEPT_LEGACY ?? 'true').trim().toLowerCase());

const configuredIssuer = (): string => (process.env.RAG_JWT_ISSUER ?? DEFAULT_ISSUER).trim();

const configuredAudience = (): string => (process.env.RAG_JWT_AUDIENCE ?? DEFAULT_AUDIENCE).trim();

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
function resolveSigningConfig(): RagSigningConfig | null {
  const algorithm = (process.env.RAG_JWT_ALGORITHM ?? 'HS256').trim().toUpperCase() as Algorithm;
  const isHmac = HMAC_ALGORITHMS.has(algorithm);

  if (!isHmac && !ASYMMETRIC_ALGORITHMS.has(algorithm)) {
    throw new Error(`[generateShortLivedToken] RAG_JWT_ALGORITHM '${algorithm}' is not supported`);
  }

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

  const issuer = configuredIssuer();
  if (!issuer) {
    throw new Error('[generateShortLivedToken] RAG_JWT_ISSUER must not be empty');
  }

  const audience = configuredAudience();
  if (!audience) {
    throw new Error('[generateShortLivedToken] RAG_JWT_AUDIENCE must not be empty');
  }

  return { key, algorithm, issuer, audience };
}

function signLegacyToken(userId: string, expireIn: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      '[generateShortLivedToken] Neither RAG_JWT_SECRET nor JWT_SECRET is set; refusing to mint an unsigned token',
    );
  }
  return jwt.sign({ id: userId }, secret, { expiresIn: expireIn, algorithm: 'HS256' });
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
 * Mints a short-lived bearer token for the RAG service.
 *
 * With a dedicated signing key configured the token carries the strict claim
 * set — issuer, audience, subject, expiry, tenant, scopes and the entity ids
 * the call may act for. Without one it keeps minting the `{ id }` shape older
 * RAG deployments accept, so an upgrade can be staged: point both sides at the
 * dedicated key first, then stop accepting the legacy shape.
 */
export const generateShortLivedToken = ({
  userId,
  scopes,
  entityIds,
  tenantId,
  expireIn = DEFAULT_EXPIRY,
}: RagTokenParams): string => {
  if (!userId) {
    throw new Error('[generateShortLivedToken] A user id is required');
  }

  const config = resolveSigningConfig();
  if (!config) {
    return signLegacyToken(userId, expireIn);
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
  const payload =
    entities.length > 0
      ? { tenant, scopes: grantedScopes, entities }
      : { tenant, scopes: grantedScopes };

  return jwt.sign(payload, config.key, {
    algorithm: config.algorithm,
    expiresIn: expireIn,
    issuer: config.issuer,
    audience: config.audience,
    subject: userId,
  });
};
