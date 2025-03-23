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

/**
 * Updates access permissions for a specific role and multiple permission types.
 * @param {SystemRoles} roleName - The role to update.
 * @param {Object.<PermissionTypes, Object.<Permissions, boolean>>} permissionsUpdate - Permissions to update and their values.
 */
async function updateAccessPermissions(roleName, permissionsUpdate) {
  const updates = {};
  for (const [permissionType, permissions] of Object.entries(permissionsUpdate)) {
    if (permissionsSchema[permissionType]) {
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

    // Retrieve current permissions or default to an empty object
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
      // Update the permissions field only
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
  const defaultRoles = [SystemRoles.ADMIN, SystemRoles.USER];

  for (const roleName of defaultRoles) {
    let role = await Role.findOne({ name: roleName });

    if (!role) {
      // Create new role if it doesn't exist
      role = new Role(roleDefaults[roleName]);
    } else {
      // Ensure the role has a "permissions" field and add missing permission types
      if (!role.permissions) {
        role.permissions = roleDefaults[roleName].permissions;
      } else {
        const defaultPermissions = roleDefaults[roleName].permissions;
        for (const permType of Object.keys(defaultPermissions)) {
          if (!role.permissions[permType]) {
            role.permissions[permType] = defaultPermissions[permType];
          }
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
