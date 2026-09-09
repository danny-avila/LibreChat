const { persistSkillFileWithQuota, resolveStorageScope } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const db = require('~/models');

/**
 * Quota-checks a SkillFile replacement against the requester's ledger.
 * Blob cleanup stays with the caller because each write workflow already owns the
 * surrounding multi-file rollback journal.
 */
async function upsertSkillFileWithQuota(req, row) {
  const replacing = await db.getSkillFileByPath(row.skillId, row.relativePath);
  return persistSkillFileWithQuota(
    {
      scope: resolveStorageScope(req),
      row,
      write: db.upsertSkillFile,
      rollback: null,
      getUserStorageUsage: db.getUserStorageUsage,
      replacing,
      replacedBytes: replacing?.bytes,
    },
    (error) => logger.error('[upsertSkillFileWithQuota] Cleanup failed:', error),
  );
}

module.exports = { upsertSkillFileWithQuota };
