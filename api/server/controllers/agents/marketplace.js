const AgentCategory = require('~/models/AgentCategory');
const mongoose = require('mongoose');
const { logger } = require('~/config');

// Get the Agent model
const Agent = mongoose.model('agent');

// Default page size for agent browsing
const DEFAULT_PAGE_SIZE = 6;

/**
 * Common pagination utility for agent queries
 *
 * @param {Object} filter - MongoDB filter object
 * @param {number} page - Page number (1-based)
 * @param {number} limit - Items per page
 * @returns {Promise<Object>} Paginated results with agents and pagination info
 */
const paginateAgents = async (filter, page = 1, limit = DEFAULT_PAGE_SIZE) => {
  const skip = (page - 1) * limit;

  // Get total count for pagination
  const total = await Agent.countDocuments(filter);

  // Get agents with pagination
  const agents = await Agent.find(filter)
    .select('id name description avatar category support_contact authorName')
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Calculate if there are more agents to load
  const hasMore = total > page * limit;

  return {
    agents,
    pagination: {
      current: page,
      hasMore,
      total,
    },
  };
};

/**
 * Get promoted/top picks agents with pagination
 * Can also return all agents when showAll=true parameter is provided
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getPromotedAgents = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || DEFAULT_PAGE_SIZE;

    // Check if this is a request for "all" agents via query parameter
    const showAllAgents = req.query.showAll === 'true';

    // Base filter for shared agents only
    const filter = {
      projectIds: { $exists: true, $ne: [] }, // Only get shared agents
    };

    // Only add promoted filter if not requesting all agents
    if (!showAllAgents) {
      filter.is_promoted = true; // Only get promoted agents
    }

    const result = await paginateAgents(filter, page, limit);
    res.status(200).json(result);
  } catch (error) {
    logger.error('[/Agents/Marketplace] Error fetching promoted agents:', error);
    res.status(500).json({
      error: 'Failed to fetch promoted agents',
      userMessage: 'Unable to load agents. Please try refreshing the page.',
      suggestion: 'Try refreshing the page or check your network connection',
    });
  }
};

/**
 * Get agents by category with pagination
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAgentsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || DEFAULT_PAGE_SIZE;

    const filter = {
      category,
      projectIds: { $exists: true, $ne: [] }, // Only get shared agents
    };

    const result = await paginateAgents(filter, page, limit);

    // Get category description from database
    const categoryDoc = await AgentCategory.findOne({ value: category, isActive: true });
    const categoryInfo = {
      name: category,
      description: categoryDoc?.description || '',
      total: result.pagination.total,
    };

    res.status(200).json({
      ...result,
      category: categoryInfo,
    });
  } catch (error) {
    logger.error(
      `[/Agents/Marketplace] Error fetching agents for category ${req.params.category}:`,
      error,
    );
    res.status(500).json({
      error: 'Failed to fetch agents by category',
      userMessage: `Unable to load agents for this category. Please try a different category.`,
      suggestion: 'Try selecting a different category or refresh the page',
    });
  }
};

/**
 * Search agents with filters
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const searchAgents = async (req, res) => {
  try {
    const { q, category } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || DEFAULT_PAGE_SIZE;

    if (!q || q.trim() === '') {
      return res.status(400).json({
        error: 'Search query is required',
        userMessage: 'Please enter a search term to find agents',
        suggestion: 'Enter a search term to find agents by name or description',
      });
    }

    // Build search filter
    const filter = {
      projectIds: { $exists: true, $ne: [] }, // Only get shared agents
      $or: [
        { name: { $regex: q, $options: 'i' } }, // Case-insensitive name search
        { description: { $regex: q, $options: 'i' } },
      ],
    };

    // Add category filter if provided
    if (category && category !== 'all') {
      filter.category = category;
    }

    const result = await paginateAgents(filter, page, limit);

    res.status(200).json({
      ...result,
      query: q,
    });
  } catch (error) {
    logger.error('[/Agents/Marketplace] Error searching agents:', error);
    res.status(500).json({
      error: 'Failed to search agents',
      userMessage: 'Search is temporarily unavailable. Please try again.',
      suggestion: 'Try a different search term or check your network connection',
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
    const categories = await AgentCategory.getCategoriesWithCounts();

    // Get count of promoted agents for Top Picks
    const promotedCount = await Agent.countDocuments({
      projectIds: { $exists: true, $ne: [] },
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

/**
 * Get all agents with pagination (for "all" category)
 * This is an alias for getPromotedAgents with showAll=true for backwards compatibility
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAllAgents = async (req, res) => {
  // Set showAll parameter and delegate to getPromotedAgents
  req.query.showAll = 'true';
  return getPromotedAgents(req, res);
};

module.exports = {
  getPromotedAgents,
  getAgentsByCategory,
  searchAgents,
  getAgentCategories,
  getAllAgents,
};
