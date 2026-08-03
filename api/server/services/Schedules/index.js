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
  upsertBalance: (userId, { set, setOnInsert }) =>
    mongoose.models.Balance.findOneAndUpdate(
      { user: userId },
      {
        ...(set && Object.keys(set).length > 0 ? { $set: set } : {}),
        ...(setOnInsert && Object.keys(setOnInsert).length > 0
          ? { $setOnInsert: setOnInsert }
          : {}),
      },
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
  requestScheduledRunAbort: service.requestScheduledRunAbort,
  markScheduledRunAbortPersisted: service.markScheduledRunAbortPersisted,
  awaitStopAbortPersistence: service.awaitStopAbortPersistence,
  isScheduleLive: service.isScheduleLive,
  markScheduledRunResumeClaimed: service.markScheduledRunResumeClaimed,
  deleteScheduleForOwner: service.deleteScheduleForOwner,
  quiesceUserSchedules: service.quiesceUserSchedules,
  initializeScheduleEngine: service.initializeScheduleEngine,
  // Identity-fenced delete for a job retained via `preserveForReconcile` whose run has
  // since been settled inline; reconcile only reaches jobs whose run is still active.
  clearScheduledJob: service.engineDeps.clearReconciledJob,
};
