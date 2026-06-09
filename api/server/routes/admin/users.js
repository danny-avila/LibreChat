const express = require('express');
const { createAdminUsersHandlers, checkEmailConfig } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { sendEmail } = require('~/server/utils');
const {
  requireCapability,
  superAdminContextMiddleware,
} = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadUsers = requireCapability(SystemCapabilities.READ_USERS);
const requireManageUsers = requireCapability(SystemCapabilities.MANAGE_USERS);

const handlers = createAdminUsersHandlers({
  findUser: db.findUser,
  createInviteToken: db.createToken,
  findInviteToken: db.findToken,
  sendInviteEmail: sendEmail,
  getClientDomain: () => process.env.DOMAIN_CLIENT || 'http://localhost:3080',
  getAppTitle: () => process.env.APP_TITLE || 'LibreChat',
  isEmailConfigured: checkEmailConfig,
  findUsers: db.findUsers,
  countUsers: db.countUsers,
  deleteUserById: db.deleteUserById,
  deleteConfig: db.deleteConfig,
  deleteAclEntries: db.deleteAclEntries,
});

router.use(requireJwtAuth, requireAdminAccess, superAdminContextMiddleware);

router.get('/', requireReadUsers, handlers.listUsers);
router.get('/search', requireReadUsers, handlers.searchUsers);
router.post('/invite', requireManageUsers, handlers.inviteUser);
router.delete('/:id', requireManageUsers, handlers.deleteUser);

module.exports = router;
