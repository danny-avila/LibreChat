const mongoose = require('mongoose');
const { isEnabled } = require('@librechat/api');
const { getTransactionSupport, logger } = require('@librechat/data-schemas');
const { ResourceType, PrincipalType, PrincipalModel } = require('librechat-data-provider');
const {
  entraIdPrincipalFeatureEnabled,
  getUserOwnedEntraGroups,
  getUserEntraGroups,
  getEntraGroupDetailsBatch,
  getGroupMembers,
  getGroupOwners,
} = require('~/server/services/GraphApiService');
const db = require('~/models');

/** @type {boolean|null} */
let transactionSupportCache = null;

/**
 * Validates that the resourceType is one of the supported enum values
 * @param {string} resourceType - The resource type to validate
 * @throws {Error} If resourceType is not valid
 */
const validateResourceType = (resourceType) => {
  const validTypes = Object.values(ResourceType);
  if (!validTypes.includes(resourceType)) {
    throw new Error(`Invalid resourceType: ${resourceType}. Valid types: ${validTypes.join(', ')}`);
  }
};

/**
 * @import { TPrincipal } from 'librechat-data-provider'
 */
/**
 * Grant a permission to a principal for a resource using a role
 * @param {Object} params - Parameters for granting role-based permission
 * @param {string} params.principalType - PrincipalType.USER, PrincipalType.GROUP, or PrincipalType.PUBLIC
 * @param {string|mongoose.Types.ObjectId|null} params.principalId - The ID of the principal (null for PrincipalType.PUBLIC)
 * @param {string} params.resourceType - Type of resource (e.g., 'agent')
 * @param {string|mongoose.Types.ObjectId} params.resourceId - The ID of the resource
 * @param {string} params.accessRoleId - The ID of the role (e.g., AccessRoleIds.AGENT_VIEWER, AccessRoleIds.AGENT_EDITOR)
 * @param {string|mongoose.Types.ObjectId} params.grantedBy - User ID granting the permission
 * @param {mongoose.ClientSession} [params.session] - Optional MongoDB session for transactions
 * @returns {Promise<Object>} The created or updated ACL entry
 */
const grantPermission = async ({
  principalType,
  principalId,
  resourceType,
  resourceId,
  accessRoleId,
  grantedBy,
  session,
}) => {
  try {
    if (!Object.values(PrincipalType).includes(principalType)) {
      throw new Error(`Invalid principal type: ${principalType}`);
    }

    if (principalType !== PrincipalType.PUBLIC && !principalId) {
      throw new Error('Principal ID is required for user, group, and role principals');
    }

    // Validate principalId based on type
    if (principalId && principalType === PrincipalType.ROLE) {
      // Role IDs are strings (role names)
      if (typeof principalId !== 'string' || principalId.trim().length === 0) {
        throw new Error(`Invalid role ID: ${principalId}`);
      }
    } else if (
      principalType &&
      principalType !== PrincipalType.PUBLIC &&
      !mongoose.Types.ObjectId.isValid(principalId)
    ) {
      // User and Group IDs must be valid ObjectIds
      throw new Error(`Invalid principal ID: ${principalId}`);
    }

    if (!resourceId || !mongoose.Types.ObjectId.isValid(resourceId)) {
      throw new Error(`Invalid resource ID: ${resourceId}`);
    }

    validateResourceType(resourceType);

    // Get the role to determine permission bits
    const role = await db.findRoleByIdentifier(accessRoleId);
    if (!role) {
      throw new Error(`Role ${accessRoleId} not found`);
    }

    // Ensure the role is for the correct resource type
    if (role.resourceType !== resourceType) {
      throw new Error(
        `Role ${accessRoleId} is for ${role.resourceType} resources, not ${resourceType}`,
      );
    }
    return await db.grantPermission(
      principalType,
      principalId,
      resourceType,
      resourceId,
      role.permBits,
      grantedBy,
      session,
      role._id,
    );
  } catch (error) {
    logger.error(`[PermissionService.grantPermission] Error: ${error.message}`);
    throw error;
  }
};

