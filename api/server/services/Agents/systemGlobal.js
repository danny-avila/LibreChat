const { logger, runAsSystem, ResourceCapabilityMap } = require('@librechat/data-schemas');
const { Constants, ResourceType } = require('librechat-data-provider');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const db = require('~/models');

const { getAgent, getUserPrincipals, hasPermission } = db;

/**
 * Config-defined `tenants: 'system'` global agents are stored as a single tenantless row/grant that
 * a tenant-scoped read can't see. This module centralizes the cross-tenant handling so every access
 * and read path routes through one correct implementation instead of scattered fallbacks.
 */

const isSystemGlobalId = (agentId) =>
  typeof agentId === 'string' && agentId.startsWith(Constants.GLOBAL_AGENT_PREFIX);

/**
 * Refetch a global agent under the system context, pinned to the tenantless row, when the
 * tenant-scoped fetch missed it. `fetchTenant`/`fetchSystem` let callers reuse their own accessor
 * (getAgent, getAgentWithVersionCount, getAgentVersions, …).
 * @template T
 * @param {string} agentId
 * @param {() => Promise<T>} fetchTenant - tenant-scoped fetch
 * @param {() => Promise<T>} fetchSystem - fetch pinned to `{ tenantId: { $exists: false } }`
 * @returns {Promise<T>}
 */
const withSystemGlobalFallback = async (agentId, fetchTenant, fetchSystem) => {
  const doc = await fetchTenant();
  if (doc || !isSystemGlobalId(agentId)) {
    return doc;
  }
  return runAsSystem(fetchSystem);
};

/** Resolve the tenantless system-scope row for a global id (or null). */
const resolveSystemGlobalAgent = (agentId) =>
  runAsSystem(() => getAgent({ id: agentId, tenantId: { $exists: false } }));

/**
 * Authorize a tenantless system-scope global agent. Principals are built in the REQUEST tenant
 * context (so group memberships reflect the current tenant); the agent + ACL lookup run under the
 * system context (so the tenantless row/grants resolve). Preserves the MANAGE_AGENTS capability
 * bypass for parity with `canAccessResource`.
 * @returns {Promise<{status:'ok'|'not_found'|'forbidden', agent?: object}>}
 */
const authorizeSystemGlobalAgent = async ({ agentId, requiredPermission, req }) => {
  const principals = await getUserPrincipals({ userId: req.user.id, role: req.user.role });
  return runAsSystem(async () => {
    const agent = await getAgent({ id: agentId, tenantId: { $exists: false } });
    if (!agent) {
      return { status: 'not_found' };
    }
    const cap = ResourceCapabilityMap[ResourceType.AGENT];
    let hasCap = false;
    try {
      hasCap = cap != null && (await hasCapability(req.user, cap));
    } catch (err) {
      logger.warn(`[systemGlobalAgent] capability check failed, denying bypass: ${err.message}`);
    }
    if (hasCap) {
      return { status: 'ok', agent };
    }
    const allowed = await hasPermission(
      principals,
      ResourceType.AGENT,
      agent._id,
      requiredPermission,
    );
    return { status: allowed ? 'ok' : 'forbidden', agent };
  });
};

module.exports = {
  isSystemGlobalId,
  withSystemGlobalFallback,
  resolveSystemGlobalAgent,
  authorizeSystemGlobalAgent,
};
