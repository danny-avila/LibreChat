const express = require('express');
const mongoose = require('mongoose');
const {
  ResourceType,
  PermissionBits,
  Permissions,
  PermissionTypes,
} = require('librechat-data-provider');
const { createSchedulesHandlers, generateCheckAccess } = require('@librechat/api');
const { checkPermission } = require('~/server/services/PermissionService');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');
const { getLimits, fireScheduleNow } = require('~/server/services/Schedules');
const methods = require('~/models');

const { getRoleByName } = methods;

const router = express.Router();
router.use(requireJwtAuth);
router.use(configMiddleware);

const checkSchedulesAccess = generateCheckAccess({
  permissionType: PermissionTypes.SCHEDULES,
  permissions: [Permissions.USE],
  getRoleByName,
});
const checkSchedulesCreate = generateCheckAccess({
  permissionType: PermissionTypes.SCHEDULES,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName,
});

const handlers = createSchedulesHandlers({
  methods,
  getLimits,
  // Real VIEW-access check (not mere existence): the body-based agent middleware
  // is a no-op for schedule payloads (no `endpoint: 'agents'`), so enforce here
  // to stop a user from scheduling against a private agent they cannot view.
  canViewAgent: async (agentId, req) => {
    const agent = await mongoose.models.Agent.findOne({ id: agentId }).select('_id').lean();
    if (agent == null) {
      return false;
    }
    return checkPermission({
      userId: req.user.id,
      role: req.user.role,
      resourceType: ResourceType.AGENT,
      resourceId: agent._id,
      requiredPermission: PermissionBits.VIEW,
    });
  },
  filterOwnedFileIds: async (fileIds, userId) => {
    const files = await methods.getFiles({ file_id: { $in: fileIds }, user: userId }, null, {
      file_id: 1,
    });
    return (files ?? []).map((file) => file.file_id);
  },
  markFilesUsed: async (fileIds, userId) => {
    await methods.updateFilesUsage(
      fileIds.map((file_id) => ({ file_id })),
      undefined,
      { user: userId },
    );
  },
  fireNow: fireScheduleNow,
});

router.get('/', checkSchedulesAccess, handlers.listSchedules);
router.get('/:id', checkSchedulesAccess, handlers.getSchedule);
router.post('/', checkSchedulesCreate, handlers.createSchedule);
router.patch('/:id', checkSchedulesCreate, handlers.updateSchedule);
router.delete('/:id', checkSchedulesCreate, handlers.deleteSchedule);
// Run-now mutates runtime state; gate it on CREATE like the UI does (not USE).
router.post('/:id/run', checkSchedulesCreate, handlers.runScheduleNow);

module.exports = router;