/**
 * Check if a user has specific permission bits on a resource
 * @param {Object} params - Parameters for checking permissions
 * @param {string|mongoose.Types.ObjectId} params.userId - The ID of the user
 * @param {string} [params.role] - Optional user role (if not provided, will query from DB)
 * @param {string} params.resourceType - Type of resource (e.g., 'agent')
 * @param {string|mongoose.Types.ObjectId} params.resourceId - The ID of the resource
 * @param {number} params.requiredPermissions - The permission bits required (e.g., 1 for VIEW, 3 for VIEW+EDIT)
 * @returns {Promise<boolean>} Whether the user has the required permission bits
 */
const checkPermission = async ({ userId, role, resourceType, resourceId, requiredPermission }) => {
  try {
    if (typeof requiredPermission !== 'number' || requiredPermission < 1) {
      throw new Error('requiredPermission must be a positive number');
    }

    validateResourceType(resourceType);

    const principals = await db.getUserPrincipals({ userId, role });

    if (principals.length === 0) {
      return false;
    }

    return await db.hasPermission(principals, resourceType, resourceId, requiredPermission);
  } catch (error) {
    logger.error(`[PermissionService.checkPermission] Error: ${error.message}`);
    if (error.message.includes('requiredPermission must be')) {
      throw error;
    }
    return false;
  }
};

/**
 * Get effective permission bitmask for a user on a resource
 * @param {Object} params - Parameters for getting effective permissions
 * @param {string|mongoose.Types.ObjectId} params.userId - The ID of the user
 * @param {string} [params.role] - Optional user role (if not provided, will query from DB)
 * @param {string} params.resourceType - Type of resource (e.g., 'agent')
 * @param {string|mongoose.Types.ObjectId} params.resourceId - The ID of the resource
 * @returns {Promise<number>} Effective permission bitmask
 */
const getEffectivePermissions = async ({ userId, role, resourceType, resourceId }) => {
  try {
    validateResourceType(resourceType);

    const principals = await db.getUserPrincipals({ userId, role });

    if (principals.length === 0) {
      return 0;
    }

    return await db.getEffectivePermissions(principals, resourceType, resourceId);
  } catch (error) {
    logger.error(`[PermissionService.getEffectivePermissions] Error: ${error.message}`);
    return 0;
  }
};

/**
 * Get effective permissions for multiple resources in a batch operation
 * Returns map of resourceId → effectivePermissionBits
 *
 * @param {Object} params - Parameters
 * @param {string|mongoose.Types.ObjectId} params.userId - User ID
 * @param {string} [params.role] - User role (for group membership)
 * @param {string} params.resourceType - Resource type (must be valid ResourceType)
 * @param {Array<mongoose.Types.ObjectId>} params.resourceIds - Array of resource IDs
 * @returns {Promise<Map<string, number>>} Map of resourceId string → permission bits
 * @throws {Error} If resourceType is invalid
 */
const getResourcePermissionsMap = async ({ userId, role, resourceType, resourceIds }) => {
  // Validate resource type - throw on invalid type
  validateResourceType(resourceType);

  // Handle empty input
  if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
    return new Map();
  }

  try {
    // Get user principals (user + groups + public)
    const principals = await db.getUserPrincipals({ userId, role });

    // Use batch method from aclEntry
    const permissionsMap = await db.getEffectivePermissionsForResources(
      principals,
      resourceType,
      resourceIds,
    );

    logger.debug(
      `[PermissionService.getResourcePermissionsMap] Computed permissions for ${resourceIds.length} resources, ${permissionsMap.size} have permissions`,
    );

    return permissionsMap;
  } catch (error) {
    logger.error(`[PermissionService.getResourcePermissionsMap] Error: ${error.message}`, error);
    throw error;
  }
};

