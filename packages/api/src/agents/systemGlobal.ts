import { Constants, ResourceType } from 'librechat-data-provider';
import { logger, runAsSystem, ResourceCapabilityMap } from '@librechat/data-schemas';
import type { Agent } from 'librechat-data-provider';
import type { Types } from 'mongoose';

/**
 * Config-defined `tenants: 'system'` global agents are stored as a single tenantless row/grant that
 * a tenant-scoped read can't see. This module centralizes the cross-tenant resolution/authorization
 * so every access and read path routes through one correct implementation. The `/api` service is a
 * thin wrapper that binds the runtime dependencies.
 */

type AgentFilter = { id: string; tenantId?: { $exists: boolean } };
type Principal = { principalType: string; principalId?: string | Types.ObjectId };
type AccessRequestUser = { id: string; role: string; tenantId?: string };

export interface SystemGlobalAccessDeps {
  getAgent: (filter: AgentFilter) => Promise<Agent | null>;
  getUserPrincipals: (params: { userId: string; role: string }) => Promise<Principal[]>;
  hasPermission: (
    principals: Principal[],
    resourceType: string,
    resourceId: string | Types.ObjectId,
    permissionBit: number,
  ) => Promise<boolean>;
  hasCapability: (user: AccessRequestUser, capability: string) => Promise<boolean>;
}

export type SystemGlobalAuthResult =
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'ok'; agent: Agent };

export const isSystemGlobalId = (agentId?: string | null): boolean =>
  typeof agentId === 'string' && agentId.startsWith(Constants.GLOBAL_AGENT_PREFIX);

/**
 * Refetch a global agent under the system context, pinned to the tenantless row, when the
 * tenant-scoped fetch missed it. `fetchTenant`/`fetchSystem` let callers reuse their own accessor.
 */
export async function withSystemGlobalFallback<T>(
  agentId: string,
  fetchTenant: () => Promise<T>,
  fetchSystem: () => Promise<T>,
): Promise<T> {
  const doc = await fetchTenant();
  if (doc || !isSystemGlobalId(agentId)) {
    return doc;
  }
  return runAsSystem(fetchSystem);
}

/** Resolve the tenantless system-scope row for a global id (or null). */
export const resolveSystemGlobalAgent = (
  deps: SystemGlobalAccessDeps,
  agentId: string,
): Promise<Agent | null> =>
  runAsSystem(() => deps.getAgent({ id: agentId, tenantId: { $exists: false } }));

/**
 * Authorize a tenantless system-scope global agent. Principals are built in the REQUEST tenant
 * context (so group memberships reflect the current tenant); the agent + ACL lookup run under the
 * system context. Preserves the MANAGE_AGENTS capability bypass for parity with `canAccessResource`.
 */
export async function authorizeSystemGlobalAgent(
  deps: SystemGlobalAccessDeps,
  {
    agentId,
    requiredPermission,
    req,
  }: { agentId: string; requiredPermission: number; req: { user: AccessRequestUser } },
): Promise<SystemGlobalAuthResult> {
  const principals = await deps.getUserPrincipals({ userId: req.user.id, role: req.user.role });
  return runAsSystem(async () => {
    const agent = await deps.getAgent({ id: agentId, tenantId: { $exists: false } });
    if (!agent?._id) {
      return { status: 'not_found' };
    }
    const cap = ResourceCapabilityMap[ResourceType.AGENT];
    let hasCap = false;
    try {
      hasCap = cap != null && (await deps.hasCapability(req.user, cap));
    } catch (err) {
      logger.warn(
        `[systemGlobalAgent] capability check failed, denying bypass: ${(err as Error).message}`,
      );
    }
    if (hasCap) {
      return { status: 'ok', agent };
    }
    const allowed = await deps.hasPermission(
      principals,
      ResourceType.AGENT,
      agent._id,
      requiredPermission,
    );
    return { status: allowed ? 'ok' : 'forbidden', agent };
  });
}
