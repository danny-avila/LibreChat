const {
  CacheKeys,
  SystemRoles,
  roleDefaults,
  PermissionTypes,
  removeNullishValues,
  agentPermissionsSchema,
  promptPermissionsSchema,
  bookmarkPermissionsSchema,
  multiConvoPermissionsSchema,
} = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const Role = require('~/models/schema/roleSchema');
const { logger } = require('~/config');

/**
 * Retrieve a role by name and convert the found role document to a plain object.
 * If the role with the given name doesn't exist and the name is a system defined role, create it and return the lean version.
 *
 * @param {string} roleName - The name of the role to find or create.
 * @param {string|string[]} [fieldsToSelect] - The fields to include or exclude in the returned document.
 * @returns {Promise<Object>} A plain object representing the role document.
 */
const getRoleByName = async function (roleName, fieldsToSelect = null) {
  try {
    const cache = getLogStores(CacheKeys.ROLES);
    const cachedRole = await cache.get(roleName);
    if (cachedRole) {
      return cachedRole;
    }
    let query = Role.findOne({ name: roleName });
    if (fieldsToSelect) {
      query = query.select(fieldsToSelect);
    }
    let role = await query.lean().exec();

    if (!role && SystemRoles[roleName]) {
      role = roleDefaults[roleName];
      role = await new Role(role).save();
      await cache.set(roleName, role);
      return role.toObject();
    }
    await cache.set(roleName, role);
    return role;
  } catch (error) {
    throw new Error(`Failed to retrieve or create role: ${error.message}`);
  }
};

/**
 * Update role values by name.
 *
 * @param {string} roleName - The name of the role to update.
 * @param {Partial<TRole>} updates - The fields to update.
 * @returns {Promise<TRole>} Updated role document.
 */
const updateRoleByName = async function (roleName, updates) {
  try {
    const cache = getLogStores(CacheKeys.ROLES);
    const role = await Role.findOneAndUpdate(
      { name: roleName },
      { $set: updates },
      { new: true, lean: true },
    )
      .select('-__v')
      .lean()
      .exec();
    await cache.set(roleName, role);
    return role;
  } catch (error) {
    throw new Error(`Failed to update role: ${error.message}`);
  }
};

const permissionSchemas = {
  [PermissionTypes.AGENTS]: agentPermissionsSchema,
  [PermissionTypes.PROMPTS]: promptPermissionsSchema,
  [PermissionTypes.BOOKMARKS]: bookmarkPermissionsSchema,
  [PermissionTypes.MULTI_CONVO]: multiConvoPermissionsSchema,
};

/**
 * Updates access permissions for a specific role and multiple permission types.
 * @param {SystemRoles} roleName - The role to update.
 * @param {Object.<PermissionTypes, Object.<Permissions, boolean>>} permissionsUpdate - Permissions to update and their values.
 */
async function updateAccessPermissions(roleName, permissionsUpdate) {
  const updates = {};
  for (const [permissionType, permissions] of Object.entries(permissionsUpdate)) {
    if (permissionSchemas[permissionType]) {
      updates[permissionType] = removeNullishValues(permissions);
    }
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  try {
    const role = await getRoleByName(roleName);
    if (!role) {
      return;
    }

    const updatedPermissions = {};
    let hasChanges = false;

    for (const [permissionType, permissions] of Object.entries(updates)) {
      const currentPermissions = role[permissionType] || {};
      updatedPermissions[permissionType] = { ...currentPermissions };

      for (const [permission, value] of Object.entries(permissions)) {
        if (currentPermissions[permission] !== value) {
          updatedPermissions[permissionType][permission] = value;
          hasChanges = true;
          logger.info(
            `Updating '${roleName}' role ${permissionType} '${permission}' permission from ${currentPermissions[permission]} to: ${value}`,
          );
        }
      }
    }

    if (hasChanges) {
      await updateRoleByName(roleName, updatedPermissions);
      logger.info(`Updated '${roleName}' role permissions`);
    } else {
      logger.info(`No changes needed for '${roleName}' role permissions`);
    }
  } catch (error) {
    logger.error(`Failed to update ${roleName} role permissions:`, error);
  }
}

/**
 * Initialize default roles in the system.
 * Creates the default roles (ADMIN, USER) if they don't exist in the database.
 * Updates existing roles with new permission types if they're missing.
 *
 * @returns {Promise<void>}
 */
const initializeRoles = async function () {
  const defaultRoles = [SystemRoles.ADMIN, SystemRoles.USER];

  for (const roleName of defaultRoles) {
    let role = await Role.findOne({ name: roleName });

    if (!role) {
      // Create new role if it doesn't exist
      role = new Role(roleDefaults[roleName]);
    } else {
      // Add missing permission types
      let isUpdated = false;
      for (const permType of Object.values(PermissionTypes)) {
        if (!role[permType]) {
          role[permType] = roleDefaults[roleName][permType];
          isUpdated = true;
        }
      }
      if (isUpdated) {
        await role.save();
      }
    }
    await role.save();
  }
};
module.exports = {
  getRoleByName,
  initializeRoles,
  updateRoleByName,
  updateAccessPermissions,
};
