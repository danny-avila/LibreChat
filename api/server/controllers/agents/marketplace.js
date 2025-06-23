const mongoose = require('mongoose');
const { logger } = require('~/config');
const { findCategoryByValue, getCategoriesWithCounts } = require('~/models');
const { getListAgentsByAccess } = require('~/models/Agent');
const {
  findAccessibleResources,
  findPubliclyAccessibleResources,
} = require('~/server/services/PermissionService');
// Get the Agent model
const Agent = mongoose.model('Agent');

// Default page size for agent browsing
const DEFAULT_PAGE_SIZE = 6;

const getAgentsPagedByAccess = async (
  userId,
  requiredPermission,
  filter,
  limit = DEFAULT_PAGE_SIZE,
  cursor,
) => {
  const accessibleIds = await findAccessibleResources({
    userId,
    resourceType: 'agent',
    requiredPermissions: requiredPermission,
  });
  const publiclyAccessibleIds = await findPubliclyAccessibleResources({
    resourceType: 'agent',
    requiredPermissions: requiredPermission,
  });
  // Use the new ACL-aware function
  const data = await getListAgentsByAccess({
    accessibleIds,
    otherParams: filter,
    limit,
    after: cursor,
  });
  if (data?.data?.length) {
    data.data = data.data.map((agent) => {
      if (publiclyAccessibleIds.some((id) => id.equals(agent._id))) {
        agent.isPublic = true;
      }
      return agent;
    });
  }
  return data;
};

/**
 * Unified marketplace agents endpoint with query string controls
 * Query parameters:
 * - category: string (filter by specific category - if undefined, no category filter applied)
 * - search: string (search term for name/description)
 * - limit: number (page size, default 6)
 * - cursor: base64 string (for cursor-based pagination)
 * - promoted: 0|1 (filter promoted agents, 1=promoted only, 0=exclude promoted)
 * - requiredPermission: number (permission level required to access agents, default 1)
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getMarketplaceAgents = async (req, res) => {
  try {
    const {
      category,
      search,
      limit = DEFAULT_PAGE_SIZE,
      cursor,
      promoted,
      requiredPermission = 1,
    } = req.query;

    const parsedLimit = parseInt(limit) || DEFAULT_PAGE_SIZE;
    const parsedRequiredPermission = parseInt(requiredPermission) || 1;

    // Base filter
    const filter = {};

    // Handle category filter - only apply if category is defined
    if (category !== undefined && category.trim() !== '') {
      filter.category = category;
    }

    // Handle promoted filter - only from query param
    if (promoted === '1') {
      filter.is_promoted = true;
    } else if (promoted === '0') {
      filter.is_promoted = { $ne: true };
    }

    // Handle search filter
    if (search && search.trim() !== '') {
      filter.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    // Use ACL-aware function for proper permission handling
    const result = await getAgentsPagedByAccess(
      req.user.id,
      parsedRequiredPermission, // Required permission as number
      filter,
      parsedLimit,
      cursor,
    );

    // Add category info if category was specified
    if (category !== undefined && category.trim() !== '') {
      const categoryDoc = await findCategoryByValue(category);
      result.category = {
        name: category,
        description: categoryDoc?.description || '',
        total: result.pagination?.total || result.data?.length || 0,
      };
    }

    // Add search info if search was performed
    if (search && search.trim() !== '') {
      result.query = search.trim();
    }

    res.status(200).json(result);
  } catch (error) {
    logger.error('[/Agents/Marketplace] Error fetching marketplace agents:', error);
    res.status(500).json({
      error: 'Failed to fetch marketplace agents',
      userMessage: 'Unable to load agents. Please try refreshing the page.',
      suggestion: 'Try refreshing the page or check your network connection',
    });
  }
};

/**
 * Get all agent categories with counts
 *
 * @param {Object} _req - Express request object (unused)
 * @param {Object} res - Express response object
 */
const getAgentCategories = async (_req, res) => {
  try {
    // Get categories with agent counts from database
    const categories = await getCategoriesWithCounts();

    // Get count of promoted agents for Top Picks
    const promotedCount = await Agent.countDocuments({
      is_promoted: true,
    });

    // Convert to marketplace format (TCategory structure)
    const formattedCategories = categories.map((category) => ({
      value: category.value,
      label: category.label,
      count: category.agentCount,
      description: category.description,
    }));

    // Add promoted category if agents exist
    if (promotedCount > 0) {
      formattedCategories.unshift({
        value: 'promoted',
        label: 'Promoted',
        count: promotedCount,
        description: 'Our recommended agents',
      });
    }

    // Get total count of all shared agents for "All" category
    const totalAgents = await Agent.countDocuments({
      projectIds: { $exists: true, $ne: [] },
    });

    // Add "All" category at the end
    formattedCategories.push({
      value: 'all',
      label: 'All',
      count: totalAgents,
      description: 'All available agents',
    });

    res.status(200).json(formattedCategories);
  } catch (error) {
    logger.error('[/Agents/Marketplace] Error fetching agent categories:', error);
    res.status(500).json({
      error: 'Failed to fetch agent categories',
      userMessage: 'Unable to load categories. Please refresh the page.',
      suggestion: 'Try refreshing the page or check your network connection',
    });
  }
};

module.exports = {
  getMarketplaceAgents,
  getAgentCategories,
};
