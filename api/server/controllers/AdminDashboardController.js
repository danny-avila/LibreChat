const { logger } = require('@librechat/data-schemas');
const AnalyticsService = require('~/server/services/AnalyticsService');

/**
 * AdminDashboardController handles all admin dashboard API endpoints
 * for retrieving analytics and metrics data.
 */

/**
 * Get overview metrics for the admin dashboard
 * Aggregates key metrics from multiple sources
 * @route GET /api/admin/dashboard/overview
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getOverviewMetrics = async (req, res) => {
  try {
    // Extract time range from middleware (validateTimeRange sets req.timeRange)
    const { start, end } = req.timeRange;

    // Gather all overview metrics in parallel for better performance
    const [
      userStats,
      conversationStats,
      tokenStats,
      balanceStats,
      cacheStats,
      messageStats,
    ] = await Promise.all([
      AnalyticsService.getUserStats(start, end),
      AnalyticsService.getConversationStats(start, end),
      AnalyticsService.getTokenStats(start, end),
      AnalyticsService.getBalanceStats(),
      AnalyticsService.getCacheStats(start, end),
      AnalyticsService.getMessageStats(start, end),
    ]);

    // Calculate average messages per conversation
    const avgMessagesPerConversation = await AnalyticsService.getAverageMessagesPerConversation(
      start,
      end,
    );

    // Calculate estimated costs
    const estimatedCosts = await AnalyticsService.getEstimatedCosts(start, end);
    
    // Calculate average response time from conversation duration
    // This is an approximation: time between conversation creation and last update
    const avgResponseTime = await AnalyticsService.getAverageResponseTime(start, end);

    // Calculate new users for specific periods and get today's message stats
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);

    // Get today's message stats
    const messageStatsToday = await AnalyticsService.getMessageStats(today, now);

    // Format response as DashboardOverview
    const overview = {
      users: {
        total: userStats.totalUsers,
        active: userStats.activeUsers.daily,
        newToday: 0, // Will be calculated from time range
        newThisWeek: 0,
        newThisMonth: 0,
      },
      conversations: {
        total: conversationStats.totalConversations,
        activeToday: conversationStats.activeCount,
        averageLength: avgMessagesPerConversation,
      },
      messages: {
        total: messageStats.totalMessages,
        todayCount: messageStatsToday.totalMessages,
        userGenerated: messageStats.userGeneratedCount,
        aiGenerated: messageStats.aiGeneratedCount,
      },
      tokens: {
        totalConsumed: tokenStats.totalTokens,
        estimatedCost: estimatedCosts.total,
        averagePerConversation:
          conversationStats.totalConversations > 0
            ? Math.round((tokenStats.totalTokens / conversationStats.totalConversations) * 100) /
              100
            : 0,
      },
      systemHealth: {
        avgResponseTime: avgResponseTime,
        errorRate: messageStats.errorRate,
        cacheHitRate: cacheStats.hitRate,
      },
    };

    // Calculate new users for specific periods
    const [newUsersToday, newUsersWeek, newUsersMonth] = await Promise.all([
      AnalyticsService.getNewUsersByPeriod(today, now, 'daily'),
      AnalyticsService.getNewUsersByPeriod(weekAgo, now, 'daily'),
      AnalyticsService.getNewUsersByPeriod(monthAgo, now, 'daily'),
    ]);

    overview.users.newToday = newUsersToday.reduce((sum, item) => sum + item.value, 0);
    overview.users.newThisWeek = newUsersWeek.reduce((sum, item) => sum + item.value, 0);
    overview.users.newThisMonth = newUsersMonth.reduce((sum, item) => sum + item.value, 0);

    res.status(200).json(overview);
  } catch (error) {
    logger.error('[AdminDashboardController] Error getting overview metrics:', error);
    res.status(500).json({
      error: {
        code: 'OVERVIEW_METRICS_ERROR',
        message: 'Failed to retrieve overview metrics',
      },
      timestamp: new Date(),
    });
  }
};

/**
 * Get user metrics for the admin dashboard
 * @route GET /api/admin/dashboard/users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getUserMetrics = async (req, res) => {
  try {
    // Extract time range from middleware and other parameters from query
    const { start, end } = req.timeRange;
    const { granularity = 'daily', limit = 10, metric = 'conversations' } = req.query;

    // Gather user metrics in parallel
    const [
      userStats,
      newUsers,
      authMethodBreakdown,
      topUsers,
    ] = await Promise.all([
      AnalyticsService.getUserStats(start, end),
      AnalyticsService.getNewUsersByPeriod(start, end, granularity),
      AnalyticsService.getUserAuthMethodBreakdown(),
      AnalyticsService.getTopUsersByActivity(parseInt(limit, 10), metric, start, end),
    ]);

    // Format response as UserMetrics
    const userMetrics = {
      totalUsers: userStats.totalUsers,
      activeUsers: userStats.activeUsers,
      newUsers,
      authMethodBreakdown,
      topUsers,
    };

    res.status(200).json(userMetrics);
  } catch (error) {
    logger.error('[AdminDashboardController] Error getting user metrics:', error);
    res.status(500).json({
      error: {
        code: 'USER_METRICS_ERROR',
        message: 'Failed to retrieve user metrics',
      },
      timestamp: new Date(),
    });
  }
};

/**
 * Get conversation metrics for the admin dashboard
 * @route GET /api/admin/dashboard/conversations
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getConversationMetrics = async (req, res) => {
  try {
    // Extract time range from middleware and other parameters from query
    const { start, end } = req.timeRange;
    const { granularity = 'daily' } = req.query;

    // Gather conversation metrics in parallel
    const [
      conversationStats,
      conversationsByPeriod,
      conversationsByEndpoint,
      avgMessagesPerConversation,
    ] = await Promise.all([
      AnalyticsService.getConversationStats(start, end),
      AnalyticsService.getConversationsByPeriod(start, end, granularity),
      AnalyticsService.getConversationsByEndpoint(start, end),
      AnalyticsService.getAverageMessagesPerConversation(start, end),
    ]);

    // Calculate conversation length distribution
    // This is a simplified version - could be enhanced with actual message count queries
    const conversationLengthDistribution = {
      short: 0,   // 1-5 messages
      medium: 0,  // 6-20 messages
      long: 0,    // 21+ messages
    };

    // Format response as ConversationMetrics
    const conversationMetrics = {
      totalConversations: conversationStats.totalConversations,
      conversationsByPeriod,
      averageMessagesPerConversation: avgMessagesPerConversation,
      conversationsByEndpoint,
      conversationLengthDistribution,
      archivedCount: conversationStats.archivedCount,
    };

    res.status(200).json(conversationMetrics);
  } catch (error) {
    logger.error('[AdminDashboardController] Error getting conversation metrics:', error);
    res.status(500).json({
      error: {
        code: 'CONVERSATION_METRICS_ERROR',
        message: 'Failed to retrieve conversation metrics',
      },
      timestamp: new Date(),
    });
  }
};

/**
 * Get token metrics for the admin dashboard
 * @route GET /api/admin/dashboard/tokens
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getTokenMetrics = async (req, res) => {
  try {
    // Extract time range from middleware
    const { start, end } = req.timeRange;

    // Gather token metrics in parallel
    const [
      tokenStats,
      tokensByEndpoint,
      tokensByModel,
      estimatedCosts,
      balanceStats,
      cacheStats,
    ] = await Promise.all([
      AnalyticsService.getTokenStats(start, end),
      AnalyticsService.getTokenUsageByEndpoint(start, end),
      AnalyticsService.getTokenUsageByModel(start, end),
      AnalyticsService.getEstimatedCosts(start, end),
      AnalyticsService.getBalanceStats(),
      AnalyticsService.getCacheStats(start, end),
    ]);

    // Format response as TokenMetrics
    const tokenMetrics = {
      totalTokens: tokenStats.totalTokens,
      promptTokens: tokenStats.promptTokens,
      completionTokens: tokenStats.completionTokens,
      tokensByEndpoint,
      tokensByModel,
      estimatedCosts,
      balanceStats: {
        totalCredits: balanceStats.totalCredits,
        averageBalance: balanceStats.averageBalance,
        usersWithLowBalance: 0, // Placeholder - would need threshold definition
      },
      cacheStats,
    };

    res.status(200).json(tokenMetrics);
  } catch (error) {
    logger.error('[AdminDashboardController] Error getting token metrics:', error);
    res.status(500).json({
      error: {
        code: 'TOKEN_METRICS_ERROR',
        message: 'Failed to retrieve token metrics',
      },
      timestamp: new Date(),
    });
  }
};

/**
 * Get message metrics for the admin dashboard
 * @route GET /api/admin/dashboard/messages
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getMessageMetrics = async (req, res) => {
  try {
    // Extract time range from middleware and other parameters from query
    const { start, end } = req.timeRange;
    const { granularity = 'daily' } = req.query;

    // Get message statistics
    const messageStats = await AnalyticsService.getMessageStats(start, end);
    
    // Get messages by period for time series
    const messagesByPeriod = await AnalyticsService.getMessagesByPeriod(start, end, granularity);

    // Calculate average message length (approximate - would need message content length)
    const messageMetrics = {
      totalMessages: messageStats.totalMessages,
      messagesByPeriod,
      userGeneratedCount: messageStats.userGeneratedCount,
      aiGeneratedCount: messageStats.aiGeneratedCount,
      averageLength: 0, // Placeholder - would need message content to calculate
      errorCount: messageStats.errorCount,
      errorRate: messageStats.errorRate,
    };

    res.status(200).json(messageMetrics);
  } catch (error) {
    logger.error('[AdminDashboardController] Error getting message metrics:', error);
    res.status(500).json({
      error: {
        code: 'MESSAGE_METRICS_ERROR',
        message: 'Failed to retrieve message metrics',
      },
      timestamp: new Date(),
    });
  }
};

/**
 * Export dashboard data in specified format
 * @route POST /api/admin/dashboard/export
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const exportData = async (req, res) => {
  try {
    // Extract parameters from request body
    const { format = 'json', dataType, startDate, endDate } = req.body;

    // Validate format
    if (!['csv', 'json'].includes(format)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FORMAT',
          message: 'Format must be either "csv" or "json"',
        },
        timestamp: new Date(),
      });
    }

    // Validate dataType
    const validDataTypes = ['users', 'conversations', 'tokens', 'messages', 'overview'];
    if (!validDataTypes.includes(dataType)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DATA_TYPE',
          message: `Data type must be one of: ${validDataTypes.join(', ')}`,
        },
        timestamp: new Date(),
      });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Gather requested data based on dataType
    let data;
    switch (dataType) {
      case 'users':
        data = await getUserMetrics({ query: { startDate, endDate } }, { json: (d) => d });
        break;
      case 'conversations':
        data = await getConversationMetrics({ query: { startDate, endDate } }, { json: (d) => d });
        break;
      case 'tokens':
        data = await getTokenMetrics({ query: { startDate, endDate } }, { json: (d) => d });
        break;
      case 'messages':
        data = await getMessageMetrics({ query: { startDate, endDate } }, { json: (d) => d });
        break;
      case 'overview':
        data = await getOverviewMetrics({ query: { startDate, endDate } }, { json: (d) => d });
        break;
    }

    // Format filename with timestamp and date range
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `librechat-${dataType}-${timestamp}.${format}`;

    if (format === 'json') {
      // Set headers for JSON download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).json(data);
    } else if (format === 'csv') {
      // Convert data to CSV format
      const csv = convertToCSV(data, dataType);
      
      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    }
  } catch (error) {
    logger.error('[AdminDashboardController] Error exporting data:', error);
    res.status(500).json({
      error: {
        code: 'EXPORT_ERROR',
        message: 'Failed to export data',
      },
      timestamp: new Date(),
    });
  }
};

/**
 * Helper function to convert data to CSV format
 * @param {Object} data - The data to convert
 * @param {string} dataType - The type of data being converted
 * @returns {string} CSV formatted string
 */
