/**
 * @import { TUpdateResourcePermissionsRequest, TUpdateResourcePermissionsResponse } from 'librechat-data-provider'
 */

const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { ResourceType, PrincipalType, PermissionBits } = require('librechat-data-provider');
const {
  bulkUpdateResourcePermissions,
  ensureGroupPrincipalExists,
  getEffectivePermissions,
  ensurePrincipalExists,
  getAvailableRoles,
  findAccessibleResources,
  getResourcePermissionsMap,
} = require('~/server/services/PermissionService');
const { AclEntry } = require('~/db/models');
const {
  searchPrincipals: searchLocalPrincipals,
  sortPrincipalsByRelevance,
  calculateRelevanceScore,
} = require('~/models');
const {
  entraIdPrincipalFeatureEnabled,
  searchEntraIdPrincipals,
} = require('~/server/services/GraphApiService');

/**
 * Generic controller for resource permission endpoints
 * Delegates validation and logic to PermissionService
 */

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
 * Bulk update permissions for a resource (grant, update, remove)
 * @route PUT /api/{resourceType}/{resourceId}/permissions
 * @param {Object} req - Express request object
 * @param {Object} req.params - Route parameters
 * @param {string} req.params.resourceType - Resource type (e.g., 'agent')
 * @param {string} req.params.resourceId - Resource ID
 * @param {TUpdateResourcePermissionsRequest} req.body - Request body
 * @param {Object} res - Express response object
 * @returns {Promise<TUpdateResourcePermissionsResponse>} Updated permissions response
 */
