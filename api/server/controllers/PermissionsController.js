/**
 * @import { TUpdateResourcePermissionsRequest, TUpdateResourcePermissionsResponse } from 'librechat-data-provider'
 */

const mongoose = require('mongoose');
const { logger, getTenantId, SYSTEM_TENANT_ID } = require('@librechat/data-schemas');
const {
  ResourceType,
  PrincipalType,
  PermissionBits,
  SystemRoles,
} = require('librechat-data-provider');
const {
  enrichRemoteAgentPrincipals,
  backfillRemoteAgentPermissions,
  buildAuditContext,
} = require('@librechat/api');
const {
  bulkUpdateResourcePermissions,
  restoreInsightsPermissionChanges,
  ensureGroupPrincipalExists,
  getResourcePermissionsMap,
  findAccessibleResources,
  getEffectivePermissions,
  ensurePrincipalExists,
  getAvailableRoles,
} = require('~/server/services/PermissionService');
const {
  entraIdPrincipalFeatureEnabled,
  searchEntraIdPrincipals,
} = require('~/server/services/GraphApiService');
const db = require('~/models');
const { invalidateCodeEnvironmentConfigCache } = require('~/server/services/Config');

const matchesCurrentTenant = (principal, tenantId) => {
  if (!tenantId || tenantId === SYSTEM_TENANT_ID) {
    return true;
  }
  return principal?.tenantId === tenantId;
};

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const maskInsightsBit = (req, resourceType, permBits) =>
  resourceType === ResourceType.AGENT && req.user?.role !== SystemRoles.ADMIN
    ? permBits & ~PermissionBits.VIEW_INSIGHTS
    : permBits;

