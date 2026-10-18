const { logger } = require('@librechat/data-schemas');
const { createOrganizationDeleter } = require('@librechat/api');
const { eraseUserRecord } = require('~/server/controllers/UserController');
const { invalidateConfigCaches } = require('~/server/services/Config');
const organizationStatus = require('./OrganizationStatus');
const db = require('~/models');

/**
 * The cascade runs outside any HTTP exchange: file deletion builds its request on a bare
 * prototype, as the delete-user CLI does, and there is no browser cookie to clear.
 */
const backgroundRequest = { baseUrl: '', query: {}, body: {}, headers: {} };
const noBrowser = { clearCookie: () => undefined, cookie: () => undefined };

const deleter = createOrganizationDeleter({
  db,
  eraseMember: (member) => eraseUserRecord(backgroundRequest, noBrowser, member),
  forgetOrganization: async (tenantId) => {
    organizationStatus.evict(tenantId);
    await invalidateConfigCaches(tenantId);
  },
  recordAuditEntry: db.recordAuditEntry,
});

/** Starts erasing an organization marked `deleting`; failures stay `deleting` and resume. */
function startOrganizationDeletion(tenantId, requestedBy) {
  void deleter.deleteOrganization(tenantId, requestedBy).catch((error) => {
    logger.error(`[organizations] Deletion of ${tenantId} will resume later`, error);
  });
}

module.exports = {
  startOrganizationDeletion,
  resumePendingDeletions: deleter.resumePendingDeletions,
};
