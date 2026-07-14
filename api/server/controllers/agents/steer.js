const { checkAccess, handleSteerRequest, handleSteerCancel } = require('@librechat/api');
const { logger, ResourceCapabilityMap } = require('@librechat/data-schemas');
const {
  Permissions,
  ResourceType,
  PermissionBits,
  PermissionTypes,
  isAgentsEndpoint,
  isEphemeralAgentId,
} = require('librechat-data-provider');
const { checkPermission } = require('~/server/services/PermissionService');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const db = require('~/models');

/**
 * Steer-time agent authorization, mirroring the chat route's middlewares
 * (`checkAgentAccess` + `canAccessAgentFromBody`) against the ORIGINATING
 * run's identity from job metadata instead of the request body:
 * - role gate: AGENTS:USE via `checkAccess`, applied exactly when chat.js
 *   would run it (`skipAgentCheck` skips non-agents endpoints);
 * - resource gate: `canAccessResource`'s capability bypass + `checkPermission`
 *   VIEW on the resolved agent, skipped for ephemeral/no-agent runs.
 *
 * @param {import('express').Request} req
 * @returns {(run: import('@librechat/api').SteerRunContext) => Promise<boolean>}
 */
const createAgentAccessCheck =
  (req) =>
  async ({ agentId, endpoint }) => {
    const hasRealAgent = agentId != null && !isEphemeralAgentId(agentId);
    const roleGateApplies = endpoint == null ? hasRealAgent : isAgentsEndpoint(endpoint);
    if (roleGateApplies) {
      const roleAllowed = await checkAccess({
        req,
        user: req.user,
        permissionType: PermissionTypes.AGENTS,
        permissions: [Permissions.USE],
        getRoleByName: db.getRoleByName,
      });
      if (!roleAllowed) {
        return false;
      }
    }
    if (!hasRealAgent) {
      return true;
    }
    let bypass = false;
    try {
      bypass = await hasCapability(req.user, ResourceCapabilityMap[ResourceType.AGENT]);
    } catch {
      bypass = false;
    }
    if (bypass) {
      return true;
    }
    const agent = await db.getAgent({ id: agentId });
    if (!agent) {
      return false;
    }
    return checkPermission({
      userId: req.user.id,
      role: req.user.role,
      resourceType: ResourceType.AGENT,
      resourceId: agent._id,
      requiredPermission: PermissionBits.VIEW,
    });
  };

/**
 * POST /api/agents/chat/steer
 *
 * Thin wrapper: the full guard ladder (validation, file sanitization,
 * capability gate, ownership/tenant checks, agent access, owner-scoped file
 * resolve, status-guarded enqueue) lives in `@librechat/api`
 * (`handleSteerRequest`), which returns the HTTP status + JSON body to
 * serialize verbatim. DB access and permission services are injected here.
 */
const SteerController = async (req, res) => {
  try {
    const { status, body } = await handleSteerRequest(req.user ?? {}, req.body ?? {}, {
      getFiles: db.getFiles,
      updateFilesUsage: db.updateFilesUsage,
      checkAgentAccess: createAgentAccessCheck(req),
    });
    return res.status(status).json(body);
  } catch (error) {
    logger.error('[SteerController] Failed to queue steer', error);
    return res.status(500).json({ code: 'STEER_FAILED' });
  }
};

/**
 * POST /api/agents/chat/steer/cancel
 *
 * Removes a still-queued steer before injection. `removed: false` is not an
 * error — the cancel lost its race (already injected, or the run ended) and
 * the client defers to the events it will receive. No agent-access check:
 * a cancel injects nothing model-bound, so ownership checks suffice.
 */
const SteerCancelController = async (req, res) => {
  try {
    const { status, body } = await handleSteerCancel(req.user ?? {}, req.body ?? {});
    return res.status(status).json(body);
  } catch (error) {
    logger.error('[SteerCancelController] Failed to cancel steer', error);
    return res.status(500).json({ code: 'STEER_CANCEL_FAILED' });
  }
};

module.exports = SteerController;
module.exports.SteerCancelController = SteerCancelController;
