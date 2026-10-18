import {
  PLATFORM_TENANT_ID,
  OrganizationStatus,
  SystemCapabilities,
} from '@librechat/data-schemas';
import {
  SystemRoles,
  AdminErrorCode,
  ADMIN_SCOPE_HEADER,
  ADMIN_PLATFORM_SCOPE,
} from 'librechat-data-provider';
import type { IUser, OrganizationRecord } from '@librechat/data-schemas';
import type { Response, NextFunction } from 'express';
import type { HasCapabilityFn } from '~/middleware/capabilities';
import type { ServerRequest } from '~/types/http';
import { buildRequestContext, runWithTenantContext } from '~/middleware/tenant';
import { runAsOperatorPrincipal } from '~/middleware/operator';
import { rejectTenantHeader } from '~/middleware/tenantHeader';
import { isOrganizationsEnabled } from '~/organizations/mode';
import { getAuthIdentity } from '~/organizations/identity';

export interface AdminScopeDeps {
  findOrganization: (tenantId: string) => Promise<Pick<OrganizationRecord, 'status'> | null>;
}

/**
 * Whether a signed-in user can open the admin panel: in organizations mode only the platform
 * operator (read from its login account, never the member record); otherwise holders of
 * `access:admin`, as before organizations.
 */
export function createAdminPanelAccess(deps: {
  hasCapability: HasCapabilityFn;
}): (user: IUser | undefined) => Promise<boolean> {
  return async (user) => {
    if (!user) {
      return false;
    }
    if (isOrganizationsEnabled()) {
      return getAuthIdentity(user)?.isPlatformOperator === true;
    }
    const id = user.id ?? user._id?.toString();
    if (!id) {
      return false;
    }
    return deps.hasCapability(
      { id, role: user.role ?? '', tenantId: user.tenantId },
      SystemCapabilities.ACCESS_ADMIN,
    );
  };
}

function refuse(res: Response, status: number, error: string, errorCode: string): void {
  res.status(status).json({ error, error_code: errorCode });
}

/**
 * Admin-panel requests in organizations mode, after `requireJwtAuth`.
 *
 * Only the platform operator uses the panel. The signed-in member is checked against its login
 * account (re-read for every request, never taken from the token), and the request then runs as
 * the operator, holding every capability, in the scope the `X-Admin-Scope` header names:
 *
 * - `platform` (the default): the deployment-wide, untenanted records, through the platform
 *   scope, which can neither see nor change any organization's data.
 * - an organization's tenant id: that organization, exactly as its own members' requests run.
 *
 * With organizations disabled the request is left as it is: panel access follows the
 * `access:admin` capability, as before organizations.
 */
export function createAdminScope(
  deps: AdminScopeDeps,
): (req: ServerRequest, res: Response, next: NextFunction) => Promise<void> {
  return async function adminScope(req, res, next) {
    if (!isOrganizationsEnabled()) {
      next();
      return;
    }
    const account = getAuthIdentity(req.user);
    if (account?.isPlatformOperator !== true) {
      refuse(res, 403, 'Platform operator access required', AdminErrorCode.OPERATOR_REQUIRED);
      return;
    }

    const requested = req.headers[ADMIN_SCOPE_HEADER];
    const scope =
      typeof requested === 'string' && requested.trim() ? requested.trim() : ADMIN_PLATFORM_SCOPE;
    let tenantId: string | undefined;
    if (scope !== ADMIN_PLATFORM_SCOPE) {
      if (rejectTenantHeader(scope)) {
        refuse(res, 400, 'Invalid admin scope', AdminErrorCode.ADMIN_SCOPE_INVALID);
        return;
      }
      let organization: Pick<OrganizationRecord, 'status'> | null;
      try {
        organization = await deps.findOrganization(scope);
      } catch (error) {
        next(error);
        return;
      }
      if (!organization) {
        refuse(res, 404, 'Organization not found', AdminErrorCode.ORGANIZATION_NOT_FOUND);
        return;
      }
      if (organization.status === OrganizationStatus.DELETING) {
        refuse(res, 409, 'Organization is being deleted', AdminErrorCode.ORGANIZATION_DELETING);
        return;
      }
      tenantId = scope;
    }

    const operatorId = account._id.toString();
    /* The operator's own identity, not its member record: what it does is the operator's. */
    req.user = {
      _id: account._id,
      id: operatorId,
      email: account.email,
      name: account.name,
      username: account.username,
      provider: account.provider,
      emailVerified: account.emailVerified,
      role: SystemRoles.ADMIN,
      tenantId,
      isPlatformOperator: true,
    } as IUser;
    runAsOperatorPrincipal(operatorId, () =>
      runWithTenantContext(
        {
          ...buildRequestContext(req),
          tenantId: tenantId ?? PLATFORM_TENANT_ID,
          userId: operatorId,
          operatorActing: true,
        },
        next,
      ),
    );
  };
}
