const express = require('express');
const { requireJwtAuth, checkBan, generateCheckAccess } = require('~/server/middleware');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const marketplace = require('~/server/controllers/agents/marketplace');

const router = express.Router();

// Apply middleware for authentication and authorization
router.use(requireJwtAuth);
router.use(checkBan);

// Check if user has permission to use agents
const checkAgentAccess = generateCheckAccess(PermissionTypes.AGENTS, [Permissions.USE]);
router.use(checkAgentAccess);

/**
 * Unified marketplace agents endpoint with query string controls
 * Query parameters:
 * - category: string (filter by category, or 'all' for all agents, 'promoted' for promoted)
 * - search: string (search term for name/description)
 * - limit: number (page size, default 6)
 * - cursor: base64 string (for cursor-based pagination)
 * - promoted: 0|1 (filter promoted agents, 1=promoted only, 0=exclude promoted)
 * - requiredPermission: number (permission level required to access agents, default 1)
 * @route GET /agents/marketplace
 */
router.get('/', marketplace.getMarketplaceAgents);

/**
 * Get all agent categories with counts
 * @route GET /agents/marketplace/categories
 */
router.get('/categories', marketplace.getAgentCategories);

module.exports = router;
