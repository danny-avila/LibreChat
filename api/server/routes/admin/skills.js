const express = require('express');
const { createAdminSkillsSyncHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const {
  upsertSkillSyncCredential,
  deleteSkillSyncCredential,
} = require('~/models');
const { getGitHubSkillSyncRunner } = require('~/server/services/Skills/sync');

const router = express.Router();
const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const handlers = createAdminSkillsSyncHandlers({
  runner: getGitHubSkillSyncRunner(),
  upsertCredential: upsertSkillSyncCredential,
  deleteCredential: deleteSkillSyncCredential,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/sync/status', handlers.getSyncStatus);
router.post('/sync/run', handlers.runSync);
router.put('/sync/credentials/:credentialKey', handlers.setCredential);
router.delete('/sync/credentials/:credentialKey', handlers.deleteCredential);

module.exports = router;
