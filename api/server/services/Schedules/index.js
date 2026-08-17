let service;

/**
 * Build the schedule service on first use. Controllers import this facade in many
 * focused test/runtime paths that never use scheduling; eagerly loading Config and
 * the trigger worker made those paths initialize two unrelated service graphs just
 * by requiring a controller.
 */
function getService() {
  if (service != null) {
    return service;
  }
  const mongoose = require('mongoose');
  const { createSchedulesService } = require('@librechat/api');
  const { getAppConfig } = require('~/server/services/Config/app');
  const { enqueueAgentTrigger } = require('~/server/services/Agents/triggers');
  const { resolveAgentFireAccess } = require('./access');
  const methods = require('~/models');
  const isUserDeleting = async (userId) => !(await methods.isAgentTriggerPrincipalActive(userId));

  service = createSchedulesService({
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
    enqueueAgentTrigger,
    resolveAgentFireAccess,
    // Reuse the merged trigger/deletion admission fence. A schedule fire and every
    // generic trigger now fail closed on the same durable principal state.
    isUserDeleting,
  });
  return service;
}

const invoke =
  (method) =>
  (...args) =>
    getService()[method](...args);

module.exports = {
  getLimits: invoke('getLimits'),
  fireScheduleNow: invoke('fireScheduleNow'),
  recordScheduleOutcome: invoke('recordScheduleOutcome'),
  isScheduleLive: invoke('isScheduleLive'),
  deleteScheduleForOwner: invoke('deleteScheduleForOwner'),
  quiesceUserSchedules: invoke('quiesceUserSchedules'),
  initializeScheduleEngine: invoke('initializeScheduleEngine'),
  isUserDeleting: async (userId) => {
    const methods = require('~/models');
    return !(await methods.isAgentTriggerPrincipalActive(userId));
  },
  // Identity-fenced delete for a retained job whose run has since been settled
  // inline; reconciliation only reaches jobs whose run is still active.
  clearScheduledJob: (...args) => getService().engineDeps.clearReconciledJob(...args),
};
