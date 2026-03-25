const express = require('express');
const { createAdminRolesHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadRoles = requireCapability(SystemCapabilities.READ_ROLES);
const requireManageRoles = requireCapability(SystemCapabilities.MANAGE_ROLES);

const handlers = createAdminRolesHandlers({
  listRoles: db.listRoles,
  getRoleByName: db.getRoleByName,
  createRole: db.createRole,
  updateRoleByName: db.updateRoleByName,
  updateAccessPermissions: db.updateAccessPermissions,
  deleteRole: db.deleteRole,
  findUser: db.findUser,
  updateUser: db.updateUser,
  listUsersByRole: db.listUsersByRole,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', requireReadRoles, handlers.listRoles);
router.post('/', requireManageRoles, handlers.createRole);
router.get('/:name', requireReadRoles, handlers.getRole);
router.patch('/:name', requireManageRoles, handlers.updateRole);
router.delete('/:name', requireManageRoles, handlers.deleteRole);
router.patch('/:name/permissions', requireManageRoles, handlers.updateRolePermissions);
router.get('/:name/members', requireReadRoles, handlers.getRoleMembers);
router.post('/:name/members', requireManageRoles, handlers.addRoleMember);
router.delete('/:name/members/:userId', requireManageRoles, handlers.removeRoleMember);

module.exports = router;