function convertToCSV(data, dataType) {
  // This is a simplified CSV conversion
  // A more robust implementation would use a library like 'json2csv'
  
  let csv = '';
  
  switch (dataType) {
    case 'users':
      // Convert user metrics to CSV
      csv = 'Metric,Value\n';
      csv += `Total Users,${data.totalUsers}\n`;
      csv += `Daily Active Users,${data.activeUsers.daily}\n`;
      csv += `Weekly Active Users,${data.activeUsers.weekly}\n`;
      csv += `Monthly Active Users,${data.activeUsers.monthly}\n`;
      
      // Add top users table
      csv += '\nTop Users\n';
      csv += 'Email,Conversations,Messages,Tokens,Last Active\n';
      data.topUsers.forEach((user) => {
        csv += `${user.email},${user.conversationCount},${user.messageCount},${user.tokenUsage},${user.lastActive}\n`;
      });
      break;
      
    case 'conversations':
      csv = 'Metric,Value\n';
      csv += `Total Conversations,${data.totalConversations}\n`;
      csv += `Average Messages Per Conversation,${data.averageMessagesPerConversation}\n`;
      csv += `Archived Count,${data.archivedCount}\n`;
      
      // Add endpoint breakdown
      csv += '\nConversations by Endpoint\n';
      csv += 'Endpoint,Count,Percentage\n';
      data.conversationsByEndpoint.forEach((item) => {
        csv += `${item.endpoint},${item.count},${item.percentage}%\n`;
      });
      break;
      
    case 'tokens':
      csv = 'Metric,Value\n';
      csv += `Total Tokens,${data.totalTokens}\n`;
      csv += `Prompt Tokens,${data.promptTokens}\n`;
      csv += `Completion Tokens,${data.completionTokens}\n`;
      csv += `Estimated Cost,$${data.estimatedCosts.total}\n`;
      
      // Add token usage by endpoint
      csv += '\nToken Usage by Endpoint\n';
      csv += 'Endpoint,Tokens,Cost\n';
      data.tokensByEndpoint.forEach((item) => {
        csv += `${item.endpoint},${item.tokens},$${item.cost}\n`;
      });
      break;
      
    case 'messages':
      csv = 'Metric,Value\n';
      csv += `Total Messages,${data.totalMessages}\n`;
      csv += `User Generated,${data.userGeneratedCount}\n`;
      csv += `AI Generated,${data.aiGeneratedCount}\n`;
      csv += `Average Length,${data.averageLength}\n`;
      csv += `Error Count,${data.errorCount}\n`;
      csv += `Error Rate,${data.errorRate}%\n`;
      break;
      
    case 'overview':
      csv = 'Category,Metric,Value\n';
      csv += `Users,Total,${data.users.total}\n`;
      csv += `Users,Active,${data.users.active}\n`;
      csv += `Users,New Today,${data.users.newToday}\n`;
      csv += `Conversations,Total,${data.conversations.total}\n`;
      csv += `Conversations,Active Today,${data.conversations.activeToday}\n`;
      csv += `Tokens,Total Consumed,${data.tokens.totalConsumed}\n`;
      csv += `Tokens,Estimated Cost,$${data.tokens.estimatedCost}\n`;
      break;
  }
  
  return csv;
}

