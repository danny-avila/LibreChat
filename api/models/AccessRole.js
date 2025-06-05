const mongoose = require('mongoose');
const { AccessRoleSchema, PermissionBits, RoleBits } = require('@librechat/data-schemas');

const AccessRole = mongoose.model('AccessRole', AccessRoleSchema);

/**
 * Find an access role by its ID
 * @param {string|mongoose.Types.ObjectId} roleId - The role ID
 * @returns {Promise<Object|null>} The role document or null if not found
 */
const findRoleById = async function (roleId) {
  return await AccessRole.findById(roleId).lean();
};

/**
 * Find an access role by its unique identifier
 * @param {string} accessRoleId - The unique identifier (e.g., "agent_viewer")
 * @returns {Promise<Object|null>} The role document or null if not found
 */
const findRoleByIdentifier = async function (accessRoleId) {
  return await AccessRole.findOne({ accessRoleId }).lean();
};

/**
 * Find all access roles for a specific resource type
 * @param {string} resourceType - The type of resource ('agent', 'project', 'file')
 * @returns {Promise<Array>} Array of role documents
 */
const findRolesByResourceType = async function (resourceType) {
  return await AccessRole.find({ resourceType }).lean();
};

/**
 * Find an access role by resource type and permission bits
 * @param {string} resourceType - The type of resource
 * @param {number} permBits - The permission bits (use PermissionBits or RoleBits enum)
 * @returns {Promise<Object|null>} The role document or null if not found
 */
const findRoleByPermissions = async function (resourceType, permBits) {
  return await AccessRole.findOne({ resourceType, permBits }).lean();
};

/**
 * Create a new access role
 * @param {Object} roleData - Role data (accessRoleId, name, description, resourceType, permBits)
 * @returns {Promise<Object>} The created role document
 */
const createRole = async function (roleData) {
  return await AccessRole.create(roleData);
};

/**
 * Update an existing access role
 * @param {string} accessRoleId - The unique identifier of the role to update
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object|null>} The updated role document or null if not found
 */
const updateRole = async function (accessRoleId, updateData) {
  return await AccessRole.findOneAndUpdate(
    { accessRoleId },
    { $set: updateData },
    { new: true },
  ).lean();
};

/**
 * Delete an access role
 * @param {string} accessRoleId - The unique identifier of the role to delete
 * @returns {Promise<Object>} The result of the delete operation
 */
const deleteRole = async function (accessRoleId) {
  return await AccessRole.deleteOne({ accessRoleId });
};

/**
 * Get all predefined roles
 * @returns {Promise<Array>} Array of all role documents
 */
const getAllRoles = async function () {
  return await AccessRole.find().lean();
};

/**
 * Seed default roles if they don't exist
 * @returns {Promise<Object>} Object containing created roles
 */
const seedDefaultRoles = async function () {
  const defaultRoles = [
    {
      accessRoleId: 'agent_viewer',
      name: 'com_ui_role_viewer',
      description: 'com_ui_role_viewer_desc',
      resourceType: 'agent',
      permBits: RoleBits.VIEWER,
    },
    {
      accessRoleId: 'agent_editor',
      name: 'com_ui_role_editor',
      description: 'com_ui_role_editor_desc',
      resourceType: 'agent',
      permBits: RoleBits.EDITOR,
    },
    {
      accessRoleId: 'agent_owner',
      name: 'com_ui_role_owner',
      description: 'com_ui_role_owner_desc',
      resourceType: 'agent',
      permBits: RoleBits.OWNER,
    },
  ];

  const result = {};

  for (const role of defaultRoles) {
    const upsertedRole = await AccessRole.findOneAndUpdate(
      { accessRoleId: role.accessRoleId },
      { $setOnInsert: role },
      { upsert: true, new: true },
    ).lean();

    result[role.accessRoleId] = upsertedRole;
  }

  return result;
};

/**
 * Helper to get the appropriate role for a set of permissions
 * @param {string} resourceType - The type of resource
 * @param {number} permBits - The permission bits
 * @returns {Promise<Object|null>} The matching role or null if none found
 */
const getRoleForPermissions = async function (resourceType, permBits) {
  const exactMatch = await AccessRole.findOne({ resourceType, permBits }).lean();
  if (exactMatch) {
    return exactMatch;
  }

  // If no exact match, find the closest role without exceeding permissions
  const roles = await AccessRole.find({ resourceType }).sort({ permBits: -1 }).lean();

  return roles.find((role) => (role.permBits & permBits) === role.permBits) || null;
};

module.exports = {
  AccessRole,
  findRoleById,
  findRoleByIdentifier,
  findRolesByResourceType,
  findRoleByPermissions,
  createRole,
  updateRole,
  deleteRole,
  getAllRoles,
  seedDefaultRoles,
  getRoleForPermissions,
};
