const express = require('express');
const { ResourceType, PermissionBits } = require('librechat-data-provider');
const {
  getUserEffectivePermissions,
  getAllEffectivePermissions,
  updateResourcePermissions,
  getResourcePermissions,
  getResourceRoles,
  searchPrincipals,
} = require('~/server/controllers/PermissionsController');
const { requireJwtAuth, checkBan, uaParser, canAccessResource } = require('~/server/middleware');
const { checkPeoplePickerAccess } = require('~/server/middleware/checkPeoplePickerAccess');
const { findMCPServerById } = require('~/models');

const router = express.Router();

// Apply common middleware
router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);

/**
 * Generic routes for resource permissions
 * Pattern: /api/permissions/{resourceType}/{resourceId}
 */

/**
 * GET /api/permissions/search-principals
 * Search for users and groups to grant permissions
 */
router.get('/search-principals', checkPeoplePickerAccess, searchPrincipals);

/**
 * GET /api/permissions/{resourceType}/roles
 * Get available roles for a resource type
 */
router.get('/:resourceType/roles', getResourceRoles);

/**
 * GET /api/permissions/{resourceType}/{resourceId}
 * Get all permissions for a specific resource
 */
router.get('/:resourceType/:resourceId', getResourcePermissions);

/**
 * PUT /api/permissions/{resourceType}/{resourceId}
 * Bulk update permissions for a specific resource
 */
router.put(
  '/:resourceType/:resourceId',
  // Use middleware that dynamically handles resource type and permissions
  (req, res, next) => {
    const { resourceType } = req.params;
    let middleware;

    if (resourceType === ResourceType.AGENT) {
      middleware = canAccessResource({
        resourceType: ResourceType.AGENT,
        requiredPermission: PermissionBits.SHARE,
        resourceIdParam: 'resourceId',
      });
    } else if (resourceType === ResourceType.PROMPTGROUP) {
      middleware = canAccessResource({
        resourceType: ResourceType.PROMPTGROUP,
        requiredPermission: PermissionBits.SHARE,
        resourceIdParam: 'resourceId',
      });
    } else if (resourceType === ResourceType.MCPSERVER) {
      middleware = canAccessResource({
        resourceType: ResourceType.MCPSERVER,
        requiredPermission: PermissionBits.SHARE,
        resourceIdParam: 'resourceId',
        idResolver: findMCPServerById,
      });
    } else {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Unsupported resource type: ${resourceType}`,
      });
    }

    // Execute the middleware
    middleware(req, res, next);
  },
  updateResourcePermissions,
);

/**
 * GET /api/permissions/{resourceType}/effective/all
 * Get user's effective permissions for all accessible resources of a type
 */
router.get('/:resourceType/effective/all', getAllEffectivePermissions);

/**
 * GET /api/permissions/{resourceType}/{resourceId}/effective
 * Get user's effective permissions for a specific resource
 */
router.get('/:resourceType/:resourceId/effective', getUserEffectivePermissions);

module.exports = router;