/**
 * Find all resources of a specific type that a user has access to with specific permission bits
 * @param {Object} params - Parameters for finding accessible resources
 * @param {string|mongoose.Types.ObjectId} params.userId - The ID of the user
 * @param {string} [params.role] - Optional user role (if not provided, will query from DB)
 * @param {string} params.resourceType - Type of resource (e.g., 'agent')
 * @param {number} params.requiredPermissions - The minimum permission bits required (e.g., 1 for VIEW, 3 for VIEW+EDIT)
 * @returns {Promise<Array>} Array of resource IDs
 */
const findAccessibleResources = async ({ userId, role, resourceType, requiredPermissions }) => {
  try {
    if (typeof requiredPermissions !== 'number' || requiredPermissions < 1) {
      throw new Error('requiredPermissions must be a positive number');
    }

    validateResourceType(resourceType);

    // Get all principals for the user (user + groups + public)
    const principalsList = await db.getUserPrincipals({ userId, role });

    if (principalsList.length === 0) {
      return [];
    }
    return await db.findAccessibleResources(principalsList, resourceType, requiredPermissions);
  } catch (error) {
    logger.error(`[PermissionService.findAccessibleResources] Error: ${error.message}`);
    // Re-throw validation errors
    if (error.message.includes('requiredPermissions must be')) {
      throw error;
    }
    return [];
  }
};

/**
 * Find all publicly accessible resources of a specific type
 * @param {Object} params - Parameters for finding publicly accessible resources
 * @param {string} params.resourceType - Type of resource (e.g., 'agent')
 * @param {number} params.requiredPermissions - The minimum permission bits required (e.g., 1 for VIEW, 3 for VIEW+EDIT)
 * @returns {Promise<Array>} Array of resource IDs
 */
const findPubliclyAccessibleResources = async ({ resourceType, requiredPermissions }) => {
  try {
    if (typeof requiredPermissions !== 'number' || requiredPermissions < 1) {
      throw new Error('requiredPermissions must be a positive number');
    }

    validateResourceType(resourceType);

    return await db.findPublicResourceIds(resourceType, requiredPermissions);
  } catch (error) {
    logger.error(`[PermissionService.findPubliclyAccessibleResources] Error: ${error.message}`);
    if (error.message.includes('requiredPermissions must be')) {
      throw error;
    }
    return [];
  }
};

/**
 * Get available roles for a resource type
 * @param {Object} params - Parameters for getting available roles
 * @param {string} params.resourceType - Type of resource (e.g., 'agent')
 * @returns {Promise<Array>} Array of role definitions
 */
const getAvailableRoles = async ({ resourceType }) => {
  validateResourceType(resourceType);

  return await db.findRolesByResourceType(resourceType);
};

/**
 * Ensures a principal exists in the database based on TPrincipal data
 * Creates user if it doesn't exist locally (for Entra ID users)
 * @param {Object} principal - TPrincipal object from frontend
 * @param {string} principal.type - PrincipalType.USER, PrincipalType.GROUP, or PrincipalType.PUBLIC
 * @param {string} [principal.id] - Local database ID (null for Entra ID principals not yet synced)
 * @param {string} principal.name - Display name
 * @param {string} [principal.email] - Email address
 * @param {string} [principal.source] - 'local' or 'entra'
 * @param {string} [principal.idOnTheSource] - Entra ID object ID for external principals
 * @returns {Promise<string|null>} Returns the principalId for database operations, null for public
 */
