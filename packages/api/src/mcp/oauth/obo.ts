import { logger } from '@librechat/data-schemas';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import type { IUser } from '@librechat/data-schemas';
import { extractOpenIDTokenInfo, isOpenIDTokenValid } from '~/utils/oidc';
import type { MCPOAuthTokens } from './types';

export interface OboConfig {
  scopes: string;
}

/**
 * Function type for performing OBO token exchange.
 * Injected from the main API layer since it requires OpenID configuration and caching.
 */
export type OboTokenResolver = (
  user: IUser,
  accessToken: string,
  scopes: string,
  fromCache?: boolean,
) => Promise<{ access_token: string; expires_in?: number }>;

export type OboTokenResolutionReason =
  | 'missing_upstream_token'
  | 'missing_upstream_access_token'
  | 'empty_exchange_response'
  | 'exchange_failed';

const RETRYABLE_OBO_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_OBO_ERROR_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND']);

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const candidate = error as {
    status?: number;
    statusCode?: number;
    response?: { status?: number };
  };

  return candidate.status ?? candidate.statusCode ?? candidate.response?.status;
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code.toUpperCase() : undefined;
}

function getErrorRetryableFlag(error: unknown): boolean | undefined {
  if (!error || typeof error !== 'object' || !('retryable' in error)) {
    return undefined;
  }

  const retryable = (error as { retryable?: unknown }).retryable;
  return typeof retryable === 'boolean' ? retryable : undefined;
}

export class OboTokenResolutionError extends Error {
  public readonly reason: OboTokenResolutionReason;
  public readonly retryable: boolean;
  public readonly userMessage: string;
  public override readonly cause?: unknown;

  constructor(
    reason: OboTokenResolutionReason,
    userMessage: string,
    retryable = false,
    cause?: unknown,
  ) {
    super(userMessage);
    this.name = 'OboTokenResolutionError';
    this.reason = reason;
    this.retryable = retryable;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

function isRetryableOboExchangeError(error: unknown): boolean {
  const taggedRetryable = getErrorRetryableFlag(error);
  if (taggedRetryable != null) {
    return taggedRetryable;
  }

  const status = getErrorStatus(error);
  if (status != null && RETRYABLE_OBO_STATUS_CODES.has(status)) {
    return true;
  }

  const code = getErrorCode(error);
  if (code != null && RETRYABLE_OBO_ERROR_CODES.has(code)) {
    return true;
  }

  if (!error || typeof error !== 'object' || !('message' in error)) {
    return false;
  }

  const message = String((error as { message?: unknown }).message ?? '').toLowerCase();
  return (
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('socket hang up') ||
    message.includes('temporarily unavailable') ||
    message.includes('too many requests') ||
    message.includes('service unavailable')
  );
}

/**
 * Performs an OBO token exchange for the given user and MCP server OBO config.
 * Returns MCPOAuthTokens suitable for injection into the MCP connection.
 */
export async function resolveOboToken(
  user: IUser,
  oboConfig: OboConfig,
  oboTokenResolver: OboTokenResolver,
): Promise<MCPOAuthTokens> {
  const tokenInfo = extractOpenIDTokenInfo(user);
  if (!tokenInfo || !isOpenIDTokenValid(tokenInfo)) {
    logger.warn(
      `[OBO] No valid OpenID token available for OBO exchange (provider: ${user.provider}, hasOpenidId: ${!!user.openidId}, hasFederatedTokens: ${!!user.federatedTokens})`,
    );
    throw new OboTokenResolutionError(
      'missing_upstream_token',
      'No valid OpenID access token is available for OBO exchange.',
    );
  }

  if (!tokenInfo.accessToken) {
    logger.warn('[OBO] OpenID token info present but access_token is missing');
    throw new OboTokenResolutionError(
      'missing_upstream_access_token',
      'The upstream OpenID access token is missing for OBO exchange.',
    );
  }

  try {
    const response = await oboTokenResolver(user, tokenInfo.accessToken, oboConfig.scopes, true);

    if (!response?.access_token) {
      logger.warn('[OBO] Token exchange did not return an access token');
      throw new OboTokenResolutionError(
        'empty_exchange_response',
        'The identity provider returned no access token for the OBO exchange.',
      );
    }

    const now = Date.now();
    const expiresIn = response.expires_in ?? 3600;

    return {
      access_token: response.access_token,
      token_type: 'Bearer',
      obtained_at: now,
      expires_at: now + expiresIn * 1000,
    };
  } catch (error) {
    if (error instanceof OboTokenResolutionError) {
      throw error;
    }

    logger.error('[OBO] Failed to exchange token:', error);
    const retryable = isRetryableOboExchangeError(error);
    throw new OboTokenResolutionError(
      'exchange_failed',
      retryable
        ? 'Temporary OBO token exchange failure.'
        : 'The identity provider rejected the OBO token exchange.',
      retryable,
      error,
    );
  }
}

/**
 * Re-evaluates whether the original author of a DB-stored OBO config still has
 * permission to configure OBO. The connection layer calls this before performing
 * an OBO token exchange so that retained configs fail closed if the author's role
 * is downgraded after the server was created.
 *
 * Returns true when the author's role grants `MCP_SERVERS.CONFIGURE_OBO`. Any of
 * the following degraded states return false (fail closed):
 *   - missing author id
 *   - user lookup miss / no role
 *   - role lookup miss
 *   - role missing the CONFIGURE_OBO bit
 */
export type GetUserRoleByAuthorId = (authorId: string) => Promise<string | null | undefined>;
export type GetRolePermissions = (
  roleName: string,
) => Promise<Record<string, Record<string, boolean | undefined>> | null | undefined>;

export async function isOboConfigStillTrusted({
  authorId,
  getUserRoleByAuthorId,
  getRolePermissions,
}: {
  authorId: string | undefined;
  getUserRoleByAuthorId: GetUserRoleByAuthorId;
  getRolePermissions: GetRolePermissions;
}): Promise<boolean> {
  if (!authorId) {
    return false;
  }
  let roleName: string | null | undefined;
  try {
    roleName = await getUserRoleByAuthorId(authorId);
  } catch (err) {
    logger.warn('[OBO] Failed to resolve author role for OBO trust check', err);
    return false;
  }
  if (!roleName) {
    return false;
  }
  let permissions: Record<string, Record<string, boolean | undefined>> | null | undefined;
  try {
    permissions = await getRolePermissions(roleName);
  } catch (err) {
    logger.warn('[OBO] Failed to load role permissions for OBO trust check', err);
    return false;
  }
  return permissions?.[PermissionTypes.MCP_SERVERS]?.[Permissions.CONFIGURE_OBO] === true;
}

/**
 * Async predicate injected into MCP runtime to gate OBO exchanges per server.
 * Returns true when OBO is allowed for the given config, false to fail closed.
 *
 * The runtime passes `source`, `author`, and `dbId` so the implementation can
 * use the same `isUserSourced` semantics as the rest of the MCP layer (a
 * missing `source` field on a legacy cached config still falls back to
 * `dbId`-presence heuristics).
 */
export type OboTrustChecker = (config: {
  source?: string;
  author?: string;
  dbId?: string;
}) => Promise<boolean>;
