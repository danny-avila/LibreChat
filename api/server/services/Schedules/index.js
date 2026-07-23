const mongoose = require('mongoose');
const { createSchedulesService } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config/app');
const { resolveAgentFireAccess } = require('./access');
const methods = require('~/models');

const service = createSchedulesService({
  methods,
  getAppConfig,
  findUserById: (userId) =>
    mongoose.models.User.findById(userId).select('_id tenantId role').lean(),
  findBalance: (userId) => mongoose.models.Balance.findOne({ user: userId }).lean(),
  upsertBalance: (userId, fields) =>
    mongoose.models.Balance.findOneAndUpdate(
      { user: userId },
      { $set: fields },
      { upsert: true, new: true },
    ).lean(),
  resolveAgentFireAccess,
  // Durable account-deletion barrier consulted at the fire dispatch boundary. Without
  // this, engineDeps.isOwnerDeleting would throw on every scheduled fire.
  isUserDeleting: methods.isUserDeleting,
});

module.exports = {
  getLimits: service.getLimits,
  engineDeps: service.engineDeps,
  fireScheduleNow: service.fireScheduleNow,
  recordScheduleOutcome: service.recordScheduleOutcome,
  isScheduleLive: service.isScheduleLive,
  reserveScheduledResume: service.reserveScheduledResume,
  markScheduledResumeClaimed: service.markScheduledResumeClaimed,
  commitScheduledResume: service.commitScheduledResume,
  releaseScheduledResume: service.releaseScheduledResume,
  deleteScheduleForOwner: service.deleteScheduleForOwner,
  quiesceUserSchedules: service.quiesceUserSchedules,
  initializeScheduleEngine: service.initializeScheduleEngine,
};
