const express = require('express');
const { createAdminSkillsSyncHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { hasCapability, requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const { upsertSkillSyncCredential, deleteSkillSyncCredential } = require('~/models');
const { getGitHubSkillSyncRunnerForRequest } = require('~/server/services/Skills/sync');
const configMiddleware = require('~/server/middleware/config/app');

const router = express.Router();
const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

function requireSkillCapability(capability, { platformOnly = false } = {}) {
  return async (req, res, next) => {
    try {
      const id = req.user?.id ?? req.user?._id?.toString?.();
      if (!id) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      const user = {
        id,
        role: req.user?.role ?? '',
        ...(platformOnly ? {} : { tenantId: req.user?.tenantId }),
      };
      if (await hasCapability(user, capability)) {
        return next();
      }
      return res.status(403).json({ message: 'Forbidden' });
    } catch {
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  };
}

const requireReadSkills = requireSkillCapability(SystemCapabilities.READ_SKILLS);
const requireManageSkills = requireSkillCapability(SystemCapabilities.MANAGE_SKILLS);
const requirePlatformManageSkills = requireSkillCapability(SystemCapabilities.MANAGE_SKILLS, {
  platformOnly: true,
});

const handlers = createAdminSkillsSyncHandlers({
  getRunner: getGitHubSkillSyncRunnerForRequest,
  upsertCredential: upsertSkillSyncCredential,
  deleteCredential: deleteSkillSyncCredential,
});

router.use(requireJwtAuth, requireAdminAccess, configMiddleware);

router.get('/sync/status', requireReadSkills, handlers.getSyncStatus);
router.post('/sync/run', requireManageSkills, handlers.runSync);
router.put('/sync/credentials/:credentialKey', requirePlatformManageSkills, handlers.setCredential);
router.delete(
  '/sync/credentials/:credentialKey',
  requirePlatformManageSkills,
  handlers.deleteCredential,
);

module.exports = router;
