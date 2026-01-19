const { logger } = require('@vestai/data-schemas');
const { updateInterfacePermissions: updateInterfacePerms } = require('@vestai/api');
const { getRoleByName, updateAccessPermissions } = require('./Role');

/**
 * Update interface permissions based on app configuration.
 * Must be done independently from loading the app config.
 * @param {AppConfig} appConfig
 */
async function updateInterfacePermissions(appConfig) {
  try {
    await updateInterfacePerms({
      appConfig,
      getRoleByName,
      updateAccessPermissions,
    });
  } catch (error) {
    logger.error('Error updating interface permissions:', error);
  }
}

module.exports = {
  updateInterfacePermissions,
};
