const express = require('express');
const mongoose = require('mongoose');
const {
  GenerationJobManager,
  openCheckpointDeletion,
  deleteAllSharedLinksWithCleanup,
  createAdminUsersHandlers,
  revokeUserCodeEnvironmentWorkers,
} = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const {
  drainAgentTriggerDeliveriesForUser,
  prepareAgentTriggerUserPurge,
  cancelAgentTriggerUserPurge,
  purgeAgentTriggerDeliveriesForUser,
} = require('~/server/services/Agents/triggers');
const { processDeleteRequest } = require('~/server/services/Files/process');
const { invalidateCachedTools } = require('~/server/services/Config/getCachedTools');
const { getMCPManager } = require('~/config');
const subagentThreadTaskStore = require('~/server/services/Endpoints/agents/subagentThreadStore');
const {
  quiesceUserSchedules,
  restoreUserSchedulesFromDeletion,
} = require('~/server/services/Schedules');
const db = require('~/models');
const { getAppConfig, invalidateCodeEnvironmentConfigCache } = require('~/server/services/Config');

const router = express.Router();

/** Same dependencies the self-service controller passes, with storage cleanup run as the target. */
const resolveErasure = async ({ id, role, tenantId }) => {
  const appConfig = await getAppConfig({ role, userId: id, tenantId });
  const fileRequest = {
    user: { id, _id: id, role, tenantId },
    baseUrl: '',
    query: {},
    body: {},
    config: appConfig,
  };
  return {
    checkpointer: appConfig?.endpoints?.agents?.checkpointer,
    deps: {
      ...db,
      openCheckpointDeletion,
      deleteSharedLinks: deleteAllSharedLinksWithCleanup,
      deleteStoredFiles: (files) => processDeleteRequest({ req: fileRequest, files }),
      invalidateMCPServerTools: (serverName) => invalidateCachedTools({ userId: id, serverName }),
      disconnectMCPServer: async (serverName) => {
        await getMCPManager()?.disconnectUserConnection(id, serverName);
      },
    },
  };
};

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadUsers = requireCapability(SystemCapabilities.READ_USERS);
// const requireManageUsers = requireCapability(SystemCapabilities.MANAGE_USERS);

const handlers = createAdminUsersHandlers({
  findUsers: db.findUsers,
  countUsers: db.countUsers,
  beginAgentTriggerUserDeletion: db.beginAgentTriggerUserDeletion,
  cancelAgentTriggerUserDeletion: db.cancelAgentTriggerUserDeletion,
  drainAgentTriggerDeliveriesForUser,
  prepareAgentTriggerUserPurge,
  cancelAgentTriggerUserPurge,
  purgeAgentTriggerDeliveriesForUser,
  revokeUserCodeEnvironmentWorkers: async (userId) =>
    revokeUserCodeEnvironmentWorkers({
      mongoose,
      userId,
      appConfig: await getAppConfig({ baseOnly: true }),
    }),
  deleteUserById: db.deleteUserById,
  deleteUserCodeEnvironments: db.deleteUserCodeEnvironments,
  invalidateCodeEnvironmentConfigCache,
  deleteConfig: db.deleteConfig,
  deleteAclEntries: db.deleteAclEntries,
  deletePasskeysByUser: db.deletePasskeysByUser,
  resolveErasure,
  cancelSubagentTasks: (userId, tenantId) =>
    subagentThreadTaskStore.cancelAndDrainForOwner(userId, tenantId),
  quiesceUserSchedules,
  restoreUserSchedulesFromDeletion,
  generationJobs: GenerationJobManager,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', requireReadUsers, handlers.listUsers);
router.get('/search', requireReadUsers, handlers.searchUsers);
// router.delete('/:id', requireManageUsers, handlers.deleteUser);

module.exports = router;