const ensurePrincipalExists = async function (principal) {
  if (principal.type === PrincipalType.PUBLIC) {
    return null;
  }

  if (principal.id) {
    return principal.id;
  }

  if (principal.type === PrincipalType.USER && principal.source === 'entra') {
    if (!principal.email || !principal.idOnTheSource) {
      throw new Error('Entra ID user principals must have email and idOnTheSource');
    }

    let existingUser = await db.findUser({ idOnTheSource: principal.idOnTheSource });

    if (!existingUser) {
      existingUser = await db.findUser({ email: principal.email });
    }

    if (existingUser) {
      if (!existingUser.idOnTheSource && principal.idOnTheSource) {
        await db.updateUser(existingUser._id, {
          idOnTheSource: principal.idOnTheSource,
          provider: 'openid',
        });
      }
      return existingUser._id.toString();
    }

    const userData = {
      name: principal.name,
      email: principal.email.toLowerCase(),
      emailVerified: false,
      provider: 'openid',
      idOnTheSource: principal.idOnTheSource,
    };

    const userId = await db.createUser(userData, true, true);
    return userId.toString();
  }

  if (principal.type === PrincipalType.GROUP) {
    throw new Error('Group principals should be handled by group-specific methods');
  }

  throw new Error(`Unsupported principal type: ${principal.type}`);
};

/**
 * Ensures a group principal exists in the database based on TPrincipal data
 * Creates group if it doesn't exist locally (for Entra ID groups)
 * For Entra ID groups, always synchronizes member IDs when authentication context is provided
 * @param {Object} principal - TPrincipal object from frontend
 * @param {string} principal.type - Must be PrincipalType.GROUP
 * @param {string} [principal.id] - Local database ID (null for Entra ID principals not yet synced)
 * @param {string} principal.name - Display name
 * @param {string} [principal.email] - Email address
 * @param {string} [principal.description] - Group description
 * @param {string} [principal.source] - 'local' or 'entra'
 * @param {string} [principal.idOnTheSource] - Entra ID object ID for external principals
 * @param {Object} [authContext] - Optional authentication context for fetching member data
 * @param {string} [authContext.accessToken] - Access token for Graph API calls
 * @param {string} [authContext.sub] - Subject identifier
 * @returns {Promise<string>} Returns the groupId for database operations
 */
const ensureGroupPrincipalExists = async function (principal, authContext = null) {
  if (principal.type !== PrincipalType.GROUP) {
    throw new Error(`Invalid principal type: ${principal.type}. Expected '${PrincipalType.GROUP}'`);
  }

  if (principal.source === 'entra') {
    if (!principal.name || !principal.idOnTheSource) {
      throw new Error('Entra ID group principals must have name and idOnTheSource');
    }

    let memberIds = [];
    if (authContext && authContext.accessToken && authContext.sub) {
      try {
        memberIds = await getGroupMembers(
          authContext.accessToken,
          authContext.sub,
          principal.idOnTheSource,
        );

        // Include group owners as members if feature is enabled
        if (isEnabled(process.env.ENTRA_ID_INCLUDE_OWNERS_AS_MEMBERS)) {
          const ownerIds = await getGroupOwners(
            authContext.accessToken,
            authContext.sub,
            principal.idOnTheSource,
          );
          if (ownerIds && ownerIds.length > 0) {
            memberIds.push(...ownerIds);
            // Remove duplicates
            memberIds = [...new Set(memberIds)];
          }
        }
      } catch (error) {
        logger.error('Failed to fetch group members from Graph API:', error);
      }
    }

    let existingGroup = await db.findGroupByExternalId(principal.idOnTheSource, 'entra');

    if (!existingGroup && principal.email) {
      existingGroup = await db.findGroupByQuery({ email: principal.email.toLowerCase() });
    }

    if (existingGroup) {
      const updateData = {};
      let needsUpdate = false;

      if (!existingGroup.idOnTheSource && principal.idOnTheSource) {
        updateData.idOnTheSource = principal.idOnTheSource;
        updateData.source = 'entra';
        needsUpdate = true;
      }

      if (principal.description && existingGroup.description !== principal.description) {
        updateData.description = principal.description;
        needsUpdate = true;
      }

      if (principal.email && existingGroup.email !== principal.email.toLowerCase()) {
        updateData.email = principal.email.toLowerCase();
        needsUpdate = true;
      }

      if (authContext && authContext.accessToken && authContext.sub) {
        updateData.memberIds = memberIds;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await db.updateGroupById(existingGroup._id, updateData);
      }

      return existingGroup._id.toString();
    }

    const groupData = {
      name: principal.name,
      source: 'entra',
      idOnTheSource: principal.idOnTheSource,
      memberIds: memberIds, // Store idOnTheSource values of group members (empty if no auth context)
    };

    if (principal.email) {
      groupData.email = principal.email.toLowerCase();
    }

    if (principal.description) {
      groupData.description = principal.description;
    }

    const newGroup = await db.createGroup(groupData);
    return newGroup._id.toString();
  }
  if (principal.id && authContext == null) {
    return principal.id;
  }

  throw new Error(`Unsupported group principal source: ${principal.source}`);
};

