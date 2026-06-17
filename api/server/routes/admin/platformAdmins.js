const express = require('express');
const { PrincipalType } = require('librechat-data-provider');
const { createAdminPlatformAdminsHandlers, checkEmailConfig } = require('@librechat/api');
const { SystemCapabilities, runAsSystem } = require('@librechat/data-schemas');
const { sendEmail } = require('~/server/utils');
const {
  requireCapability,
  superAdminContextMiddleware,
  requirePlatformAdmin,
} = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

async function getPlatformAdminUserIds() {
  return runAsSystem(async () => {
    const grants = await db.listGrants({
      principalTypes: [PrincipalType.USER],
      limit: 5000,
    });
    const ids = new Set();
    for (const grant of grants) {
      if (grant.capability === SystemCapabilities.ACCESS_ADMIN && grant.principalId) {
        ids.add(String(grant.principalId));
      }
    }
    return ids;
  });
}

const handlers = createAdminPlatformAdminsHandlers({
  findUser: db.findUser,
  findUsers: db.findUsers,
  updateUser: db.updateUser,
  deleteUserById: db.deleteUserById,
  deleteGrantsForPrincipal: db.deleteGrantsForPrincipal,
  seedSuperAdminGrants: db.seedSuperAdminGrants,
  getPlatformAdminUserIds,
  createInviteToken: db.createToken,
  findInviteToken: db.findToken,
  sendInviteEmail: sendEmail,
  getClientDomain: () => process.env.DOMAIN_CLIENT || 'http://localhost:3080',
  getAppTitle: () => process.env.APP_TITLE || 'LibreChat',
  isEmailConfigured: checkEmailConfig,
  findPendingUserInvites: db.findPendingUserInvites,
});

router.use(requireJwtAuth, requireAdminAccess, superAdminContextMiddleware);
router.use(requirePlatformAdmin());

router.get('/', handlers.listPlatformAdmins);
router.post('/invite', handlers.invitePlatformAdmin);
router.patch('/:id', handlers.updatePlatformAdmin);
router.delete('/:id', handlers.revokePlatformAdmin);
router.post('/:id/delete', handlers.deletePlatformAdmin);

module.exports = router;
