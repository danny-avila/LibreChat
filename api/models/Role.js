const {
  SystemRoles,
  CacheKeys,
  roleDefaults,
  PermissionTypes,
  Permissions,
  promptPermissionsSchema,
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

/**
 * Updates the Prompt access for a specific role.
 * @param {SystemRoles} roleName - The role to update the prompt access for.
 * @param {boolean | undefined} [value] - The new value for the prompt access.
 */
async function updatePromptsAccess(roleName, value) {
  if (typeof value === 'undefined') {
    return;
  }

  try {
    const parsedUpdates = promptPermissionsSchema.partial().parse({ [Permissions.USE]: value });
    const role = await getRoleByName(roleName);
    if (!role) {
      return;
    }

    const mergedUpdates = {
      [PermissionTypes.PROMPTS]: {
        ...role[PermissionTypes.PROMPTS],
        ...parsedUpdates,
      },
    };

    await updateRoleByName(roleName, mergedUpdates);
    logger.info(`Updated '${roleName}' role prompts 'USE' permission to: ${value}`);
  } catch (error) {
    logger.error('Failed to update USER role prompts USE permission:', error);
  }
}

/**
 * Initialize default roles in the system.
 * Creates the default roles (ADMIN, USER) if they don't exist in the database.
 *
 * @returns {Promise<void>}
 */
const initializeRoles = async function () {
  const defaultRoles = [SystemRoles.ADMIN, SystemRoles.USER];

  for (const roleName of defaultRoles) {
    let role = await Role.findOne({ name: roleName }).select('name').lean();
    if (!role) {
      role = new Role(roleDefaults[roleName]);
      await role.save();
    }
  }
};

module.exports = {
  getRoleByName,
  initializeRoles,
  updateRoleByName,
  updatePromptsAccess,
};