/**
 * Sync user's Entra ID group memberships with auto-creation of missing groups
 * Optimized approach:
 * 1. Get all group IDs user should be member of from Entra
 * 2. Try to add user to existing groups (fast, no Graph API calls)
 * 3. Query DB to identify which groups don't exist (indexed query, fast)
 * 4. For missing groups only, fetch details from Graph API in batches
 * 5. Upsert missing groups using upsertGroupByExternalId (race-safe)
 * 6. Add user to newly created/upserted groups via bulkUpdate
 * 7. Remove user from groups they're no longer member of
 *
 * @param {Object} user - User object with authentication context
 * @param {string} user.openidId - User's OpenID subject identifier
 * @param {string} user.idOnTheSource - User's Entra ID (oid from token claims)
 * @param {string} user.provider - Authentication provider ('openid')
 * @param {string} accessToken - Access token for Graph API calls
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<void>}
 */
const syncUserEntraGroupMemberships = async (user, accessToken, session = null) => {
  try {
    if (!entraIdPrincipalFeatureEnabled(user) || !accessToken || !user.idOnTheSource) {
      return;
    }

    // Step 1: Get all group IDs user should be member of
    const memberGroupIds = await getUserEntraGroups(accessToken, user.openidId);
    let allGroupIds = [...(memberGroupIds || [])];

    // Include owned groups if feature is enabled
    if (isEnabled(process.env.ENTRA_ID_INCLUDE_OWNERS_AS_MEMBERS)) {
      const ownedGroupIds = await getUserOwnedEntraGroups(accessToken, user.openidId);
      if (ownedGroupIds && ownedGroupIds.length > 0) {
        allGroupIds.push(...ownedGroupIds);
        // Remove duplicates
        allGroupIds = [...new Set(allGroupIds)];
      }
    }

    const sessionOptions = session ? { session } : {};

    // Early return if no groups found (protects against temporary API failures)
    if (allGroupIds.length === 0) {
      logger.debug(
        `[PermissionService.syncUserEntraGroupMemberships] No groups found for user ${user._id}`,
      );
      return;
    }

    logger.info(
      `[PermissionService.syncUserEntraGroupMemberships] Syncing ${allGroupIds.length} groups for user ${user._id}`,
    );

    // Step 2: Try to add user to existing groups (fast operation)
    const addResult = await db.bulkUpdateGroups(
      {
        idOnTheSource: { $in: allGroupIds },
        source: 'entra',
        memberIds: { $ne: user.idOnTheSource },
      },
      { $addToSet: { memberIds: user.idOnTheSource } },
      sessionOptions,
    );

    logger.debug(
      `[PermissionService.syncUserEntraGroupMemberships] Added user to ${addResult.modifiedCount || 0} existing groups`,
    );

    // Step 3: Find which groups don't exist in DB using db layer
    const existingGroups = await db.findGroupsByExternalIds(allGroupIds, 'entra', session);
    const existingGroupIds = new Set(existingGroups.map((g) => g.idOnTheSource));

    const missingGroupIds = allGroupIds.filter((id) => !existingGroupIds.has(id));

    if (missingGroupIds.length > 0) {
      logger.info(
        `[PermissionService.syncUserEntraGroupMemberships] Found ${missingGroupIds.length} groups that don't exist, fetching details...`,
      );

      // Step 4: Fetch details only for missing groups (optimized batch request)
      const groupDetails = await getEntraGroupDetailsBatch(
        accessToken,
        user.openidId,
        missingGroupIds,
      );

      if (groupDetails.length > 0) {
        logger.info(
          `[PermissionService.syncUserEntraGroupMemberships] Creating ${groupDetails.length} new groups`,
        );

        // Step 5: Upsert missing groups (race-safe by design)
        // Use upsertGroupByExternalId for each group to handle concurrent creates gracefully
        const upsertPromises = groupDetails.map((group) =>
          db.upsertGroupByExternalId(
            group.id,
            'entra',
            {
              name: group.name,
              email: group.email,
              description: group.description,
            },
            session,
          ),
        );

        await Promise.all(upsertPromises);

        // Step 6: Add user to all newly created/upserted groups
        await db.bulkUpdateGroups(
          {
            idOnTheSource: { $in: missingGroupIds },
            source: 'entra',
            memberIds: { $ne: user.idOnTheSource },
          },
          { $addToSet: { memberIds: user.idOnTheSource } },
          sessionOptions,
        );

        logger.info(
          `[PermissionService.syncUserEntraGroupMemberships] Successfully created/updated ${groupDetails.length} groups`,
        );
      } else {
        logger.warn(
          `[PermissionService.syncUserEntraGroupMemberships] Could not fetch details for ${missingGroupIds.length} missing groups`,
        );
      }
    } else {
      logger.debug(
        `[PermissionService.syncUserEntraGroupMemberships] All ${allGroupIds.length} groups already exist in database`,
      );
    }

    // Step 7: Remove user from Entra groups they're no longer member of
    const removeResult = await db.bulkUpdateGroups(
      {
        source: 'entra',
        memberIds: user.idOnTheSource,
        idOnTheSource: { $nin: allGroupIds },
      },
      { $pullAll: { memberIds: [user.idOnTheSource] } },
      sessionOptions,
    );

    logger.debug(
      `[PermissionService.syncUserEntraGroupMemberships] Removed user from ${removeResult.modifiedCount || 0} groups`,
    );

    logger.info(
      `[PermissionService.syncUserEntraGroupMemberships] Successfully synced groups for user ${user._id}`,
    );
  } catch (error) {
    // Log error but don't re-throw: group sync is best-effort operation
    // and should not block authentication even if temporary API/DB issues occur
    logger.error(`[PermissionService.syncUserEntraGroupMemberships] Error syncing groups:`, error);
  }
};

