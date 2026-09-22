import { logger, encryptV2, decryptV2 } from '@librechat/data-schemas';
import type { AppConfig, OIDCTokens, TokenMethods } from '@librechat/data-schemas';
import type { HostUpstreamTokenProviderResolver, ScheduledTokenIdentity } from './mcp';
import type { UpstreamTokenProvider } from '../mcp/oauth/obo';
import type { OpenIDRefreshParams } from '../auth/refresh';
import type { GetAppConfigOptions } from '../app/service';
import { OPENID_EXPIRY_BUFFER_SECONDS, normalizeExpiresIn } from '../oauth/expiry';
import { getAppConfigOptionsFromUser } from '../app/service';
import { buildOpenIDRefreshParams } from '../auth/refresh';
import { OpenIDReauthRequiredError } from '../utils/oidc';
import { isAbortError } from '../utils/errors';
import { isEnabled } from '../utils/common';

export const UNATTENDED_OPENID_TOKEN_TYPE = 'openid_offline';
export const UNATTENDED_OPENID_TOKEN_IDENTIFIER = 'openid:offline';
const UNATTENDED_OPENID_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

interface StoredUnattendedOpenIDTokens {
  refresh_token: string;
  access_token?: string;
  id_token?: string;
  expires_at?: number;
}

interface StoredUnattendedOpenIDMetadata {
  openidSubject?: string;
  openidIssuer?: string;
  tenantId?: string;
}

export interface UnattendedOpenIDTokenDeps {
  findToken: TokenMethods['findToken'];
  updateToken: TokenMethods['updateToken'];
  createToken: TokenMethods['createToken'];
  deleteTokens: TokenMethods['deleteTokens'];
  getAppConfig: (options: GetAppConfigOptions) => Promise<AppConfig | undefined>;
  getOpenIdConfig: () => object;
  refreshTokenGrant: (
    config: object,
    refreshToken: string,
    params: OpenIDRefreshParams,
  ) => Promise<{
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    expires_in?: number | string;
    expires_at?: number;
  }>;
}

function resolveUserId(user: ScheduledTokenIdentity): string | undefined {
  const id = user.id?.trim();
  return id ? id : undefined;
}

function isOpenIDIdentity(user: ScheduledTokenIdentity): boolean {
  return user.provider === 'openid' || Boolean(user.openidId);
}

function readMetadata(
  metadata: Map<string, unknown> | Record<string, unknown> | null | undefined,
): StoredUnattendedOpenIDMetadata {
  if (!metadata) return {};
  const record = metadata instanceof Map ? Object.fromEntries(metadata) : metadata;
  return {
    ...(typeof record.openidSubject === 'string' ? { openidSubject: record.openidSubject } : {}),
    ...(typeof record.openidIssuer === 'string' ? { openidIssuer: record.openidIssuer } : {}),
    ...(typeof record.tenantId === 'string' ? { tenantId: record.tenantId } : {}),
  };
}

function identityMatches(
  user: ScheduledTokenIdentity,
  metadata: StoredUnattendedOpenIDMetadata,
): boolean {
  if (metadata.openidSubject && user.openidId && metadata.openidSubject !== user.openidId) {
    return false;
  }
  if (metadata.openidIssuer && user.openidIssuer && metadata.openidIssuer !== user.openidIssuer) {
    return false;
  }
  if (metadata.tenantId && user.tenantId && metadata.tenantId !== user.tenantId) {
    return false;
  }
  return true;
}

function isAccessTokenFresh(tokens: OIDCTokens): boolean {
  if (!tokens.access_token) return false;
  if (tokens.expires_at == null) return false;
  return Math.floor(Date.now() / 1000) < tokens.expires_at - OPENID_EXPIRY_BUFFER_SECONDS;
}

function isInvalidGrant(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'error' in error
      ? String((error as { error?: unknown }).error ?? '')
      : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /invalid_grant|invalid_token|expired_token/i.test(`${code} ${message}`);
}

function toStoredExpiresAt(tokens: {
  expires_at?: number;
  expires_in?: number | string;
}): number | undefined {
  if (typeof tokens.expires_at === 'number' && Number.isFinite(tokens.expires_at)) {
    return tokens.expires_at > 1e12 ? Math.floor(tokens.expires_at / 1000) : tokens.expires_at;
  }
  const expiresIn = normalizeExpiresIn(tokens.expires_in);
  return expiresIn != null ? Math.floor(Date.now() / 1000) + expiresIn : undefined;
}

export function isUnattendedOpenIDTokensEnabled(config?: AppConfig | null): boolean {
  const schedules = config?.interfaceConfig?.schedules;
  if (schedules == null || schedules === false || schedules === true) return false;
  return schedules.unattendedOpenIDTokens === true;
}

function tokenQuery(userId: string) {
  return {
    userId,
    type: UNATTENDED_OPENID_TOKEN_TYPE,
    identifier: UNATTENDED_OPENID_TOKEN_IDENTIFIER,
  };
}

async function readStoredTokens(
  deps: UnattendedOpenIDTokenDeps,
  user: ScheduledTokenIdentity,
): Promise<StoredUnattendedOpenIDTokens | undefined> {
  const userId = resolveUserId(user);
  if (!userId) return;
  const record = await deps.findToken(tokenQuery(userId));
  if (!record?.token) return;
  if (!identityMatches(user, readMetadata(record.metadata))) {
    logger.warn('[unattended OpenID] Stored refresh token identity does not match the owner');
    return;
  }
  try {
    const parsed = JSON.parse(await decryptV2(record.token)) as StoredUnattendedOpenIDTokens;
    if (typeof parsed?.refresh_token !== 'string' || parsed.refresh_token.length === 0) return;
    return parsed;
  } catch (error) {
    logger.warn('[unattended OpenID] Failed to decrypt stored refresh token', error);
    throw error;
  }
}

