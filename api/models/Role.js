const mongoose = require('mongoose');
const {
  CacheKeys,
  SystemRoles,
  roleDefaults,
  PermissionTypes,
  permissionsSchema,
  removeNullishValues,
} = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const { roleSchema } = require('@librechat/data-schemas');
const { logger } = require('~/config');

const Role = mongoose.model('Role', roleSchema);

/**
 * Retrieve a role by name and convert the found role document to a plain object.
 * If the role with the given name doesn't exist and the name is a system defined role,
 * create it and return the lean version.
 *
 * @param {string} roleName - The name of the role to find or create.
 * @param {string|string[]} [fieldsToSelect] - The fields to include or exclude in the returned document.
 * @returns {Promise<Object>} A plain object representing the role document.
 */
const getRoleByName = async function (roleName, fieldsToSelect = null) {
  const cache = getLogStores(CacheKeys.ROLES);
  try {
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
      role = await new Role(roleDefaults[roleName]).save();
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
  const cache = getLogStores(CacheKeys.ROLES);
  try {
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

/**
 * Updates access permissions for a specific role and multiple permission types.
 * @param {string} roleName - The role to update.
 * @param {Object.<PermissionTypes, Object.<Permissions, boolean>>} permissionsUpdate - Permissions to update and their values.
 */
async function updateAccessPermissions(roleName, permissionsUpdate) {
  // Filter and clean the permission updates based on our schema definition.
  const updates = {};
  for (const [permissionType, permissions] of Object.entries(permissionsUpdate)) {
    if (permissionsSchema.shape && permissionsSchema.shape[permissionType]) {
      updates[permissionType] = removeNullishValues(permissions);
    }
  }
  if (!Object.keys(updates).length) {
    return;
  }

  try {
    const role = await getRoleByName(roleName);
    if (!role) {
      return;
    }

    const currentPermissions = role.permissions || {};
    const updatedPermissions = { ...currentPermissions };
    let hasChanges = false;

    for (const [permissionType, permissions] of Object.entries(updates)) {
      const currentTypePermissions = currentPermissions[permissionType] || {};
      updatedPermissions[permissionType] = { ...currentTypePermissions };

      for (const [permission, value] of Object.entries(permissions)) {
        if (currentTypePermissions[permission] !== value) {
          updatedPermissions[permissionType][permission] = value;
          hasChanges = true;
          logger.info(
            `Updating '${roleName}' role permission '${permissionType}' '${permission}' from ${currentTypePermissions[permission]} to: ${value}`,
          );
        }
      }
    }

    if (hasChanges) {
      // Update only the permissions field.
      await updateRoleByName(roleName, { permissions: updatedPermissions });
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
  for (const roleName of [SystemRoles.ADMIN, SystemRoles.USER]) {
    let role = await Role.findOne({ name: roleName });
    const defaultPerms = roleDefaults[roleName].permissions;

    if (!role) {
      // Create new role if it doesn't exist.
      role = new Role(roleDefaults[roleName]);
    } else {
      // Ensure role.permissions is defined.
      role.permissions = role.permissions || {};
      // For each permission type in defaults, add it if missing.
      for (const permType of Object.keys(defaultPerms)) {
        if (role.permissions[permType] == null) {
          role.permissions[permType] = defaultPerms[permType];
        }
      }
    }
    await role.save();
  }
};

module.exports = {
  Role,
  getRoleByName,
  initializeRoles,
  updateRoleByName,
  updateAccessPermissions,
};
