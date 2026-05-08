import { Types } from 'mongoose';
import { runAsSystem, logger } from '@librechat/data-schemas';

import type { IUser } from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';
import type { AdminExchangeResponse } from '~/auth/exchange';

import { serializeUserForExchange } from '~/auth/exchange';

const SAFE_USER_PROJECTION = '-password -__v -totpSecret -backupCodes';

interface AdminRefreshClaims {
  sub?: string;
  exp?: number;
}

/**
 * The minimal shape this module needs from an `openid-client` tokenset.
 * Avoids a hard import dependency on `openid-client` types in this package.
 */
export interface RefreshTokenset {
  access_token?: string;
  refresh_token?: string;
  claims: () => AdminRefreshClaims;
}

export interface MintedToken {
  /** Bearer the admin panel will send on subsequent requests. */
  token: string;
  /** Absolute expiry of `token` (ms epoch). Drives the admin panel's proactive refresh. */
  expiresAt: number;
}

export interface AdminRefreshDeps {
  findUsers: (
    filter: FilterQuery<IUser>,
    projection: string | null,
    options: { sort: Record<string, 1 | -1>; limit: number },
  ) => Promise<IUser[]>;
  getUserById: (id: string, projection: string) => Promise<IUser | null>;
  /**
   * Mints the bearer the admin panel will send on subsequent requests, and
   * reports its absolute expiry. The minter is authoritative for the bearer's
   * lifetime — the helper does not attempt to derive expiry from the IdP's
   * `exp` claim. Default OSS callers pass `generateToken(user, sessionExpiry)`
   * and `Date.now() + sessionExpiry`.
   */
  mintToken: (user: IUser, tokenset: RefreshTokenset) => Promise<MintedToken>;
  /**
   * Optional post-success hook for forks that need to do additional work
   * with the refreshed tokenset and resolved user (e.g. update a server-side
   * token cache or reconcile downstream session state). Errors thrown here
   * propagate to the route handler.
   */
  onRefreshSuccess?: (user: IUser, tokenset: RefreshTokenset) => Promise<void>;
}

export interface AdminRefreshOptions {
  /**
   * Optional user `_id` from the previous admin-panel session. When provided,
   * the resolved user must have a matching `openidId` — otherwise the refresh
   * is rejected as a possible identity-swap attempt.
   */
  userId?: string;
  /**
   * The refresh token the admin panel sent in. Preserved as the response
   * `refreshToken` when the IdP doesn't rotate (Auth0 with rotation off,
   * Microsoft personal accounts in some flows). Without this fallback, the
   * admin panel would receive `undefined` and lose its refresh capability.
   */
  previousRefreshToken?: string;
}

export class AdminRefreshError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AdminRefreshError';
  }
}

async function resolveAdminUser(
  deps: AdminRefreshDeps,
  openidId: string,
  options: AdminRefreshOptions,
): Promise<IUser | undefined> {
  if (options.userId && Types.ObjectId.isValid(options.userId)) {
    const direct = await runAsSystem(() =>
      deps.getUserById(options.userId as string, SAFE_USER_PROJECTION),
    );
    if (direct) {
      if (direct.openidId !== openidId) {
        throw new AdminRefreshError(
          'USER_ID_MISMATCH',
          401,
          'Provided user_id does not match the refreshed identity',
        );
      }
      return direct;
    }
    logger.debug(
      `[adminRefresh] user_id ${options.userId} not found; falling through to openidId lookup`,
    );
  }

  const [user] = await runAsSystem(() =>
    deps.findUsers({ openidId } as FilterQuery<IUser>, SAFE_USER_PROJECTION, {
      sort: { updatedAt: -1 },
      limit: 1,
    }),
  );
  return user;
}

function readClaims(tokenset: RefreshTokenset): AdminRefreshClaims {
  try {
    return tokenset.claims();
  } catch (_err) {
    throw new AdminRefreshError(
      'CLAIMS_INCOMPLETE',
      502,
      'IdP returned a tokenset whose claims could not be read (no id_token?)',
    );
  }
}

/**
 * Looks up the active admin user for a freshly-refreshed OpenID tokenset,
 * mints the bearer the admin panel should send on subsequent requests, and
 * returns the response shape used by `/api/admin/oauth/exchange`.
 *
 * The route handler is responsible for the IdP `refreshTokenGrant` call;
 * this helper takes the resulting tokenset and turns it into an admin-panel
 * exchange response.
 */
export async function applyAdminRefresh(
  tokenset: RefreshTokenset,
  deps: AdminRefreshDeps,
  options: AdminRefreshOptions = {},
): Promise<AdminExchangeResponse> {
  if (!tokenset.access_token) {
    throw new AdminRefreshError(
      'IDP_INCOMPLETE',
      502,
      'IdP returned an incomplete tokenset (missing access_token)',
    );
  }

  const claims = readClaims(tokenset);
  const openidId = claims.sub;
  if (!openidId) {
    throw new AdminRefreshError(
      'CLAIMS_INCOMPLETE',
      502,
      'IdP returned a tokenset missing the required `sub` claim',
    );
  }

  const user = await resolveAdminUser(deps, openidId, options);
  if (!user) {
    throw new AdminRefreshError('USER_NOT_FOUND', 401, 'No user found for the refreshed identity');
  }

  const minted = await deps.mintToken(user, tokenset);

  if (deps.onRefreshSuccess) {
    await deps.onRefreshSuccess(user, tokenset);
  }

  const responseUser = serializeUserForExchange(user);

  logger.debug(`[adminRefresh] Refreshed tokens for user: ${responseUser.email}`);

  return {
    token: minted.token,
    refreshToken: tokenset.refresh_token ?? options.previousRefreshToken,
    user: responseUser,
    expiresAt: minted.expiresAt,
  };
}
