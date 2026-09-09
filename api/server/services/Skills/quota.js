const { createSkillFileQuotaPersistence, resolveStorageScope } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const db = require('~/models');

const { getSharedValue, invalidateSharedScope, persistSkillFile, runWithSharedScope } =
  createSkillFileQuotaPersistence({
    resolveScope: resolveStorageScope,
    upsertSkillFile: db.upsertSkillFile,
    recoverCommittedSkillFile: async (row) => {
      const committed = await db.getSkillFileByPath(row.skillId, row.relativePath);
      return committed?.file_id === row.file_id ? committed : null;
    },
    repairCommittedSkillFile: async (row) => db.reconcileSkillFileCount(row.skillId),
    getUserStorageUsage: db.getUserStorageUsage,
    onCleanupError: (error) => logger.error('[upsertSkillFileWithQuota] Cleanup failed:', error),
  });

const normalizeIdentity = (value) => (value == null ? undefined : String(value));

const upsertSkillFileWithQuota = (req, row, replacing) =>
  persistSkillFile(
    req,
    {
      ...row,
      skillId: normalizeIdentity(row.skillId),
      author: normalizeIdentity(row.author),
    },
    replacing
      ? {
          ...replacing,
          skillId: normalizeIdentity(replacing.skillId),
          author: normalizeIdentity(replacing.author),
        }
      : null,
  );

module.exports = {
  getSharedQuotaValue: getSharedValue,
  invalidateSharedQuotaScope: invalidateSharedScope,
  upsertSkillFileWithQuota,
  runWithSharedScope,
};