async function writeStoredTokens(
  deps: UnattendedOpenIDTokenDeps,
  user: ScheduledTokenIdentity,
  tokens: StoredUnattendedOpenIDTokens,
): Promise<void> {
  const userId = resolveUserId(user);
  if (!userId || !tokens.refresh_token) return;
  const encrypted = await encryptV2(JSON.stringify(tokens));
  const query = tokenQuery(userId);
  const metadata: Record<string, unknown> = {
    ...(user.openidId ? { openidSubject: user.openidId } : {}),
    ...(user.openidIssuer ? { openidIssuer: user.openidIssuer } : {}),
    ...(user.tenantId ? { tenantId: user.tenantId } : {}),
  };
  const payload = {
    ...query,
    token: encrypted,
    expiresIn: UNATTENDED_OPENID_TOKEN_TTL_SECONDS,
    metadata,
  };
  const existing = await deps.findToken(query);
  if (existing) {
    await deps.updateToken(query, payload);
    return;
  }
  await deps.createToken(payload);
}

async function dropStoredTokens(
  deps: UnattendedOpenIDTokenDeps,
  user: ScheduledTokenIdentity,
): Promise<void> {
  const userId = resolveUserId(user);
  if (!userId) return;
  await deps.deleteTokens(tokenQuery(userId));
}

function createUnattendedOpenIDTokenProvider(
  deps: UnattendedOpenIDTokenDeps,
  user: ScheduledTokenIdentity,
): UpstreamTokenProvider {
  let pending: Promise<OIDCTokens> | undefined;
  return async (options) => {
    const signal = options?.signal;
    signal?.throwIfAborted();
    const run = async (): Promise<OIDCTokens> => {
      signal?.throwIfAborted();
      const stored = await readStoredTokens(deps, user);
      signal?.throwIfAborted();
      if (!stored) {
        throw new OpenIDReauthRequiredError(
          'No stored OpenID refresh token is available for unattended MCP authentication.',
        );
      }
      if (!options?.forceRefresh && isAccessTokenFresh(stored)) {
        return stored;
      }
      let tokenset: Awaited<ReturnType<UnattendedOpenIDTokenDeps['refreshTokenGrant']>>;
      try {
        tokenset = await deps.refreshTokenGrant(
          deps.getOpenIdConfig(),
          stored.refresh_token,
          buildOpenIDRefreshParams(),
        );
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw error;
        if (isInvalidGrant(error)) {
          await dropStoredTokens(deps, user);
          const reauth = new OpenIDReauthRequiredError(
            'The stored OpenID refresh token was rejected. Please sign in again.',
          );
          reauth.cause = error;
          throw reauth;
        }
        throw error;
      }
      signal?.throwIfAborted();
      if (!tokenset?.access_token) {
        throw new OpenIDReauthRequiredError(
          'The identity provider returned no access token for the unattended refresh.',
        );
      }
      const next: StoredUnattendedOpenIDTokens = {
        refresh_token: tokenset.refresh_token || stored.refresh_token,
        access_token: tokenset.access_token,
        id_token: tokenset.id_token || stored.id_token,
        expires_at: toStoredExpiresAt(tokenset),
      };
      await writeStoredTokens(deps, user, next);
      return next;
    };
    if (pending) return pending;
    const lookup = run().finally(() => {
      if (pending === lookup) pending = undefined;
    });
    pending = lookup;
    return lookup;
  };
}

/** Writes the owner's OpenID refresh token when unattended scheduled OBO is enabled. */
export async function persistUnattendedOpenIDTokens(
  deps: UnattendedOpenIDTokenDeps,
  user: ScheduledTokenIdentity,
  tokens: OIDCTokens | null | undefined,
): Promise<void> {
  try {
    if (!isEnabled(process.env.OPENID_REUSE_TOKENS)) return;
    if (!resolveUserId(user) || !tokens?.refresh_token) return;
    const config = await deps.getAppConfig(getAppConfigOptionsFromUser(user, user.tenantId));
    if (!isUnattendedOpenIDTokensEnabled(config)) return;
    await writeStoredTokens(deps, user, {
      refresh_token: tokens.refresh_token,
      ...(tokens.access_token ? { access_token: tokens.access_token } : {}),
      ...(tokens.id_token ? { id_token: tokens.id_token } : {}),
      expires_at: toStoredExpiresAt(tokens),
    });
  } catch (error) {
    logger.warn('[unattended OpenID] Failed to persist refresh token', error);
  }
}

/** Default host resolver: loads a durable OpenID refresh token and redeems it unattended. */
export function createHostUpstreamTokenProviderResolver(
  deps: UnattendedOpenIDTokenDeps,
): HostUpstreamTokenProviderResolver {
  return async (user, options) => {
    options?.signal?.throwIfAborted();
    if (!isEnabled(process.env.OPENID_REUSE_TOKENS) || !isOpenIDIdentity(user)) {
      return undefined;
    }
    const config = await deps.getAppConfig(getAppConfigOptionsFromUser(user, user.tenantId));
    options?.signal?.throwIfAborted();
    if (!isUnattendedOpenIDTokensEnabled(config)) return undefined;
    return createUnattendedOpenIDTokenProvider(deps, user);
  };
}
