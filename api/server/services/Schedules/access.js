const mongoose = require('mongoose');
const {
  ResourceType,
  Permissions,
  PermissionBits,
  PermissionTypes,
} = require('librechat-data-provider');
const { logger, ResourceCapabilityMap } = require('@librechat/data-schemas');
const { checkPermission } = require('~/server/services/PermissionService');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { getRoleByName } = require('~/models');

/**
 * Resolves a user's live access to a schedule's target agent, mirroring the
 * loopback chat route's authorization EXACTLY so the create/update precheck and
 * the fire-time precheck accept a schedule iff the actual fire would be accepted:
 *   1) role-level AGENTS:USE (generateCheckAccess on the route; admins bypass)
 *   2) resource VIEW with the manage:agents capability bypass (canAccessResource)
 * The two prechecks must never diverge — a create-time VIEW-only check would let a
 * role without AGENTS:USE schedule runs that every fire then rejects and counts
 * toward auto-disable.
 * @param {string} agentId
 * @param {{ id: string, role?: string }} user
 * @returns {Promise<'ok' | 'missing' | 'forbidden'>}
 */
async function resolveAgentFireAccess(agentId, user) {
  const agent = await mongoose.models.Agent.findOne({ id: agentId }).select('_id').lean();
  if (agent == null) {
    return 'missing';
  }
  // Mirror the chat route's checkAgentAccess (generateCheckAccess → checkAccess),
  // which does NOT special-case admins: it reads the role's AGENTS:USE permission
  // directly. An admin whose role has AGENTS:USE disabled is rejected there, so the
  // precheck must reject too — otherwise every fire 403s and burns failures.
  const role = await getRoleByName(user.role);
  if (!role?.permissions?.[PermissionTypes.AGENTS]?.[Permissions.USE]) {
    return 'forbidden';
  }
  const cap = ResourceCapabilityMap[ResourceType.AGENT];
  try {
    if (cap != null && (await hasCapability(user, cap))) {
      return 'ok';
    }
  } catch (err) {
    logger.warn(`[schedules] agent capability check failed, denying bypass: ${err.message}`);
  }
  const allowed = await checkPermission({
    userId: user.id,
    role: user.role,
    resourceType: ResourceType.AGENT,
    resourceId: agent._id,
    requiredPermission: PermissionBits.VIEW,
  });
  return allowed ? 'ok' : 'forbidden';
}

module.exports = { resolveAgentFireAccess };