/**
 * Check if public has a specific permission on a resource
 * @param {Object} params - Parameters for checking public permission
 * @param {string} params.resourceType - Type of resource (e.g., 'agent')
 * @param {string|mongoose.Types.ObjectId} params.resourceId - The ID of the resource
 * @param {number} params.requiredPermissions - The permission bits required (e.g., 1 for VIEW, 3 for VIEW+EDIT)
 * @returns {Promise<boolean>} Whether public has the required permission bits
 */
const hasPublicPermission = async ({ resourceType, resourceId, requiredPermissions }) => {
  try {
    if (typeof requiredPermissions !== 'number' || requiredPermissions < 1) {
      throw new Error('requiredPermissions must be a positive number');
    }

    validateResourceType(resourceType);

    // Use public principal to check permissions
    const publicPrincipal = [{ principalType: PrincipalType.PUBLIC }];

    const entries = await db.findEntriesByPrincipalsAndResource(
      publicPrincipal,
      resourceType,
      resourceId,
    );

    // Check if any entry has the required permission bits
    return entries.some((entry) => (entry.permBits & requiredPermissions) === requiredPermissions);
  } catch (error) {
    logger.error(`[PermissionService.hasPublicPermission] Error: ${error.message}`);
    // Re-throw validation errors
    if (error.message.includes('requiredPermissions must be')) {
      throw error;
    }
    return false;
  }
};

