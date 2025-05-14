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

    const unsetFields = {};
    const permissionTypes = Object.keys(permissionsSchema.shape || {});
    for (const permType of permissionTypes) {
      if (role[permType] && typeof role[permType] === 'object') {
        logger.info(
          `Migrating '${roleName}' role from old schema: found '${permType}' at top level`,
        );

        updatedPermissions[permType] = {
          ...updatedPermissions[permType],
          ...role[permType],
        };

        unsetFields[permType] = 1;
        hasChanges = true;
      }
    }

    // Process the current updates
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
      const updateObj = { permissions: updatedPermissions };

      if (Object.keys(unsetFields).length > 0) {
        logger.info(
          `Unsetting old schema fields for '${roleName}' role: ${Object.keys(unsetFields).join(', ')}`,
        );

        try {
          await Role.updateOne(
            { name: roleName },
            {
              $set: updateObj,
              $unset: unsetFields,
            },
          );

          const cache = getLogStores(CacheKeys.ROLES);
          const updatedRole = await Role.findOne({ name: roleName }).select('-__v').lean().exec();
          await cache.set(roleName, updatedRole);

          logger.info(`Updated role '${roleName}' and removed old schema fields`);
        } catch (updateError) {
          logger.error(`Error during role migration update: ${updateError.message}`);
          throw updateError;
        }
      } else {
        // Standard update if no migration needed
        await updateRoleByName(roleName, updateObj);
      }

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

/**
 * Migrates roles from old schema to new schema structure.
 * This can be called directly to fix existing roles.
 *
 * @param {string} [roleName] - Optional specific role to migrate. If not provided, migrates all roles.
 * @returns {Promise<number>} Number of roles migrated.
 */
const migrateRoleSchema = async function (roleName) {
  try {
    // Get roles to migrate
    let roles;
    if (roleName) {
      const role = await Role.findOne({ name: roleName });
      roles = role ? [role] : [];
    } else {
      roles = await Role.find({});
    }

    logger.info(`Migrating ${roles.length} roles to new schema structure`);
    let migratedCount = 0;

    for (const role of roles) {
      const permissionTypes = Object.keys(permissionsSchema.shape || {});
      const unsetFields = {};
      let hasOldSchema = false;

      // Check for old schema fields
      for (const permType of permissionTypes) {
        if (role[permType] && typeof role[permType] === 'object') {
          hasOldSchema = true;

          // Ensure permissions object exists
          role.permissions = role.permissions || {};

          // Migrate permissions from old location to new
          role.permissions[permType] = {
            ...role.permissions[permType],
            ...role[permType],
          };

          // Mark field for removal
          unsetFields[permType] = 1;
        }
      }

      if (hasOldSchema) {
        try {
          logger.info(`Migrating role '${role.name}' from old schema structure`);

          // Simple update operation
          await Role.updateOne(
            { _id: role._id },
            {
              $set: { permissions: role.permissions },
              $unset: unsetFields,
            },
          );

          // Refresh cache
          const cache = getLogStores(CacheKeys.ROLES);
          const updatedRole = await Role.findById(role._id).lean().exec();
          await cache.set(role.name, updatedRole);

          migratedCount++;
          logger.info(`Migrated role '${role.name}'`);
        } catch (error) {
          logger.error(`Failed to migrate role '${role.name}': ${error.message}`);
        }
      }
    }

    logger.info(`Migration complete: ${migratedCount} roles migrated`);
    return migratedCount;
  } catch (error) {
    logger.error(`Role schema migration failed: ${error.message}`);
    throw error;
  }
};

module.exports = {
  Role,
  getRoleByName,
  initializeRoles,
  updateRoleByName,
  updateAccessPermissions,
  migrateRoleSchema,
};
