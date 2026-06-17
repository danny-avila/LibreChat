const express = require('express');
const { createAdminTenantsHandlers, checkEmailConfig } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { sendEmail } = require('~/server/utils');
const {
  requireCapability,
  superAdminContextMiddleware,
  requirePlatformAdmin,
  isPlatformAdmin,
} = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const handlers = createAdminTenantsHandlers({
  findUser: db.findUser,
  findUsers: db.findUsers,
  countUsers: db.countUsers,
  findTenantById: db.findTenantById,
  createInviteToken: db.createToken,
  findInviteToken: db.findToken,
  sendInviteEmail: sendEmail,
  getClientDomain: () => process.env.DOMAIN_CLIENT || 'http://localhost:3080',
  getAppTitle: () => process.env.APP_TITLE || 'LibreChat',
  isEmailConfigured: checkEmailConfig,
  findTenantByObjectId: db.findTenantByObjectId,
  listTenants: db.listTenants,
  countTenants: db.countTenants,
  createTenant: db.createTenant,
  deleteTenantByObjectId: db.deleteTenantByObjectId,
  updateTenantByObjectId: db.updateTenantByObjectId,
  seedTenantSystemGrants: db.seedTenantSystemGrants,
  seedDefaultRolesForTenant: db.seedDefaultRolesForTenant,
  countUsersByTenantId: db.countUsersByTenantId,
  deleteGrantsForTenant: db.deleteGrantsForTenant,
  isPlatformAdmin,
  findPendingUserInvites: db.findPendingUserInvites,
});

router.use(requireJwtAuth, requireAdminAccess, superAdminContextMiddleware);

router.get('/', requirePlatformAdmin(), handlers.listTenants);
router.get('/tenant-admins', requirePlatformAdmin(), handlers.listTenantAdmins);
router.post('/', requirePlatformAdmin(), handlers.createTenant);
router.post('/:id/invite-admin', requirePlatformAdmin(), handlers.inviteTenantAdmin);
router.post('/:id/delete', requirePlatformAdmin(), handlers.deleteTenant);
router.get('/:id', handlers.getTenant);
router.patch('/:id', requirePlatformAdmin(), handlers.updateTenant);
router.delete('/:id', requirePlatformAdmin(), handlers.deleteTenant);

module.exports = router;
