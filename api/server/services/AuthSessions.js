const { isOrganizationsEnabled, createAuthSessionHelpers } = require('@librechat/api');
const {
  getUserById,
  findSession,
  deleteSession,
  deleteAllUserSessions,
  deleteAllAccountSessions,
} = require('~/models');
const organizationStatus = require('./OrganizationStatus');

module.exports = createAuthSessionHelpers({
  getUserById,
  findSession,
  deleteSession,
  deleteAllUserSessions,
  deleteAllAccountSessions,
  isOrganizationsEnabled,
  getOrganizationStatus: organizationStatus.getStatus,
});
