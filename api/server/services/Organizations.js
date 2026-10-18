const {
  checkEmailConfig,
  createInviteService,
  getOrganizationsConfig,
  createRegistrationPlanner,
  createOrganizationService,
  updateInterfacePermissions,
} = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');
const { sendEmail } = require('~/server/utils');
const organizationStatus = require('./OrganizationStatus');
const db = require('~/models');

const invites = createInviteService({
  db,
  getConfig: getOrganizationsConfig,
  sendEmail,
  isEmailConfigured: checkEmailConfig,
  clientDomain: process.env.DOMAIN_CLIENT ?? 'http://localhost:3080',
  appName: process.env.APP_TITLE || 'LibreChat',
  recordAuditEntry: db.recordAuditEntry,
  getOrganizationStatus: organizationStatus.getStatus,
});

const organizations = createOrganizationService({
  db,
  getConfig: getOrganizationsConfig,
  provisionRolePermissions: async (tenantId) =>
    updateInterfacePermissions({
      appConfig: await getAppConfig({ baseOnly: true }),
      getRoleByName: db.getRoleByName,
      updateAccessPermissions: db.updateAccessPermissions,
      recordAuditEntry: db.recordAuditEntry,
      tenantId,
    }),
  redeemPendingInvite: (account, inviteId) => invites.redeemPendingInvite(account, inviteId),
  recordAuditEntry: db.recordAuditEntry,
});

const planOrganizationRegistration = createRegistrationPlanner({
  invites,
  countAccounts: () => db.countUsers(),
  claimPlatformOperator: db.claimPlatformOperator,
});

module.exports = { organizations, invites, planOrganizationRegistration };
