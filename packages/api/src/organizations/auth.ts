import { OrganizationErrorCode } from 'librechat-data-provider';
import { runInAccounts, ACCOUNTS_TENANT_ID } from '@librechat/data-schemas';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { AuthUserRecord, GetUserById } from './types';
import { buildRequestContext, runWithTenantContext } from '~/middleware/tenant';
import { verifyOrganizationOnboardingToken } from './onboarding';
import { isTokenRetired } from '~/auth/twoFactor';
import { isOrganizationsEnabled } from './mode';
import { getAuthIdentity } from './identity';

const ONBOARDING_ACCOUNT_FIELDS =
  'tenantId email name username avatar emailVerified lastActiveTenantId credentialsChangedAt twoFactorEnrolledAt isPlatformOperator';

/** The signed-in member `requireJwtAuth` puts on the request. */
export type OrganizationRequestUser = AuthUserRecord & { id: string };

/** A request to an organization route, acting for a member or (onboarding) a bare account. */
export type OrganizationAccountRequest = Request<
  Record<string, string>,
  unknown,
  Record<string, unknown> | undefined
> & {
  user?: OrganizationRequestUser;
  organizationAccount?: AuthUserRecord;
};

function bearerToken(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  return typeof value === 'string' ? value.replace(/^Bearer\s+/i, '') || undefined : undefined;
}

/** Answers every organization route with 404 while organizations are disabled. */
export function requireOrganizationsEnabled(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isOrganizationsEnabled()) {
    res.status(404).json({ code: OrganizationErrorCode.ORGANIZATIONS_DISABLED });
    return;
  }
  next();
}

export interface OrganizationAccountAuthDeps {
  requireJwtAuth: RequestHandler;
  getUserById: GetUserById;
}

/**
 * Authenticates a route that acts for the login account rather than one membership: listing
 * organizations, creating one, accepting an invite. A member's access token resolves to its
 * account; an onboarding token (an account with no organization yet) names the account
 * directly and is refused once a password reset retires it. Either way the account lands on
 * `req.organizationAccount`.
 */
export function createOrganizationAccountAuth(deps: OrganizationAccountAuthDeps) {
  return (req: OrganizationAccountRequest, res: Response, next: NextFunction): void => {
    const onboarding = verifyOrganizationOnboardingToken(bearerToken(req), process.env.JWT_SECRET);
    if (!onboarding) {
      deps.requireJwtAuth(req, res, (error?: unknown) => {
        if (error) {
          next(error);
          return;
        }
        const account = getAuthIdentity(req.user);
        if (!account) {
          res.status(403).json({ code: OrganizationErrorCode.NOT_A_MEMBER });
          return;
        }
        req.organizationAccount = account;
        next();
      });
      return;
    }

    void (async () => {
      const account = await runInAccounts(() =>
        deps.getUserById(onboarding.accountId, ONBOARDING_ACCOUNT_FIELDS),
      );
      if (
        !account ||
        account.tenantId !== ACCOUNTS_TENANT_ID ||
        isTokenRetired(onboarding, account)
      ) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
      req.organizationAccount = account;
      runWithTenantContext(
        {
          ...buildRequestContext(req),
          tenantId: ACCOUNTS_TENANT_ID,
          userId: onboarding.accountId,
        },
        next,
      );
    })().catch(next);
  };
}
