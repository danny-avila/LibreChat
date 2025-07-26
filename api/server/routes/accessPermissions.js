const express = require('express');
const { PermissionBits } = require('@librechat/data-schemas');
const {
  getUserEffectivePermissions,
  updateResourcePermissions,
  getResourcePermissions,
  getResourceRoles,
  searchPrincipals,
} = require('~/server/controllers/PermissionsController');
const { requireJwtAuth, checkBan, uaParser, canAccessResource } = require('~/server/middleware');
const { checkPeoplePickerAccess } = require('~/server/middleware/checkPeoplePickerAccess');

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

    // Define resource-specific middleware based on resourceType
    let middleware;

    if (resourceType === 'agent') {
      middleware = canAccessResource({
        resourceType: 'agent',
        requiredPermission: PermissionBits.SHARE,
        resourceIdParam: 'resourceId',
      });
    } else if (resourceType === 'promptGroup') {
      middleware = canAccessResource({
        resourceType: 'promptGroup',
        requiredPermission: PermissionBits.SHARE,
        resourceIdParam: 'resourceId',
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
 * GET /api/permissions/{resourceType}/{resourceId}/effective
 * Get user's effective permissions for a specific resource
 */
router.get('/:resourceType/:resourceId/effective', getUserEffectivePermissions);

module.exports = router;
