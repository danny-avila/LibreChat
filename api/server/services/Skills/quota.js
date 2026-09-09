const { createSkillFileQuotaPersistence, resolveStorageScope } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const db = require('~/models');

const { persistSkillFile: upsertSkillFileWithQuota, runWithSharedScope } =
  createSkillFileQuotaPersistence({
    resolveScope: resolveStorageScope,
    upsertSkillFile: db.upsertSkillFile,
    getUserStorageUsage: db.getUserStorageUsage,
    onCleanupError: (error) => logger.error('[upsertSkillFileWithQuota] Cleanup failed:', error),
  });

module.exports = { upsertSkillFileWithQuota, runWithSharedScope };
