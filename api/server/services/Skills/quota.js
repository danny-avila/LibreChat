const { createSkillFileQuotaPersistence, resolveStorageScope } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const db = require('~/models');

const {
  getSharedValue,
  invalidateSharedScope,
  persistSkillFile: upsertSkillFileWithQuota,
  runWithSharedScope,
} = createSkillFileQuotaPersistence({
  resolveScope: resolveStorageScope,
  upsertSkillFile: db.upsertSkillFile,
  recoverCommittedSkillFile: async (row) => {
    const committed = await db.getSkillFileByPath(row.skillId, row.relativePath);
    return committed?.file_id === row.file_id ? committed : null;
  },
  getUserStorageUsage: db.getUserStorageUsage,
  onCleanupError: (error) => logger.error('[upsertSkillFileWithQuota] Cleanup failed:', error),
});

module.exports = {
  getSharedQuotaValue: getSharedValue,
  invalidateSharedQuotaScope: invalidateSharedScope,
  upsertSkillFileWithQuota,
  runWithSharedScope,
};
