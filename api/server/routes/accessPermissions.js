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
router.get('/search-principals', searchPrincipals);

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
  canAccessResource({
    resourceType: 'agent',
    requiredPermission: PermissionBits.SHARE,
    resourceIdParam: 'resourceId',
  }),
  updateResourcePermissions,
);

/**
 * GET /api/permissions/{resourceType}/{resourceId}/effective
 * Get user's effective permissions for a specific resource
 */
router.get('/:resourceType/:resourceId/effective', getUserEffectivePermissions);

module.exports = router;
