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
 * Get all agent categories with counts
 * @route GET /agents/marketplace/categories
 */
router.get('/categories', marketplace.getAgentCategories);

/**
 * Get promoted/top picks agents with pagination
 * @route GET /agents/marketplace/promoted
 */
router.get('/promoted', marketplace.getPromotedAgents);

/**
 * Get all agents with pagination (for "all" category)
 * @route GET /agents/marketplace/all
 */
router.get('/all', marketplace.getAllAgents);

/**
 * Search agents with filters
 * @route GET /agents/marketplace/search
 */
router.get('/search', marketplace.searchAgents);

/**
 * Get agents by category with pagination
 * @route GET /agents/marketplace/category/:category
 */
router.get('/category/:category', marketplace.getAgentsByCategory);

module.exports = router;