/**
 * Bulk update permissions for a resource (grant, update, revoke)
 * Efficiently handles multiple permission changes in a single transaction
 *
 * @param {Object} params - Parameters for bulk permission update
 * @param {string} params.resourceType - Type of resource (e.g., 'agent')
 * @param {string|mongoose.Types.ObjectId} params.resourceId - The ID of the resource
 * @param {Array<TPrincipal>} params.updatedPrincipals - Array of principals to grant/update permissions for
 * @param {Array<TPrincipal>} params.revokedPrincipals - Array of principals to revoke permissions from
 * @param {string|mongoose.Types.ObjectId} params.grantedBy - User ID making the changes
 * @param {mongoose.ClientSession} [params.session] - Optional MongoDB session for transactions
 * @returns {Promise<Object>} Results object with granted, updated, revoked arrays and error details
 */
const bulkUpdateResourcePermissions = async ({
  resourceType,
  resourceId,
  updatedPrincipals = [],
  revokedPrincipals = [],
  grantedBy,
  session,
}) => {
  const supportsTransactions = await getTransactionSupport(mongoose, transactionSupportCache);
  transactionSupportCache = supportsTransactions;
  let localSession = session;
  let shouldEndSession = false;

  try {
    if (!Array.isArray(updatedPrincipals)) {
      throw new Error('updatedPrincipals must be an array');
    }

    if (!Array.isArray(revokedPrincipals)) {
      throw new Error('revokedPrincipals must be an array');
    }

    if (!resourceId || !mongoose.Types.ObjectId.isValid(resourceId)) {
      throw new Error(`Invalid resource ID: ${resourceId}`);
    }

    if (!localSession && supportsTransactions) {
      localSession = await mongoose.startSession();
      localSession.startTransaction();
      shouldEndSession = true;
    }

    const sessionOptions = localSession ? { session: localSession } : {};

    const roles = await db.findRolesByResourceType(resourceType);
    const rolesMap = new Map();
    roles.forEach((role) => {
      rolesMap.set(role.accessRoleId, role);
    });

    const results = {
      granted: [],
      updated: [],
      revoked: [],
      errors: [],
    };

    const bulkWrites = [];

    for (const principal of updatedPrincipals) {
      try {
        if (!principal.accessRoleId) {
          results.errors.push({
            principal,
            error: 'accessRoleId is required for updated principals',
          });
          continue;
        }

        const role = rolesMap.get(principal.accessRoleId);
        if (!role) {
          results.errors.push({
            principal,
            error: `Role ${principal.accessRoleId} not found`,
          });
          continue;
        }

        const query = {
          principalType: principal.type,
          resourceType,
          resourceId,
        };

        if (principal.type !== PrincipalType.PUBLIC) {
          query.principalId =
            principal.type === PrincipalType.ROLE
              ? principal.id
              : new mongoose.Types.ObjectId(principal.id);
        }

        const principalModelMap = {
          [PrincipalType.USER]: PrincipalModel.USER,
          [PrincipalType.GROUP]: PrincipalModel.GROUP,
          [PrincipalType.ROLE]: PrincipalModel.ROLE,
        };

        const update = {
          $set: {
            permBits: role.permBits,
            roleId: role._id,
            grantedBy,
            grantedAt: new Date(),
          },
          $setOnInsert: {
            principalType: principal.type,
            resourceType,
            resourceId,
            ...(principal.type !== PrincipalType.PUBLIC && {
              principalId:
                principal.type === PrincipalType.ROLE
                  ? principal.id
                  : new mongoose.Types.ObjectId(principal.id),
              principalModel: principalModelMap[principal.type],
            }),
          },
        };

        bulkWrites.push({
          updateOne: {
            filter: query,
            update: update,
            upsert: true,
          },
        });

        results.granted.push({
          type: principal.type,
          id: principal.id,
          name: principal.name,
          email: principal.email,
          source: principal.source,
          avatar: principal.avatar,
          description: principal.description,
          idOnTheSource: principal.idOnTheSource,
          accessRoleId: principal.accessRoleId,
          memberCount: principal.memberCount,
          memberIds: principal.memberIds,
        });
      } catch (error) {
        results.errors.push({
          principal,
          error: error.message,
        });
      }
    }

    if (bulkWrites.length > 0) {
      await db.bulkWriteAclEntries(bulkWrites, sessionOptions);
    }

    const deleteQueries = [];
    for (const principal of revokedPrincipals) {
      try {
        const query = {
          principalType: principal.type,
          resourceType,
          resourceId,
        };

        if (principal.type !== PrincipalType.PUBLIC) {
          query.principalId =
            principal.type === PrincipalType.ROLE
              ? principal.id
              : new mongoose.Types.ObjectId(principal.id);
        }

        deleteQueries.push(query);

        results.revoked.push({
          type: principal.type,
          id: principal.id,
          name: principal.name,
          email: principal.email,
          source: principal.source,
          avatar: principal.avatar,
          description: principal.description,
          idOnTheSource: principal.idOnTheSource,
          memberCount: principal.memberCount,
        });
      } catch (error) {
        results.errors.push({
          principal,
          error: error.message,
        });
      }
    }

    if (deleteQueries.length > 0) {
      await db.deleteAclEntries({ $or: deleteQueries }, sessionOptions);
    }

    if (shouldEndSession && supportsTransactions) {
      await localSession.commitTransaction();
    }

    return results;
  } catch (error) {
    if (shouldEndSession && supportsTransactions) {
      try {
        await localSession.abortTransaction();
      } catch (transactionError) {
        /** best-effort abort; may fail if commit already succeeded */
        logger.error(
          `[PermissionService.bulkUpdateResourcePermissions] Error aborting transaction:`,
          transactionError,
        );
      }
    }
    logger.error(`[PermissionService.bulkUpdateResourcePermissions] Error: ${error.message}`);
    throw error;
  } finally {
    if (shouldEndSession && localSession) {
      localSession.endSession();
    }
  }
};

