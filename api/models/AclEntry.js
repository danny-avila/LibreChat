const mongoose = require('mongoose');
const { AclEntrySchema, PermissionBits } = require('@librechat/data-schemas');

const AclEntry = mongoose.model('AclEntry', AclEntrySchema);

/**
 * Find ACL entries for a specific principal (user or group)
 * @param {string} principalType - The type of principal ('user', 'group')
 * @param {string|mongoose.Types.ObjectId} principalId - The ID of the principal
 * @param {string} [resourceType] - Optional filter by resource type
 * @returns {Promise<Array>} Array of ACL entries
 */
const findEntriesByPrincipal = async function (principalType, principalId, resourceType = null) {
  const query = { principalType, principalId };
  if (resourceType) {
    query.resourceType = resourceType;
  }
  return await AclEntry.find(query).lean();
};

/**
 * Find ACL entries for a specific resource
 * @param {string} resourceType - The type of resource ('agent', 'project', 'file')
 * @param {string|mongoose.Types.ObjectId} resourceId - The ID of the resource
 * @returns {Promise<Array>} Array of ACL entries
 */
const findEntriesByResource = async function (resourceType, resourceId) {
  return await AclEntry.find({ resourceType, resourceId }).lean();
};

/**
 * Find all ACL entries for a set of principals (including public)
 * @param {Array<Object>} principalsList - List of principals, each containing { principalType, principalId }
 * @param {string} resourceType - The type of resource
 * @param {string|mongoose.Types.ObjectId} resourceId - The ID of the resource
 * @returns {Promise<Array>} Array of matching ACL entries
 */
const findEntriesByPrincipalsAndResource = async function (
  principalsList,
  resourceType,
  resourceId,
) {
  const principalsQuery = principalsList.map((p) => ({
    principalType: p.principalType,
    ...(p.principalType !== 'public' && { principalId: p.principalId }),
  }));

  return await AclEntry.find({
    $or: principalsQuery,
    resourceType,
    resourceId,
  }).lean();
};

/**
 * Check if a set of principals has a specific permission on a resource
 * @param {Array<Object>} principalsList - List of principals, each containing { principalType, principalId }
 * @param {string} resourceType - The type of resource
 * @param {string|mongoose.Types.ObjectId} resourceId - The ID of the resource
 * @param {number} permissionBit - The permission bit to check (use PermissionBits enum)
 * @returns {Promise<boolean>} Whether any of the principals has the permission
 */
const hasPermission = async function (principalsList, resourceType, resourceId, permissionBit) {
  const principalsQuery = principalsList.map((p) => ({
    principalType: p.principalType,
    ...(p.principalType !== 'public' && { principalId: p.principalId }),
  }));

  const entry = await AclEntry.findOne({
    $or: principalsQuery,
    resourceType,
    resourceId,
    permBits: { $bitsAnySet: permissionBit },
  }).lean();

  return !!entry;
};

/**
 * Get the combined effective permissions for a set of principals on a resource
 * @param {Array<Object>} principalsList - List of principals, each containing { principalType, principalId }
 * @param {string} resourceType - The type of resource
 * @param {string|mongoose.Types.ObjectId} resourceId - The ID of the resource
 * @returns {Promise<Object>} Object with effectiveBits (combined permissions) and sources (individual entries)
 */
const getEffectivePermissions = async function (principalsList, resourceType, resourceId) {
  const aclEntries = await findEntriesByPrincipalsAndResource(
    principalsList,
    resourceType,
    resourceId,
  );

  let effectiveBits = 0;
  const sources = aclEntries.map((entry) => {
    effectiveBits |= entry.permBits;
    return {
      from: entry.principalType,
      principalId: entry.principalId,
      permBits: entry.permBits,
      direct: !entry.inheritedFrom,
      inheritedFrom: entry.inheritedFrom,
    };
  });

  return { effectiveBits, sources };
};

