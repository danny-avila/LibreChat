const express = require('express');
const { PermissionTypes, Permissions, PermissionBits } = require('librechat-data-provider');
const { createSchedulesHandlers, generateCheckAccess } = require('@librechat/api');
const { canAccessAgentFromBody } = require('~/server/middleware/accessResources');
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

const checkAgentViewAccess = canAccessAgentFromBody({ requiredPermission: PermissionBits.VIEW });
const checkAgentInBody = (req, res, next) =>
  req.body?.agent_id ? checkAgentViewAccess(req, res, next) : next();

const handlers = createSchedulesHandlers({
  methods,
  getLimits,
  canViewAgent: async (agentId) => {
    const mongoose = require('mongoose');
    const agent = await mongoose.models.Agent.findOne({ id: agentId }).select('_id').lean();
    return agent != null;
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
router.post('/', checkSchedulesCreate, checkAgentInBody, handlers.createSchedule);
router.patch('/:id', checkSchedulesCreate, checkAgentInBody, handlers.updateSchedule);
router.delete('/:id', checkSchedulesCreate, handlers.deleteSchedule);
router.post('/:id/run', checkSchedulesAccess, handlers.runScheduleNow);

module.exports = router;
