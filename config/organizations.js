const { runInAccounts } = require('@librechat/data-schemas');
const { configureOrganizations, isOrganizationsEnabled } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');

/**
 * Applies the deployment's `organizations` setting as the server does at startup, so the
 * services a script calls behave as the server's would. Resolves whether it is on.
 */
async function applyOrganizationsMode() {
  const appConfig = await getAppConfig({ baseOnly: true });
  configureOrganizations(appConfig?.organizations);
  return isOrganizationsEnabled();
}

/**
 * Runs `operation` where a person's sign-in record lives. In organizations mode that is the
 * login account in the accounts tenant, which holds every credential (member records hold
 * none); otherwise the ambient context, exactly as before organizations.
 */
function inLoginContext(operation) {
  return isOrganizationsEnabled() ? runInAccounts(operation) : operation();
}

module.exports = { applyOrganizationsMode, inLoginContext };