/**
 * Grant permission to a principal for a resource
 * @param {string} principalType - The type of principal ('user', 'group', 'public')
 * @param {string|mongoose.Types.ObjectId|null} principalId - The ID of the principal (null for 'public')
 * @param {string} resourceType - The type of resource
 * @param {string|mongoose.Types.ObjectId} resourceId - The ID of the resource
 * @param {number} permBits - The permission bits to grant
 * @param {string|mongoose.Types.ObjectId} grantedBy - The ID of the user granting the permission
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<Object>} The created or updated ACL entry
 */
const grantPermission = async function (
  principalType,
  principalId,
  resourceType,
  resourceId,
  permBits,
  grantedBy,
  session = null,
) {
  const query = {
    principalType,
    resourceType,
    resourceId,
  };

  if (principalType !== 'public') {
    query.principalId = principalId;
    query.principalModel = principalType === 'user' ? 'User' : 'Group';
  }

  const update = {
    $set: {
      permBits,
      grantedBy,
      grantedAt: new Date(),
    },
  };

  const options = {
    upsert: true,
    new: true,
    ...(session ? { session } : {}),
  };

  return await AclEntry.findOneAndUpdate(query, update, options);
};

/**
 * Revoke permissions from a principal for a resource
 * @param {string} principalType - The type of principal ('user', 'group', 'public')
 * @param {string|mongoose.Types.ObjectId|null} principalId - The ID of the principal (null for 'public')
 * @param {string} resourceType - The type of resource
 * @param {string|mongoose.Types.ObjectId} resourceId - The ID of the resource
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<Object>} The result of the delete operation
 */
const revokePermission = async function (
  principalType,
  principalId,
  resourceType,
  resourceId,
  session = null,
) {
  const query = {
    principalType,
    resourceType,
    resourceId,
  };

  if (principalType !== 'public') {
    query.principalId = principalId;
  }

  const options = session ? { session } : {};

  return await AclEntry.deleteOne(query, options);
};

/**
 * Modify existing permission bits for a principal on a resource
 * @param {string} principalType - The type of principal ('user', 'group', 'public')
 * @param {string|mongoose.Types.ObjectId|null} principalId - The ID of the principal (null for 'public')
 * @param {string} resourceType - The type of resource
 * @param {string|mongoose.Types.ObjectId} resourceId - The ID of the resource
 * @param {number} addBits - Permission bits to add
 * @param {number} removeBits - Permission bits to remove
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<Object>} The updated ACL entry
 */
const modifyPermissionBits = async function (
  principalType,
  principalId,
  resourceType,
  resourceId,
  addBits,
  removeBits,
  session = null,
) {
  const query = {
    principalType,
    resourceType,
    resourceId,
  };

  if (principalType !== 'public') {
    query.principalId = principalId;
  }

  const update = {};

  if (addBits) {
    update.$bit = { permBits: { or: addBits } };
  }

  if (removeBits) {
    if (!update.$bit) update.$bit = {};
    update.$bit.permBits = { ...update.$bit.permBits, and: ~removeBits };
  }

  const options = {
    new: true,
    ...(session ? { session } : {}),
  };

  return await AclEntry.findOneAndUpdate(query, update, options);
};

/**
 * Find all resources of a specific type that a set of principals has access to
 * @param {Array<Object>} principalsList - List of principals, each containing { principalType, principalId }
 * @param {string} resourceType - The type of resource
 * @param {number} requiredPermBit - Required permission bit (use PermissionBits enum)
 * @returns {Promise<Array>} Array of resource IDs
 */
const findAccessibleResources = async function (principalsList, resourceType, requiredPermBit) {
  const principalsQuery = principalsList.map((p) => ({
    principalType: p.principalType,
    ...(p.principalType !== 'public' && { principalId: p.principalId }),
  }));

  const entries = await AclEntry.find({
    $or: principalsQuery,
    resourceType,
    permBits: { $bitsAnySet: requiredPermBit },
  }).distinct('resourceId');

  return entries;
};

module.exports = {
  AclEntry,
  findEntriesByPrincipal,
  findEntriesByResource,
  findEntriesByPrincipalsAndResource,
  hasPermission,
  getEffectivePermissions,
  grantPermission,
  revokePermission,
  modifyPermissionBits,
  findAccessibleResources,
};
