const { logger } = require('~/config');
const { getCustomConfig } = require('~/server/services/Config');

/**
 * Loads the tenant configurations from the custom configuration.
 * @returns {Promise<Array>} Array of tenant configurations.
 */
async function getOpenIdTenants() {
  try {
    const customConfig = await getCustomConfig();
    if (customConfig?.openid?.tenants) {
      return customConfig.openid.tenants;
    }
  } catch (err) {
    logger.error('Failed to load custom configuration for OpenID tenants:', err);
  }
  return [];
}

/**
 * Chooses the OpenID strategy name based on the email domain.
 * It consults the global tenant mapping (built in setupOpenId).
 * @param {import('express').Request} req - The Express request object.
 * @returns {Promise<string>} - The chosen strategy name.
 */
async function chooseOpenIdStrategy(req) {
  if (req.query.email) {
    const email = req.query.email;
    const domain = email.split('@')[1].toLowerCase();
    const tenants = await getOpenIdTenants();

    // Iterate over the tenants and return the strategy name of the first matching tenant
    for (const tenant of tenants) {
      if (tenant.domains) {
        const tenantDomains = tenant.domains.split(',').map(s => s.trim().toLowerCase());
        if (tenantDomains.includes(domain)) {
          // Look up the registered strategy via the global mapping.
          if (tenant.name && tenant.name.trim() && global.__openidTenantMapping) {
            const mapped = global.__openidTenantMapping.get(tenant.name.trim().toLowerCase());
            if (mapped) {
              return mapped;
            }
          }
          return 'openid'; // Fallback if no mapping exists.
        }
      }
    }
  }
  return 'openid';
}

module.exports = { getOpenIdTenants, chooseOpenIdStrategy };