const { logger } = require('@librechat/data-schemas');
const { updateInterfacePermissions: updateInterfacePerms } = require('@librechat/api');
const { getRoleByName, updateAccessPermissions, getAllRoleNames } = require('./Role');

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
      getAllRoleNames,
    });
  } catch (error) {
    logger.error('Error updating interface permissions:', error);
  }
}

module.exports = {
  updateInterfacePermissions,
};
