import { ACCOUNTS_TENANT_ID } from '@librechat/data-schemas';
import type { Response, NextFunction } from 'express';
import type { ServerRequest } from '~/types/http';
import { buildRequestContext, runWithTenantContext } from './tenant';
import { getAuthIdentity } from '~/organizations/identity';

type AccountRouteRequest = ServerRequest & {
  /** The organization member the request authenticated as, kept for account-route handlers. */
  organizationMember?: ServerRequest['user'];
};

/**
 * For an account-level route behind `requireJwtAuth` (2FA, passkeys, email change). A signed-in
 * organization member is only one membership of a login account, and the account owns the
 * credentials, so the route acts on the account: `req.user` becomes the account (as loaded with
 * the member, no extra read) and the request runs in the accounts tenant, where the existing
 * handlers find it. The member stays on `req.organizationMember`. Any other user passes through.
 */
export function actAsAccount(req: AccountRouteRequest, _res: Response, next: NextFunction): void {
  const identity = getAuthIdentity(req.user);
  if (!identity) {
    next();
    return;
  }
  req.organizationMember = req.user;
  req.user = {
    ...identity,
    id: identity._id.toString(),
    tenantId: ACCOUNTS_TENANT_ID,
  } as ServerRequest['user'];
  runWithTenantContext(
    {
      ...buildRequestContext(req),
      tenantId: ACCOUNTS_TENANT_ID,
      userId: identity._id.toString(),
    },
    next,
  );
}
