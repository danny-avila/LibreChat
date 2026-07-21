const {
  isSystemGlobalId,
  withSystemGlobalFallback,
  resolveSystemGlobalAgent: resolveSystemGlobalAgentImpl,
  authorizeSystemGlobalAgent: authorizeSystemGlobalAgentImpl,
} = require('@librechat/api');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const db = require('~/models');

/** Runtime dependencies for the cross-tenant global-agent logic in `@librechat/api`. */
const deps = {
  getAgent: db.getAgent,
  getUserPrincipals: db.getUserPrincipals,
  hasPermission: db.hasPermission,
  hasCapability,
};

const resolveSystemGlobalAgent = (agentId) => resolveSystemGlobalAgentImpl(deps, agentId);
const authorizeSystemGlobalAgent = (args) => authorizeSystemGlobalAgentImpl(deps, args);

module.exports = {
  isSystemGlobalId,
  withSystemGlobalFallback,
  resolveSystemGlobalAgent,
  authorizeSystemGlobalAgent,
};
