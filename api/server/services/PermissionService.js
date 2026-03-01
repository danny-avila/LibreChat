const mongoose = require('mongoose');
const { isEnabled } = require('@librechat/api');
const { getTransactionSupport, logger } = require('@librechat/data-schemas');
const { ResourceType, PrincipalType, PrincipalModel } = require('librechat-data-provider');
const {
  entraIdPrincipalFeatureEnabled,
  getUserOwnedEntraGroups,
  getUserEntraGroups,
  getGroupMembers,
  getGroupOwners,
} = require('~/server/services/GraphApiService');
const { extractGroupsFromToken } = require('~/utils/extractJwtClaims');
const {
  findAccessibleResources: findAccessibleResourcesACL,
  getEffectivePermissions: getEffectivePermissionsACL,
  getEffectivePermissionsForResources: getEffectivePermissionsForResourcesACL,
  grantPermission: grantPermissionACL,
  findEntriesByPrincipalsAndResource,
  findRolesByResourceType,
  findPublicResourceIds,
  bulkWriteAclEntries,
  findGroupByExternalId,
  findRoleByIdentifier,
  deleteAclEntries,
  getUserPrincipals,
  findGroupByQuery,
  updateGroupById,
  bulkUpdateGroups,
  hasPermission,
  createGroup,
  createUser,
  updateUser,
  findUser,
} = require('~/models');

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
    const role = await findRoleByIdentifier(accessRoleId);
    if (!role) {
      throw new Error(`Role ${accessRoleId} not found`);
    }

    // Ensure the role is for the correct resource type
    if (role.resourceType !== resourceType) {
      throw new Error(
        `Role ${accessRoleId} is for ${role.resourceType} resources, not ${resourceType}`,
      );
    }
    return await grantPermissionACL(
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

    const principals = await getUserPrincipals({ userId, role });

    if (principals.length === 0) {
      return false;
    }

    return await hasPermission(principals, resourceType, resourceId, requiredPermission);
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

    const principals = await getUserPrincipals({ userId, role });

    if (principals.length === 0) {
      return 0;
    }

    return await getEffectivePermissionsACL(principals, resourceType, resourceId);
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
    const principals = await getUserPrincipals({ userId, role });

    // Use batch method from aclEntry
    const permissionsMap = await getEffectivePermissionsForResourcesACL(
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
    const principalsList = await getUserPrincipals({ userId, role });

    if (principalsList.length === 0) {
      return [];
    }
    return await findAccessibleResourcesACL(principalsList, resourceType, requiredPermissions);
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

    return await findPublicResourceIds(resourceType, requiredPermissions);
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

  return await findRolesByResourceType(resourceType);
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

    let existingUser = await findUser({ idOnTheSource: principal.idOnTheSource });

    if (!existingUser) {
      existingUser = await findUser({ email: principal.email });
    }

    if (existingUser) {
      if (!existingUser.idOnTheSource && principal.idOnTheSource) {
        await updateUser(existingUser._id, {
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

    const userId = await createUser(userData, true, true);
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

    let existingGroup = await findGroupByExternalId(principal.idOnTheSource, 'entra');

    if (!existingGroup && principal.email) {
      existingGroup = await findGroupByQuery({ email: principal.email.toLowerCase() });
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
        await updateGroupById(existingGroup._id, updateData);
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

    const newGroup = await createGroup(groupData);
    return newGroup._id.toString();
  }
  if (principal.id && authContext == null) {
    return principal.id;
  }

  throw new Error(`Unsupported group principal source: ${principal.source}`);
};

/**
 * Synchronize user's Entra ID group memberships on sign-in
 * Gets user's group IDs from GraphAPI and updates memberships only for existing groups in database
 * Optionally includes groups the user owns if ENTRA_ID_INCLUDE_OWNERS_AS_MEMBERS is enabled
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

    if (!allGroupIds || allGroupIds.length === 0) {
      return;
    }

    const sessionOptions = session ? { session } : {};

    await bulkUpdateGroups(
      {
        idOnTheSource: { $in: allGroupIds },
        source: 'entra',
        memberIds: { $ne: user.idOnTheSource },
      },
      { $addToSet: { memberIds: user.idOnTheSource } },
      sessionOptions,
    );

    await bulkUpdateGroups(
      {
        source: 'entra',
        memberIds: user.idOnTheSource,
        idOnTheSource: { $nin: allGroupIds },
      },
      { $pullAll: { memberIds: [user.idOnTheSource] } },
      sessionOptions,
    );
  } catch (error) {
    logger.error(`[PermissionService.syncUserEntraGroupMemberships] Error syncing groups:`, error);
  }
};

/**
 * Sync user's OIDC groups from JWT token claims to LibreChat's Group database
 * Extracts groups/roles from JWT token and syncs group memberships automatically on login
 *
 * Supports any OpenID Connect provider (Keycloak, Auth0, Okta, etc.) by reading groups/roles
 * from configurable JWT claim paths.
 *
 * TODO: Future improvements:
 * - Add transaction wrapping for full atomicity (currently relies on passed session)
 * - Implement bulk query optimization for large group counts (>20 groups)
 * - Add configurable group name transformation/mapping
 * - Add orphaned group cleanup (groups with no members)
 * - Add manual sync trigger via admin API
 * - Add support for URL-based claim paths (e.g., Auth0 custom namespaces)
 *
 * @param {Object} user - User object from authentication
 * @param {string} user.idOnTheSource - User's external ID (oid or sub from token claims)
 * @param {string} user.provider - Authentication provider ('openid')
 * @param {Object} tokenset - OpenID Connect tokenset containing access_token and id_token
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<void>}
 */
const syncUserOidcGroupsFromToken = async (user, tokenset, session = null) => {
  try {
    // Check if feature is enabled
    if (!isEnabled(process.env.OPENID_SYNC_GROUPS_FROM_TOKEN)) {
      return;
    }

    // Validate user authentication
    if (!user || user.provider !== 'openid' || !user.idOnTheSource) {
      logger.debug(
        '[PermissionService.syncUserOidcGroupsFromToken] User not eligible for OIDC group sync',
      );
      return;
    }

    // Security: Validate idOnTheSource type to prevent MongoDB injection
    if (
      typeof user.idOnTheSource !== 'string' ||
      user.idOnTheSource.trim().length === 0 ||
      /[${}.]/.test(user.idOnTheSource)
    ) {
      logger.warn(
        '[PermissionService.syncUserOidcGroupsFromToken] Invalid idOnTheSource: contains special characters or is empty',
      );
      return;
    }

    // Validate tokenset
    if (!tokenset || typeof tokenset !== 'object') {
      logger.warn('[PermissionService.syncUserOidcGroupsFromToken] Invalid tokenset provided');
      return;
    }

    // Get configuration
    const claimPath = process.env.OPENID_GROUPS_CLAIM_PATH || 'realm_access.roles';
    const tokenKind = process.env.OPENID_GROUPS_TOKEN_KIND || 'access';
    const groupSource = process.env.OPENID_GROUP_SOURCE || 'oidc';
    const exclusionPattern = process.env.OPENID_GROUPS_EXCLUDE_PATTERN || null;

    // Extract groups from token
    let groupNames = extractGroupsFromToken(tokenset, claimPath, tokenKind, exclusionPattern);

    // Security: Limit maximum number of groups to prevent DoS attacks
    const MAX_GROUPS_PER_USER = parseInt(process.env.OPENID_MAX_GROUPS_PER_USER, 10) || 100;
    if (groupNames.length > MAX_GROUPS_PER_USER) {
      logger.warn(
        `[PermissionService.syncUserOidcGroupsFromToken] User ${user.email} has ${groupNames.length} groups, limiting to ${MAX_GROUPS_PER_USER}`,
        {
          userId: user._id,
          originalCount: groupNames.length,
          limitedCount: MAX_GROUPS_PER_USER,
        },
      );
      groupNames = groupNames.slice(0, MAX_GROUPS_PER_USER);
    }

    if (!groupNames || groupNames.length === 0) {
      logger.info(
        `[PermissionService.syncUserOidcGroupsFromToken] No groups found for user ${user.email}`,
        {
          claimPath,
          tokenKind,
        },
      );

      // Remove user from all OIDC groups if they no longer have any groups
      const sessionOptions = session ? { session } : {};
      await Group.updateMany(
        {
          source: groupSource,
          memberIds: user.idOnTheSource,
        },
        { $pull: { memberIds: user.idOnTheSource } },
        sessionOptions,
      );

      return;
    }

    logger.info(
      `[PermissionService.syncUserOidcGroupsFromToken] Syncing ${groupNames.length} groups for user ${user.email}`,
      {
        groups: groupNames,
        claimPath,
        tokenKind,
        source: groupSource,
      },
    );

    const sessionOptions = session ? { session } : {};

    // Bulk optimization: Fetch all existing groups in one query
    const existingGroups = await Group.find(
      {
        idOnTheSource: { $in: groupNames },
        source: groupSource,
      },
      null,
      sessionOptions,
    );

    const existingMap = new Map(existingGroups.map((g) => [g.idOnTheSource, g]));
    const groupsToCreate = [];
    const groupsToUpdate = [];

    for (const groupName of groupNames) {
      const existing = existingMap.get(groupName);
      if (!existing) {
        groupsToCreate.push({
          name: groupName,
          idOnTheSource: groupName,
          source: groupSource,
          memberIds: [user.idOnTheSource],
        });
      } else if (
        !existing.memberIds.some((memberId) => String(memberId) === String(user.idOnTheSource))
      ) {
        groupsToUpdate.push(existing._id);
      }
    }

    // Bulk create new groups
    if (groupsToCreate.length > 0) {
      try {
        await Group.insertMany(groupsToCreate, sessionOptions);
        for (const group of groupsToCreate) {
          logger.info(
            `[PermissionService.syncUserOidcGroupsFromToken] Created new group: ${group.idOnTheSource}`,
          );
        }
      } catch (error) {
        logger.error(
          `[PermissionService.syncUserOidcGroupsFromToken] Error creating groups:`,
          error,
        );
      }
    }

    // Bulk update existing groups to add user
    if (groupsToUpdate.length > 0) {
      try {
        await Group.updateMany(
          { _id: { $in: groupsToUpdate } },
          { $addToSet: { memberIds: user.idOnTheSource } },
          sessionOptions,
        );
        for (const groupId of groupsToUpdate) {
          const group = existingGroups.find((g) => g._id.equals(groupId));
          logger.debug(
            `[PermissionService.syncUserOidcGroupsFromToken] Added user to group: ${group ? group.idOnTheSource : groupId}`,
          );
        }
      } catch (error) {
        logger.error(
          `[PermissionService.syncUserOidcGroupsFromToken] Error updating groups:`,
          error,
        );
      }
    }

    // Remove user from groups they are no longer part of
    try {
      await Group.updateMany(
        {
          source: groupSource,
          memberIds: user.idOnTheSource,
          idOnTheSource: { $nin: groupNames },
        },
        { $pull: { memberIds: user.idOnTheSource } },
        sessionOptions,
      );
    } catch (error) {
      logger.error(
        `[PermissionService.syncUserOidcGroupsFromToken] Error removing user from old groups:`,
        error,
      );
    }

    logger.info(
      `[PermissionService.syncUserOidcGroupsFromToken] Successfully synced groups for user ${user.email}`,
    );
  } catch (error) {
    logger.error(`[PermissionService.syncUserOidcGroupsFromToken] Error syncing groups:`, error);
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

    const entries = await findEntriesByPrincipalsAndResource(
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

    const roles = await findRolesByResourceType(resourceType);
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
      await bulkWriteAclEntries(bulkWrites, sessionOptions);
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
      await deleteAclEntries({ $or: deleteQueries }, sessionOptions);
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

    const result = await deleteAclEntries({
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
  syncUserOidcGroupsFromToken,
  removeAllPermissions,
};
