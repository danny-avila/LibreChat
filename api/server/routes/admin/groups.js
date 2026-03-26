const express = require('express');
const { createAdminGroupsHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadGroups = requireCapability(SystemCapabilities.READ_GROUPS);
const requireManageGroups = requireCapability(SystemCapabilities.MANAGE_GROUPS);

const handlers = createAdminGroupsHandlers({
  listGroups: db.listGroups,
  countGroups: db.countGroups,
  findGroupById: db.findGroupById,
  createGroup: db.createGroup,
  updateGroupById: db.updateGroupById,
  deleteGroup: db.deleteGroup,
  addUserToGroup: db.addUserToGroup,
  removeUserFromGroup: db.removeUserFromGroup,
  removeMemberById: db.removeMemberById,
  findUsers: db.findUsers,
  deleteConfig: db.deleteConfig,
  deleteAclEntries: db.deleteAclEntries,
  deleteGrantsForPrincipal: db.deleteGrantsForPrincipal,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', requireReadGroups, handlers.listGroups);
router.post('/', requireManageGroups, handlers.createGroup);
router.get('/:id', requireReadGroups, handlers.getGroup);
router.patch('/:id', requireManageGroups, handlers.updateGroup);
router.delete('/:id', requireManageGroups, handlers.deleteGroup);
router.get('/:id/members', requireReadGroups, handlers.getGroupMembers);
router.post('/:id/members', requireManageGroups, handlers.addGroupMember);
router.delete('/:id/members/:userId', requireManageGroups, handlers.removeGroupMember);

module.exports = router;
