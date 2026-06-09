import type { IGroup, IUser } from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';
import type { ServerRequest } from '~/types/http';

export function getCallerTenantId(req: ServerRequest): string | undefined {
  return (req.user as { tenantId?: string } | undefined)?.tenantId?.trim() || undefined;
}

/** Mongo filter scoping IUser queries to the caller's tenant. Empty for platform admins. */
export function getTenantScopedUserFilter(req: ServerRequest): FilterQuery<IUser> {
  const tenantId = getCallerTenantId(req);
  return tenantId ? { tenantId } : {};
}

export function mergeUserFilter(
  req: ServerRequest,
  filter: FilterQuery<IUser>,
): FilterQuery<IUser> {
  return { ...filter, ...getTenantScopedUserFilter(req) };
}

/** Mongo filter scoping IGroup queries to the caller's tenant. Empty for platform admins. */
export function getTenantScopedGroupFilter(req: ServerRequest): FilterQuery<IGroup> {
  const tenantId = getCallerTenantId(req);
  return tenantId ? { tenantId } : {};
}

export function mergeGroupFilter(
  req: ServerRequest,
  filter: FilterQuery<IGroup>,
): FilterQuery<IGroup> {
  return { ...filter, ...getTenantScopedGroupFilter(req) };
}

export function groupBelongsToCaller(req: ServerRequest, group: IGroup | null): group is IGroup {
  if (!group) {
    return false;
  }
  const tenantId = getCallerTenantId(req);
  if (!tenantId) {
    return true;
  }
  return group.tenantId === tenantId;
}
