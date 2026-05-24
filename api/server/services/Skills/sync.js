const { FileContext } = require('librechat-data-provider');
const {
  getStorageMetadata,
  createGitHubSkillSyncRunner,
  startGitHubSkillSyncScheduler,
} = require('@librechat/api');
const { runAsSystem } = require('@librechat/data-schemas');
const db = require('~/models');
const { grantPermission } = require('~/server/services/PermissionService');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');

const SYSTEM_USER_ID = '000000000000000000000000';

let appConfigRef;
let runner;
let scheduler;

function getSyncConfig() {
  return appConfigRef?.skillSync ?? appConfigRef?.config?.skillSync;
}

function resolveSkillStorage({ isImage = false } = {}) {
  const source = getFileStrategy(appConfigRef, { context: FileContext.skill_file, isImage });
  const strategy = getStrategyFunctions(source);
  if (!strategy.saveBuffer) {
    throw new Error(`Storage backend "${source}" does not support file writes`);
  }
  return { source, saveBuffer: strategy.saveBuffer };
}

function getSyntheticReq() {
  return {
    config: appConfigRef,
    user: {
      id: SYSTEM_USER_ID,
      _id: SYSTEM_USER_ID,
    },
  };
}

function createRunner() {
  const createdRunner = createGitHubSkillSyncRunner({
    getConfig: getSyncConfig,
    getCredentialToken: db.getSkillSyncCredentialToken,
    getCredentialSummary: db.getSkillSyncCredentialSummary,
    listCredentials: db.listSkillSyncCredentials,
    listStatuses: db.listSkillSyncStatuses,
    upsertStatus: db.upsertSkillSyncStatus,
    tryAcquireLock: db.tryAcquireSkillSyncLock,
    refreshLock: db.refreshSkillSyncLock,
    releaseLock: db.releaseSkillSyncLock,
    createSkill: db.createSkill,
    updateSkill: db.updateSkill,
    getSkillById: db.getSkillById,
    findSkillBySourceIdentity: db.findSkillBySourceIdentity,
    listSkillsBySource: db.listSkillsBySource,
    listSkillFiles: db.listSkillFiles,
    getSkillFileByPath: db.getSkillFileByPath,
    upsertSkillFile: db.upsertSkillFile,
    deleteSkillFile: db.deleteSkillFile,
    deleteSkill: db.deleteSkill,
    grantPermission,
    saveBuffer: async ({ buffer, fileName, basePath, isImage, tenantId }) => {
      const storage = resolveSkillStorage({ isImage });
      const filepath = await storage.saveBuffer({
        userId: SYSTEM_USER_ID,
        buffer,
        fileName,
        basePath,
        tenantId,
      });
      return {
        filepath,
        source: storage.source,
        ...getStorageMetadata({ filepath, source: storage.source }),
      };
    },
    deleteFile: async (file) => {
      const strategy = getStrategyFunctions(file.source);
      if (!strategy.deleteFile) {
        return;
      }
      await strategy.deleteFile(getSyntheticReq(), file);
    },
  });
  return {
    getStatus: createdRunner.getStatus,
    runOnce: () => runAsSystem(createdRunner.runOnce),
  };
}

function initializeGitHubSkillSync(appConfig) {
  appConfigRef = appConfig;
  runner = createRunner();
  scheduler = startGitHubSkillSyncScheduler({
    getConfig: getSyncConfig,
    runner,
  });
  return { runner, scheduler };
}

function getGitHubSkillSyncRunner() {
  if (!runner) {
    runner = createRunner();
  }
  return runner;
}

function stopGitHubSkillSyncScheduler() {
  if (scheduler) {
    scheduler.stop();
    scheduler = undefined;
  }
}

module.exports = {
  initializeGitHubSkillSync,
  getGitHubSkillSyncRunner,
  stopGitHubSkillSyncScheduler,
};
