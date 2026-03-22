const { Router } = require('express');
const {
  Permissions,
  PermissionTypes,
  PermissionBits,
} = require('librechat-data-provider');
const { generateCheckAccess } = require('@librechat/api');
const { requireJwtAuth, canAccessMCPServerResource } = require('~/server/middleware');
const { getRoleByName } = require('~/models/Role');
const {
  parseOpenAPISpec,
  createAPIRegistry,
  getAPIRegistries,
  getAPIRegistry,
  updateAPIRegistry,
  deleteAPIRegistry,
  getAPITools,
} = require('~/server/controllers/APIRegistry');

const router = Router();

// Permission checkers
const checkAPIRegistryUse = generateCheckAccess({
  permissionType: PermissionTypes.MCP_SERVERS,
  permissions: [Permissions.USE],
  getRoleByName,
});

const checkAPIRegistryCreate = generateCheckAccess({
  permissionType: PermissionTypes.MCP_SERVERS,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName,
});

/**
 * Parse OpenAPI spec from URL
 * @route POST /api/registry/apis/parse
 * @param {Object} req.body - Request body
 * @param {string} req.body.swaggerUrl - URL to OpenAPI/Swagger spec
 * @returns {Object} 200 - Parsed OpenAPI spec
 */
router.post('/apis/parse', requireJwtAuth, checkAPIRegistryUse, parseOpenAPISpec);

/**
 * Get all API Registry entries
 * @route GET /api/registry/apis
 * @returns {Object} 200 - List of API registries
 */
router.get('/apis', requireJwtAuth, checkAPIRegistryUse, getAPIRegistries);

/**
 * Create new API Registry entry
 * @route POST /api/registry/apis
 * @param {Object} req.body - API Registry creation parameters
 * @returns {Object} 201 - Created API registry
 */
router.post('/apis', requireJwtAuth, checkAPIRegistryCreate, createAPIRegistry);

/**
 * Get single API Registry entry
 * @route GET /api/registry/apis/:serverName
 * @param {string} req.params.serverName - API Registry server name
 * @returns {Object} 200 - API registry details
 */
router.get(
  '/apis/:serverName',
  requireJwtAuth,
  checkAPIRegistryUse,
  canAccessMCPServerResource({
    requiredPermission: PermissionBits.VIEW,
    resourceIdParam: 'serverName',
  }),
  getAPIRegistry,
);

/**
 * Update API Registry entry
 * @route PATCH /api/registry/apis/:serverName
 * @param {string} req.params.serverName - API Registry server name
 * @param {Object} req.body - Update parameters
 * @returns {Object} 200 - Updated API registry
 */
router.patch(
  '/apis/:serverName',
  requireJwtAuth,
  checkAPIRegistryCreate,
  canAccessMCPServerResource({
    requiredPermission: PermissionBits.EDIT,
    resourceIdParam: 'serverName',
  }),
  updateAPIRegistry,
);

/**
 * Delete API Registry entry
 * @route DELETE /api/registry/apis/:serverName
 * @param {string} req.params.serverName - API Registry server name
 * @returns {Object} 200 - Success message
 */
router.delete(
  '/apis/:serverName',
  requireJwtAuth,
  checkAPIRegistryCreate,
  canAccessMCPServerResource({
    requiredPermission: PermissionBits.DELETE,
    resourceIdParam: 'serverName',
  }),
  deleteAPIRegistry,
);

/**
 * Get tools generated from API Registry
 * @route GET /api/registry/apis/:serverName/tools
 * @param {string} req.params.serverName - API Registry server name
 * @returns {Object} 200 - List of generated tools
 */
router.get(
  '/apis/:serverName/tools',
  requireJwtAuth,
  checkAPIRegistryUse,
  canAccessMCPServerResource({
    requiredPermission: PermissionBits.VIEW,
    resourceIdParam: 'serverName',
  }),
  getAPITools,
);

module.exports = router;