/**
 * Remove all permissions for a resource (cleanup when resource is deleted)
 * @param {Object} params - Parameters for removing all permissions
 * @param {string} params.resourceType - Type of resource (e.g., 'agent', 'prompt')
 * @param {string|mongoose.Types.ObjectId} params.resourceId - The ID of the resource
 * @returns {Promise<Object>} Result of the deletion operation
 */
const removeAllPermissions = async ({ resourceType, resourceId }) => {
  try {
    validateResourceType(resourceType);

    if (!resourceId || !mongoose.Types.ObjectId.isValid(resourceId)) {
      throw new Error(`Invalid resource ID: ${resourceId}`);
    }

    const result = await db.deleteAclEntries({
      resourceType,
      resourceId,
    });

    return result;
  } catch (error) {
    logger.error(`[PermissionService.removeAllPermissions] Error: ${error.message}`);
    throw error;
  }
};

module.exports = {
  grantPermission,
  checkPermission,
  getEffectivePermissions,
  getResourcePermissionsMap,
  findAccessibleResources,
  findPubliclyAccessibleResources,
  hasPublicPermission,
  getAvailableRoles,
  bulkUpdateResourcePermissions,
  ensurePrincipalExists,
  ensureGroupPrincipalExists,
  syncUserEntraGroupMemberships,
  removeAllPermissions,
};
