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
});

module.exports = {
  getLimits: service.getLimits,
  engineDeps: service.engineDeps,
  fireScheduleNow: service.fireScheduleNow,
  recordScheduleOutcome: service.recordScheduleOutcome,
  hasActiveScheduledRun: service.hasActiveScheduledRun,
  markScheduleRunActive: service.markScheduleRunActive,
  initializeScheduleEngine: service.initializeScheduleEngine,
};
