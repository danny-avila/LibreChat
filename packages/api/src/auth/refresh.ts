import { runAsSystem, logger } from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';
import type { IUser } from '@librechat/data-schemas';
import type { AdminExchangeResponse } from '~/auth/exchange';
import { serializeUserForExchange } from '~/auth/exchange';

interface AdminRefreshClaims {
  sub?: string;
  email?: string;
  exp?: number;
}

/**
 * The minimal shape this module needs from an `openid-client` tokenset.
 * Avoids a hard import dependency on `openid-client` types in this package.
 */
export interface RefreshTokenset {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  claims: () => AdminRefreshClaims;
}

export interface AdminRefreshDeps {
  findUsers: (
    filter: FilterQuery<IUser>,
    projection: string | null,
    options: { sort: Record<string, 1 | -1>; limit: number },
  ) => Promise<IUser[]>;
  getUserById: (id: string, projection: string) => Promise<IUser | null>;
  /**
   * Mints the bearer token returned to the admin panel. The default OSS path
   * is to call `generateToken(user, expiresInMs)` which signs an HS256
   * LibreChat JWT — pass that here. Forks that prefer to hand back a
   * different bearer (e.g. an IdP-signed id_token) override this hook.
   */
  mintToken: (user: IUser, tokenset: RefreshTokenset) => Promise<string>;
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
   * disambiguates the lookup if multiple user docs share `openidId` (e.g.
   * multi-tenant deployments). Falls back to the most-recently-updated doc
   * if absent.
   */
  userId?: string;
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

const DEFAULT_TOKEN_LIFETIME_MS = 15 * 60 * 1000;

function resolveExpiresAt(claimExp: number | undefined): number {
  if (typeof claimExp === 'number') {
    return claimExp * 1000;
  }
  return Date.now() + DEFAULT_TOKEN_LIFETIME_MS;
}

async function resolveAdminUser(
  deps: AdminRefreshDeps,
  openidId: string,
  options: AdminRefreshOptions,
): Promise<IUser | undefined> {
  if (options.userId) {
    const direct = await runAsSystem(() =>
      deps.getUserById(options.userId as string, '-password -__v -totpSecret -backupCodes'),
    );
    if (direct && direct.openidId === openidId) {
      return direct;
    }
  }

  const [user] = await runAsSystem(() =>
    deps.findUsers({ openidId } as FilterQuery<IUser>, null, {
      sort: { updatedAt: -1 },
      limit: 1,
    }),
  );
  return user;
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

  const claims = tokenset.claims();
  const openidId = claims.sub;
  if (!openidId) {
    throw new AdminRefreshError(
      'CLAIMS_INCOMPLETE',
      502,
      'IdP returned a tokenset missing the required `sub` claim',
    );
  }

  const expiresAt = resolveExpiresAt(claims.exp);

  const user = await resolveAdminUser(deps, openidId, options);
  if (!user) {
    throw new AdminRefreshError('USER_NOT_FOUND', 401, 'No user found for the refreshed identity');
  }

  const token = await deps.mintToken(user, tokenset);

  if (deps.onRefreshSuccess) {
    await deps.onRefreshSuccess(user, tokenset);
  }

  const responseUser = serializeUserForExchange(user);

  logger.debug(`[adminRefresh] Refreshed tokens for user: ${responseUser.email}`);

  return {
    token,
    refreshToken: tokenset.refresh_token,
    user: responseUser,
    expiresAt,
  };
}