async function auditInsightsChanges(req, resourceId, changes) {
  if (changes.length === 0) {
    return;
  }
  const failClosed = process.env.AUDIT_LOG_FAIL_CLOSED === 'true';
  let agent;
  try {
    agent = await db.getAgent(
      {
        _id: resourceId,
        ...(req.user.tenantId ? { tenantId: req.user.tenantId } : { tenantId: { $exists: false } }),
      },
      '_id id name',
    );
    if (!agent) {
      throw new Error('Agent not found for Insights permission audit');
    }
  } catch (error) {
    if (!failClosed) {
      logger.error('[PermissionsController] Insights permission audit target lookup failed', error);
      return;
    }
    await restoreInsightsPermissionChanges({
      resourceType: ResourceType.AGENT,
      resourceId,
      changes,
    }).catch((restoreError) =>
      logger.error('[PermissionsController] Insights permission rollback failed', restoreError),
    );
    if (error && typeof error === 'object') {
      error.statusCode = 500;
    }
    throw error;
  }

  const actorId = req.user._id?.toString() ?? req.user.id;
  const actorName = req.user.name || req.user.username || req.user.email || actorId;
  for (let index = 0; index < changes.length; index++) {
    const change = changes[index];
    const input = {
      action:
        change.action === 'assigned'
          ? 'permission.insights_assigned'
          : 'permission.insights_removed',
      outcome: 'success',
      severity: 'warning',
      actor: { type: 'user', id: actorId, name: actorName },
      target: { type: ResourceType.AGENT, id: agent.id, name: agent.name || agent.id },
      metadata: {
        principalType: change.principal.type,
        principalId: change.principal.id?.toString() ?? '',
      },
      context: buildAuditContext(req),
      tenantId: req.user.tenantId,
    };
    try {
      await db.recordAuditEntry(input, { failClosed });
    } catch (error) {
      if (failClosed) {
        await restoreInsightsPermissionChanges({
          resourceType: ResourceType.AGENT,
          resourceId,
          changes: changes.slice(index),
        }).catch((restoreError) =>
          logger.error('[PermissionsController] Insights permission rollback failed', restoreError),
        );
        if (error && typeof error === 'object') {
          error.statusCode = 500;
        }
        throw error;
      }
      logger.error('[PermissionsController] Insights permission audit failed', error);
    }
  }
}

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
    const updatedList = Array.isArray(updated) ? updated : [];
    const removedList = Array.isArray(removed) ? removed : [];
    const includesInsightsMutation = updatedList.some(
      (principal) => principal && hasOwn(principal, 'viewInsights'),
    );
    const hasInvalidInsightsValue = updatedList.some(
      (principal) =>
        principal &&
        hasOwn(principal, 'viewInsights') &&
        typeof principal.viewInsights !== 'boolean',
    );
    if (resourceType === ResourceType.AGENT && hasInvalidInsightsValue) {
      return res.status(400).json({ error: 'viewInsights must be a boolean when provided' });
    }
    if (
      resourceType === ResourceType.AGENT &&
      includesInsightsMutation &&
      req.user.role !== SystemRoles.ADMIN
    ) {
      return res.status(403).json({ error: 'Only administrators can change Insights access' });
    }
    if (
      resourceType === ResourceType.AGENT &&
      updatedList.some(
        (principal) =>
          principal?.type === PrincipalType.PUBLIC && hasOwn(principal, 'viewInsights'),
      )
    ) {
      return res.status(400).json({ error: 'Public principals cannot receive Insights access' });
    }

    // Prepare principals for the service call
    const updatedPrincipals = [];
    const revokedPrincipals = [];

    // Add updated principals
    if (updatedList.length > 0) {
      updatedPrincipals.push(...updatedList);
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
    if (removedList.length > 0) {
      revokedPrincipals.push(...removedList);
    }

    // If public is explicitly disabled, add public to revoked list
    if (isPublic === false) {
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

    await auditInsightsChanges(req, resourceId, results.insightsChanges ?? []);

    if (resourceType === ResourceType.CODE_ENVIRONMENT) {
      await invalidateCodeEnvironmentConfigCache(req.user.tenantId).catch((error) => {
        // Cached environment metadata is authorization-filtered against the live ACL on every
        // read, so a failed revision write may delay a grant but cannot preserve a revocation.
        logger.error('[PermissionsController] code environment cache invalidation failed:', error);
      });
    }

    const isAgentResource =
      resourceType === ResourceType.AGENT || resourceType === ResourceType.REMOTE_AGENT;
    const revokedUserIds = results.revoked
      .filter((p) => p.type === PrincipalType.USER && p.id)
      .map((p) => p.id);

    if (isAgentResource && revokedUserIds.length > 0) {
      db.removeAgentFromUserFavorites(resourceId, revokedUserIds).catch((err) => {
        logger.error('[removeRevokedAgentFromFavorites] Error cleaning up favorites', err);
      });
    }

    /** @type {TUpdateResourcePermissionsResponse} */
    const responsePrincipals =
      resourceType === ResourceType.AGENT && req.user.role !== SystemRoles.ADMIN
        ? results.granted.map(({ viewInsights: _protected, ...principal }) => principal)
        : results.granted;
    const response = {
      message: 'Permissions updated successfully',
      results: {
        principals: responsePrincipals,
        ...(isPublic !== undefined ? { public: isPublic } : {}),
        publicAccessRoleId: isPublic ? publicAccessRoleId : undefined,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error updating resource permissions:', error);
    res.status(error.statusCode ?? 400).json({
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
    const tenantId = getTenantId();

    const results = await db.aggregateAclEntries([
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
          permBits: 1,
        },
      },
    ]);

    let principals = [];
    let publicPermission = null;

    for (const result of results) {
      if (result.principalType === PrincipalType.PUBLIC) {
        publicPermission = {
          public: true,
          publicAccessRoleId: result.accessRoleId,
        };
      } else if (
        result.principalType === PrincipalType.USER &&
        result.userInfo &&
        matchesCurrentTenant(result.userInfo, tenantId)
      ) {
        principals.push({
          type: PrincipalType.USER,
          id: result.userInfo._id.toString(),
          name: result.userInfo.name || result.userInfo.username,
          email: result.userInfo.email,
          avatar: result.userInfo.avatar,
          source: !result.userInfo._id ? 'entra' : 'local',
          idOnTheSource: result.userInfo.idOnTheSource || result.userInfo._id.toString(),
          accessRoleId: result.accessRoleId,
          ...(req.user.role === SystemRoles.ADMIN
            ? {
                viewInsights:
                  (result.permBits & PermissionBits.VIEW_INSIGHTS) === PermissionBits.VIEW_INSIGHTS,
              }
            : {}),
        });
      } else if (
        result.principalType === PrincipalType.GROUP &&
        result.groupInfo &&
        matchesCurrentTenant(result.groupInfo, tenantId)
      ) {
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
          ...(req.user.role === SystemRoles.ADMIN
            ? {
                viewInsights:
                  (result.permBits & PermissionBits.VIEW_INSIGHTS) === PermissionBits.VIEW_INSIGHTS,
              }
            : {}),
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
          ...(req.user.role === SystemRoles.ADMIN
            ? {
                viewInsights:
                  (result.permBits & PermissionBits.VIEW_INSIGHTS) === PermissionBits.VIEW_INSIGHTS,
              }
            : {}),
        });
      }
    }

    if (resourceType === ResourceType.REMOTE_AGENT) {
      const enricherDeps = {
        aggregateAclEntries: db.aggregateAclEntries,
        bulkWriteAclEntries: db.bulkWriteAclEntries,
        findRoleByIdentifier: db.findRoleByIdentifier,
        logger,
      };
      const enrichResult = await enrichRemoteAgentPrincipals(enricherDeps, resourceId, principals);
      principals = enrichResult.principals;
      backfillRemoteAgentPermissions(enricherDeps, resourceId, enrichResult.entriesToBackfill);
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
      permissionBits: maskInsightsBit(req, resourceType, permissionBits),
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
    const { q: rawQuery, limit = 20, types } = req.query;

    if (typeof rawQuery !== 'string' || rawQuery.trim().length === 0) {
      return res.status(400).json({
        error: 'Query parameter "q" is required and must not be empty',
      });
    }

    const query = rawQuery.trim();

    if (query.length < 2) {
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

    const localResults = await db.searchPrincipals(query, searchLimit, typeFilters);
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
            query,
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
      _searchScore: db.calculateRelevanceScore(item, query),
    }));

    const finalResults = db
      .sortPrincipalsByRelevance(scoredResults)
      .slice(0, searchLimit)
      .map((result) => {
        const { _searchScore, ...resultWithoutScore } = result;
        return resultWithoutScore;
      });

    res.status(200).json({
      query,
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
      result[resourceId] = maskInsightsBit(req, resourceType, permBits);
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