/**
 * Get model usage analytics
 * @route GET /api/admin/dashboard/models
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getModelUsageMetrics = async (req, res) => {
  try {
    const { start, end } = req.timeRange;
    const modelAnalytics = await AnalyticsService.getModelUsageAnalytics(start, end);
    res.json(modelAnalytics);
  } catch (error) {
    logger.error('[AdminDashboardController] Error getting model usage metrics:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve model usage metrics',
      },
      timestamp: new Date(),
    });
  }
};

/**
 * Get balance and credits analytics
 * @route GET /api/admin/dashboard/balance
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getBalanceMetrics = async (req, res) => {
  try {
    const { start, end } = req.timeRange;
    const balanceAnalytics = await AnalyticsService.getBalanceAnalytics(start, end);
    res.json(balanceAnalytics);
  } catch (error) {
    logger.error('[AdminDashboardController] Error getting balance metrics:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve balance metrics',
      },
      timestamp: new Date(),
    });
  }
};

/**
 * Get error and failure analytics
 * @route GET /api/admin/dashboard/errors
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getErrorMetrics = async (req, res) => {
  try {
    const { start, end } = req.timeRange;
    const errorAnalytics = await AnalyticsService.getErrorAnalytics(start, end);
    res.json(errorAnalytics);
  } catch (error) {
    logger.error('[AdminDashboardController] Error getting error metrics:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve error metrics',
      },
      timestamp: new Date(),
    });
  }
};

/**
 * Get file upload analytics
 * @route GET /api/admin/dashboard/files
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getFileUploadMetrics = async (req, res) => {
  try {
    const { start, end } = req.timeRange;
    const fileAnalytics = await AnalyticsService.getFileUploadAnalytics(start, end);
    res.json(fileAnalytics);
  } catch (error) {
    logger.error('[AdminDashboardController] Error getting file upload metrics:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve file upload metrics',
      },
      timestamp: new Date(),
    });
  }
};

/**
 * Get live/real-time data
 * @route GET /api/admin/dashboard/live
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getLiveData = async (req, res) => {
  try {
    const liveData = await AnalyticsService.getLiveData();
    res.json(liveData);
  } catch (error) {
    logger.error('[AdminDashboardController] Error getting live data:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve live data',
      },
      timestamp: new Date(),
    });
  }
};

/**
 * Get user engagement metrics
 * @route GET /api/admin/dashboard/engagement
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getUserEngagementMetrics = async (req, res) => {
  try {
    const { start, end } = req.timeRange;
    const engagementAnalytics = await AnalyticsService.getUserEngagementMetrics(start, end);
    res.json(engagementAnalytics);
  } catch (error) {
    logger.error('[AdminDashboardController] Error getting user engagement metrics:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve user engagement metrics',
      },
      timestamp: new Date(),
    });
  }
};

/**
 * Get endpoint performance metrics
 * @route GET /api/admin/dashboard/endpoints
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getEndpointPerformanceMetrics = async (req, res) => {
  try {
    const { start, end } = req.timeRange;
    const endpointAnalytics = await AnalyticsService.getEndpointPerformanceMetrics(start, end);
    res.json(endpointAnalytics);
  } catch (error) {
    logger.error('[AdminDashboardController] Error getting endpoint performance metrics:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve endpoint performance metrics',
      },
      timestamp: new Date(),
    });
  }
};

/**
 * Get conversation quality metrics
 * @route GET /api/admin/dashboard/quality
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getConversationQualityMetrics = async (req, res) => {
  try {
    const { start, end } = req.timeRange;
    const qualityAnalytics = await AnalyticsService.getConversationQualityMetrics(start, end);
    res.json(qualityAnalytics);
  } catch (error) {
    logger.error('[AdminDashboardController] Error getting conversation quality metrics:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve conversation quality metrics',
      },
      timestamp: new Date(),
    });
  }
};

module.exports = {
  getOverviewMetrics,
  getUserMetrics,
  getConversationMetrics,
  getTokenMetrics,
  getMessageMetrics,
  getModelUsageMetrics,
  getBalanceMetrics,
  getErrorMetrics,
  getFileUploadMetrics,
  getUserEngagementMetrics,
  getEndpointPerformanceMetrics,
  getConversationQualityMetrics,
  getLiveData,
  exportData,
};
