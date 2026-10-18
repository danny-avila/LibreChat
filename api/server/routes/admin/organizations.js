const express = require('express');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireOrganizationsEnabled, createAdminOrganizationsHandlers } = require('@librechat/api');
const { startOrganizationDeletion } = require('~/server/services/OrganizationDeletion');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const organizationStatus = require('~/server/services/OrganizationStatus');
const { requireAdminAuth } = require('~/server/middleware');
const db = require('~/models');

const handlers = createAdminOrganizationsHandlers({
  db,
  evictOrganizationStatus: organizationStatus.evict,
  startOrganizationDeletion,
  recordAuditEntry: db.recordAuditEntry,
});

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

/** The platform operator's organizations: only in organizations mode, only the operator. */
const organizations = express.Router();
organizations.use(requireOrganizationsEnabled, requireAdminAuth, requireAdminAccess);
organizations.get('/', handlers.listOrganizations);
organizations.get('/:tenantId', handlers.getOrganization);
organizations.patch('/:tenantId', handlers.renameOrganization);
organizations.post('/:tenantId/suspend', handlers.suspendOrganization);
organizations.post('/:tenantId/reactivate', handlers.reactivateOrganization);
organizations.delete('/:tenantId', handlers.deleteOrganization);

/** The platform operator's view of every login account. */
const accounts = express.Router();
accounts.use(requireOrganizationsEnabled, requireAdminAuth, requireAdminAccess);
accounts.get('/', handlers.listAccounts);
accounts.get('/:accountId', handlers.getAccount);

module.exports = { organizations, accounts };
