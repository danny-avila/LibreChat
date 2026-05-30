const express = require('express');
const { createAdminSkillsSyncHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { hasCapability, requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const { upsertSkillSyncCredential, deleteSkillSyncCredential } = require('~/models');
const { getGitHubSkillSyncRunner } = require('~/server/services/Skills/sync');

const router = express.Router();
const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

function requirePlatformCapability(capability) {
  return async (req, res, next) => {
    try {
      const id = req.user?.id ?? req.user?._id?.toString?.();
      if (!id) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      const user = {
        id,
        role: req.user?.role ?? '',
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

const requirePlatformReadSkills = requirePlatformCapability(SystemCapabilities.READ_SKILLS);
const requirePlatformManageSkills = requirePlatformCapability(SystemCapabilities.MANAGE_SKILLS);

const handlers = createAdminSkillsSyncHandlers({
  runner: getGitHubSkillSyncRunner(),
  upsertCredential: upsertSkillSyncCredential,
  deleteCredential: deleteSkillSyncCredential,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/sync/status', requirePlatformReadSkills, handlers.getSyncStatus);
router.post('/sync/run', requirePlatformManageSkills, handlers.runSync);
router.put('/sync/credentials/:credentialKey', requirePlatformManageSkills, handlers.setCredential);
router.delete(
  '/sync/credentials/:credentialKey',
  requirePlatformManageSkills,
  handlers.deleteCredential,
);

module.exports = router;
