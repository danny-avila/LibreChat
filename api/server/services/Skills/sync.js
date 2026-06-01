const { FileContext, skillSyncConfigSchema } = require('librechat-data-provider');
const {
  getStorageMetadata,
  createGitHubSkillSyncRunner,
  startGitHubSkillSyncScheduler,
} = require('@librechat/api');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const db = require('~/models');
const { getAppConfig } = require('~/server/services/Config');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');

const SYSTEM_USER_ID = '000000000000000000000000';
const REQUEST_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;

let appConfigRef;
let runner;
let scheduler;
const requestSyncsInFlight = new Set();

async function loadCurrentAppConfig() {
  try {
    const appConfig = await getAppConfig({ baseOnly: true });
    appConfigRef = appConfig;
    return appConfig;
  } catch (error) {
    if (appConfigRef) {
      return appConfigRef;
    }
    throw error;
  }
}

async function getSyncConfig(loadAppConfig = loadCurrentAppConfig) {
  const appConfig = await loadAppConfig();
  return appConfig?.skillSync;
}

async function resolveSkillStorage({ isImage = false, loadAppConfig = loadCurrentAppConfig } = {}) {
  const appConfig = await loadAppConfig();
  const source = getFileStrategy(appConfig, { context: FileContext.skill_file, isImage });
  const strategy = getStrategyFunctions(source);
  if (!strategy.saveBuffer) {
    throw new Error(`Storage backend "${source}" does not support file writes`);
  }
  return { source, saveBuffer: strategy.saveBuffer };
}

async function getSyntheticReq({ userId = SYSTEM_USER_ID, tenantId, loadAppConfig } = {}) {
  const appConfig = await (loadAppConfig ?? loadCurrentAppConfig)();
  return {
    config: appConfig,
    user: {
      id: userId,
      _id: userId,
      tenantId,
    },
  };
}

function createRunner({ getConfig, loadAppConfig } = {}) {
  const resolveAppConfig = loadAppConfig ?? loadCurrentAppConfig;
  const resolveConfig = getConfig ?? (() => getSyncConfig(resolveAppConfig));
  const createdRunner = createGitHubSkillSyncRunner({
    getConfig: resolveConfig,
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
    grantPermission: async ({
      principalType,
      principalId,
      resourceType,
      resourceId,
      accessRoleId,
      grantedBy,
    }) => {
      // Default access roles are seeded globally (no tenantId) under runAsSystem,
      // but the runner may execute inside a source's tenant context. Resolve the
      // role outside tenant isolation so the global role matches, then write the
      // ACL entry in the active (tenant) context so tenant users can see it.
      const role = await runAsSystem(() => db.findRoleByIdentifier(accessRoleId));
      if (!role) {
        throw new Error(`Role ${accessRoleId} not found`);
      }
      if (role.resourceType !== resourceType) {
        throw new Error(
          `Role ${accessRoleId} is for ${role.resourceType} resources, not ${resourceType}`,
        );
      }
      return db.grantPermission(
        principalType,
        principalId,
        resourceType,
        resourceId,
        role.permBits,
        grantedBy,
        undefined,
        role._id,
      );
    },
    saveBuffer: async ({ userId, buffer, fileName, basePath, isImage, tenantId }) => {
      const storage = await resolveSkillStorage({ isImage, loadAppConfig: resolveAppConfig });
      const filepath = await storage.saveBuffer({
        userId: userId ?? SYSTEM_USER_ID,
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
      await strategy.deleteFile(
        await getSyntheticReq({
          userId: file.user?.toString?.() ?? file.user ?? SYSTEM_USER_ID,
          tenantId: file.tenantId,
          loadAppConfig: resolveAppConfig,
        }),
        file,
      );
    },
  });
  return {
    getStatus: createdRunner.getStatus,
    runOnce: createdRunner.runOnce,
  };
}

function parseSkillSyncConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const parsed = skillSyncConfigSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn('[GitHubSkillSync] Ignoring invalid request-scoped skill sync config', {
      issues: parsed.error.flatten(),
    });
    return undefined;
  }
  return parsed.data;
}

function isSameSkillSyncConfig(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function getRequestSkillSyncConfig(appConfig, user) {
  const resolved = parseSkillSyncConfig(appConfig?.skillSync);
  if (!resolved?.github?.enabled || resolved.github.sources.length === 0) {
    return undefined;
  }

  const base = parseSkillSyncConfig(appConfig?.config?.skillSync);
  if (isSameSkillSyncConfig(resolved, base)) {
    return undefined;
  }

  const tenantId = typeof user?.tenantId === 'string' && user.tenantId ? user.tenantId : undefined;
  return {
    ...resolved,
    github: {
      ...resolved.github,
      runOnStartup: false,
      sources: resolved.github.sources.map((source) => ({
        ...source,
        tenantId,
      })),
    },
  };
}

function toTimestamp(value) {
  if (!value) {
    return 0;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getLastAttemptAt(source) {
  return Math.max(
    toTimestamp(source.finishedAt),
    toTimestamp(source.startedAt),
    toTimestamp(source.updatedAt),
    toTimestamp(source.lastSuccessAt),
    toTimestamp(source.lastFailureAt),
  );
}

function shouldRunRequestSync(status) {
  if (!status.enabled || status.sources.length === 0) {
    return false;
  }
  const intervalMs = Math.max(
    REQUEST_SYNC_MIN_INTERVAL_MS,
    (status.intervalMinutes ?? 60) * 60 * 1000,
  );
  const now = Date.now();
  return status.sources.some((source) => {
    if (source.status === 'running') {
      return false;
    }
    const lastAttemptAt = getLastAttemptAt(source);
    return !lastAttemptAt || now - lastAttemptAt >= intervalMs;
  });
}

function getRequestSyncKey(config, user) {
  const tenantId = user?.tenantId ?? '';
  const sources = config.github.sources
    .map((source) => source.id)
    .sort()
    .join(',');
  return `${tenantId}:${sources}`;
}

async function maybeRunGitHubSkillSyncForRequest(req) {
  const config = getRequestSkillSyncConfig(req.config, req.user);
  if (!config) {
    return false;
  }

  const syncKey = getRequestSyncKey(config, req.user);
  if (requestSyncsInFlight.has(syncKey)) {
    return false;
  }

  const loadAppConfig = async () => req.config;
  const requestRunner = createRunner({
    getConfig: async () => config,
    loadAppConfig,
  });
  const status = await requestRunner.getStatus();
  if (!shouldRunRequestSync(status)) {
    return false;
  }

  requestSyncsInFlight.add(syncKey);
  void requestRunner
    .runOnce()
    .catch((error) => logger.error('[GitHubSkillSync] Request-scoped sync failed:', error))
    .finally(() => requestSyncsInFlight.delete(syncKey));
  return true;
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
  maybeRunGitHubSkillSyncForRequest,
  stopGitHubSkillSyncScheduler,
};