const updateResourcePermissions = async (req, res) => {
  try {
    const { resourceType, resourceId } = req.params;
    validateResourceType(resourceType);

    /** @type {TUpdateResourcePermissionsRequest} */
    const { updated, removed, public: isPublic, publicAccessRoleId } = req.body;
    const { id: userId } = req.user;

    // Prepare principals for the service call
    const updatedPrincipals = [];
    const revokedPrincipals = [];

    // Add updated principals
    if (updated && Array.isArray(updated)) {
      updatedPrincipals.push(...updated);
    }

    // Add public permission if enabled
    if (isPublic && publicAccessRoleId) {
      updatedPrincipals.push({
        type: PrincipalType.PUBLIC,
        id: null,
        accessRoleId: publicAccessRoleId,
      });
    }

    // Prepare authentication context for enhanced group member fetching
    const useEntraId = entraIdPrincipalFeatureEnabled(req.user);
    const authHeader = req.headers.authorization;
    const accessToken =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const authContext =
      useEntraId && accessToken
        ? {
            accessToken,
            sub: req.user.openidId,
          }
        : null;

    // Ensure updated principals exist in the database before processing permissions
    const validatedPrincipals = [];
    for (const principal of updatedPrincipals) {
      try {
        let principalId;

        if (principal.type === PrincipalType.PUBLIC) {
          principalId = null; // Public principals don't need database records
        } else if (principal.type === PrincipalType.ROLE) {
          principalId = principal.id; // Role principals use role name as ID
        } else if (principal.type === PrincipalType.USER) {
          principalId = await ensurePrincipalExists(principal);
        } else if (principal.type === PrincipalType.GROUP) {
          // Pass authContext to enable member fetching for Entra ID groups when available
          principalId = await ensureGroupPrincipalExists(principal, authContext);
        } else {
          logger.error(`Unsupported principal type: ${principal.type}`);
          continue; // Skip invalid principal types
        }

        // Update the principal with the validated ID for ACL operations
        validatedPrincipals.push({
          ...principal,
          id: principalId,
        });
      } catch (error) {
        logger.error('Error ensuring principal exists:', {
          principal: {
            type: principal.type,
            id: principal.id,
            name: principal.name,
            source: principal.source,
          },
          error: error.message,
        });
        // Continue with other principals instead of failing the entire operation
        continue;
      }
    }

    // Add removed principals
    if (removed && Array.isArray(removed)) {
      revokedPrincipals.push(...removed);
    }

    // If public is disabled, add public to revoked list
    if (!isPublic) {
      revokedPrincipals.push({
        type: PrincipalType.PUBLIC,
        id: null,
      });
    }

    const results = await bulkUpdateResourcePermissions({
      resourceType,
      resourceId,
      updatedPrincipals: validatedPrincipals,
      revokedPrincipals,
      grantedBy: userId,
    });

    /** @type {TUpdateResourcePermissionsResponse} */
    const response = {
      message: 'Permissions updated successfully',
      results: {
        principals: results.granted,
        public: isPublic || false,
        publicAccessRoleId: isPublic ? publicAccessRoleId : undefined,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error updating resource permissions:', error);
    res.status(400).json({
      error: 'Failed to update permissions',
      details: error.message,
    });
  }
};

/**
 * Get principals with their permission roles for a resource (UI-friendly format)
 * Uses efficient aggregation pipeline to join User/Group data in single query
 * @route GET /api/permissions/{resourceType}/{resourceId}
 */
const getResourcePermissions = async (req, res) => {
  try {
    const { resourceType, resourceId } = req.params;
    validateResourceType(resourceType);

    // Use aggregation pipeline for efficient single-query data retrieval
    const results = await AclEntry.aggregate([
      // Match ACL entries for this resource
      {
        $match: {
          resourceType,
          resourceId: mongoose.Types.ObjectId.isValid(resourceId)
            ? mongoose.Types.ObjectId.createFromHexString(resourceId)
            : resourceId,
        },
      },
      // Lookup AccessRole information
      {
        $lookup: {
          from: 'accessroles',
          localField: 'roleId',
          foreignField: '_id',
          as: 'role',
        },
      },
      // Lookup User information (for user principals)
      {
        $lookup: {
          from: 'users',
          localField: 'principalId',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      // Lookup Group information (for group principals)
      {
        $lookup: {
          from: 'groups',
          localField: 'principalId',
          foreignField: '_id',
          as: 'groupInfo',
        },
      },
      // Project final structure
      {
        $project: {
          principalType: 1,
          principalId: 1,
          accessRoleId: { $arrayElemAt: ['$role.accessRoleId', 0] },
          userInfo: { $arrayElemAt: ['$userInfo', 0] },
          groupInfo: { $arrayElemAt: ['$groupInfo', 0] },
        },
      },
    ]);

    const principals = [];
    let publicPermission = null;

    // Process aggregation results
    for (const result of results) {
      if (result.principalType === PrincipalType.PUBLIC) {
        publicPermission = {
          public: true,
          publicAccessRoleId: result.accessRoleId,
        };
      } else if (result.principalType === PrincipalType.USER && result.userInfo) {
        principals.push({
          type: PrincipalType.USER,
          id: result.userInfo._id.toString(),
          name: result.userInfo.name || result.userInfo.username,
          email: result.userInfo.email,
          avatar: result.userInfo.avatar,
          source: !result.userInfo._id ? 'entra' : 'local',
          idOnTheSource: result.userInfo.idOnTheSource || result.userInfo._id.toString(),
          accessRoleId: result.accessRoleId,
        });
      } else if (result.principalType === PrincipalType.GROUP && result.groupInfo) {
        principals.push({
          type: PrincipalType.GROUP,
          id: result.groupInfo._id.toString(),
          name: result.groupInfo.name,
          email: result.groupInfo.email,
          description: result.groupInfo.description,
          avatar: result.groupInfo.avatar,
          source: result.groupInfo.source || 'local',
          idOnTheSource: result.groupInfo.idOnTheSource || result.groupInfo._id.toString(),
          accessRoleId: result.accessRoleId,
        });
      } else if (result.principalType === PrincipalType.ROLE) {
        principals.push({
          type: PrincipalType.ROLE,
          /** Role name as ID */
          id: result.principalId,
          /** Display the role name */
          name: result.principalId,
          description: `System role: ${result.principalId}`,
          accessRoleId: result.accessRoleId,
        });
      }
    }

    // Return response in format expected by frontend
    const response = {
      resourceType,
      resourceId,
      principals,
      public: publicPermission?.public || false,
      ...(publicPermission?.publicAccessRoleId && {
        publicAccessRoleId: publicPermission.publicAccessRoleId,
      }),
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error getting resource permissions principals:', error);
    res.status(500).json({
      error: 'Failed to get permissions principals',
      details: error.message,
    });
  }
};

/**
 * Get available roles for a resource type
 * @route GET /api/{resourceType}/roles
 */
const getResourceRoles = async (req, res) => {
  try {
    const { resourceType } = req.params;
    validateResourceType(resourceType);

    const roles = await getAvailableRoles({ resourceType });

    res.status(200).json(
      roles.map((role) => ({
        accessRoleId: role.accessRoleId,
        name: role.name,
        description: role.description,
        permBits: role.permBits,
      })),
    );
  } catch (error) {
    logger.error('Error getting resource roles:', error);
    res.status(500).json({
      error: 'Failed to get roles',
      details: error.message,
    });
  }
};

/**
 * Get user's effective permission bitmask for a resource
 * @route GET /api/{resourceType}/{resourceId}/effective
 */
const getUserEffectivePermissions = async (req, res) => {
  try {
    const { resourceType, resourceId } = req.params;
    validateResourceType(resourceType);

    const { id: userId } = req.user;

    const permissionBits = await getEffectivePermissions({
      userId,
      role: req.user.role,
      resourceType,
      resourceId,
    });

    res.status(200).json({
      permissionBits,
    });
  } catch (error) {
    logger.error('Error getting user effective permissions:', error);
    res.status(500).json({
      error: 'Failed to get effective permissions',
      details: error.message,
    });
  }
};

/**
 * Search for users and groups to grant permissions
 * Supports hybrid local database + Entra ID search when configured
 * @route GET /api/permissions/search-principals
 */
const searchPrincipals = async (req, res) => {
  try {
    const { q: query, limit = 20, types } = req.query;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Query parameter "q" is required and must not be empty',
      });
    }

    if (query.trim().length < 2) {
      return res.status(400).json({
        error: 'Query must be at least 2 characters long',
      });
    }

    const searchLimit = Math.min(Math.max(1, parseInt(limit) || 10), 50);

    let typeFilters = null;
    if (types) {
      const typesArray = Array.isArray(types) ? types : types.split(',');
      const validTypes = typesArray.filter((t) =>
        [PrincipalType.USER, PrincipalType.GROUP, PrincipalType.ROLE].includes(t),
      );
      typeFilters = validTypes.length > 0 ? validTypes : null;
    }

    const localResults = await searchLocalPrincipals(query.trim(), searchLimit, typeFilters);
    let allPrincipals = [...localResults];

    const useEntraId = entraIdPrincipalFeatureEnabled(req.user);

    if (useEntraId && localResults.length < searchLimit) {
      try {
        let graphType = 'all';
        if (typeFilters && typeFilters.length === 1) {
          const graphTypeMap = {
            [PrincipalType.USER]: 'users',
            [PrincipalType.GROUP]: 'groups',
          };
          const mappedType = graphTypeMap[typeFilters[0]];
          if (mappedType) {
            graphType = mappedType;
          }
        }

        const authHeader = req.headers.authorization;
        const accessToken =
          authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

        if (accessToken) {
          const graphResults = await searchEntraIdPrincipals(
            accessToken,
            req.user.openidId,
            query.trim(),
            graphType,
            searchLimit - localResults.length,
          );

          const localEmails = new Set(
            localResults.map((p) => p.email?.toLowerCase()).filter(Boolean),
          );
          const localGroupSourceIds = new Set(
            localResults.map((p) => p.idOnTheSource).filter(Boolean),
          );

          for (const principal of graphResults) {
            const isDuplicateByEmail =
              principal.email && localEmails.has(principal.email.toLowerCase());
            const isDuplicateBySourceId =
              principal.idOnTheSource && localGroupSourceIds.has(principal.idOnTheSource);

            if (!isDuplicateByEmail && !isDuplicateBySourceId) {
              allPrincipals.push(principal);
            }
          }
        }
      } catch (graphError) {
        logger.warn('Graph API search failed, falling back to local results:', graphError.message);
      }
    }
    const scoredResults = allPrincipals.map((item) => ({
      ...item,
      _searchScore: calculateRelevanceScore(item, query.trim()),
    }));

    const finalResults = sortPrincipalsByRelevance(scoredResults)
      .slice(0, searchLimit)
      .map((result) => {
        const { _searchScore, ...resultWithoutScore } = result;
        return resultWithoutScore;
      });

    res.status(200).json({
      query: query.trim(),
      limit: searchLimit,
      types: typeFilters,
      results: finalResults,
      count: finalResults.length,
      sources: {
        local: finalResults.filter((r) => r.source === 'local').length,
        entra: finalResults.filter((r) => r.source === 'entra').length,
      },
    });
  } catch (error) {
    logger.error('Error searching principals:', error);
    res.status(500).json({
      error: 'Failed to search principals',
      details: error.message,
    });
  }
};

/**
 * Get user's effective permissions for all accessible resources of a type
 * @route GET /api/permissions/{resourceType}/effective/all
 */
const getAllEffectivePermissions = async (req, res) => {
  try {
    const { resourceType } = req.params;
    validateResourceType(resourceType);

    const { id: userId } = req.user;

    // Find all resources the user has at least VIEW access to
    const accessibleResourceIds = await findAccessibleResources({
      userId,
      role: req.user.role,
      resourceType,
      requiredPermissions: PermissionBits.VIEW,
    });

    if (accessibleResourceIds.length === 0) {
      return res.status(200).json({});
    }

    // Get effective permissions for all accessible resources
    const permissionsMap = await getResourcePermissionsMap({
      userId,
      role: req.user.role,
      resourceType,
      resourceIds: accessibleResourceIds,
    });

    // Convert Map to plain object for JSON response
    const result = {};
    for (const [resourceId, permBits] of permissionsMap) {
      result[resourceId] = permBits;
    }

    res.status(200).json(result);
  } catch (error) {
    logger.error('Error getting all effective permissions:', error);
    res.status(500).json({
      error: 'Failed to get all effective permissions',
      details: error.message,
    });
  }
};

module.exports = {
  updateResourcePermissions,
  getResourcePermissions,
  getResourceRoles,
  getUserEffectivePermissions,
  getAllEffectivePermissions,
  searchPrincipals,
};
