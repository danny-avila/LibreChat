const { logger } = require('@librechat/data-schemas');
const db = require('~/models');

/**
 * Adds `tenantName` to a user payload when `tenantId` is set.
 * Does not mutate persisted user documents.
 */
async function enrichUserWithTenant(userData) {
  if (!userData || typeof userData !== 'object') {
    return userData;
  }

  const tenantId = typeof userData.tenantId === 'string' ? userData.tenantId.trim() : '';
  if (!tenantId) {
    return userData;
  }

  try {
    const tenant = await db.findTenantById(tenantId);
    if (tenant?.name) {
      userData.tenantName = tenant.name;
    }
  } catch (error) {
    logger.error('[enrichUserWithTenant] Failed to resolve tenant name', error);
  }

  return userData;
}

module.exports = { enrichUserWithTenant };
