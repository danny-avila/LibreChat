const { logger } = require('@librechat/data-schemas');
const { User, Conversation, Message, Transaction, Balance, File } = require('~/db/models');

/**
 * AnalyticsService provides methods for aggregating and analyzing
 * user activity, conversations, tokens, and messages for the admin dashboard.
 */
class AnalyticsService {
  /**
   * Validates that start date is before or equal to end date
   * @param {Date} startDate - The start date
   * @param {Date} endDate - The end date
   * @throws {Error} If start date is after end date
   */
  validateDateRange(startDate, endDate) {
    if (startDate > endDate) {
      throw new Error('Start date must be before or equal to end date');
    }
  }

  /**
   * Ensures dates are Date objects
   * @param {Date|string} date - The date to convert
   * @returns {Date} The date as a Date object
   */
  ensureDate(date) {
    return date instanceof Date ? date : new Date(date);
  }

  /**
   * Get comprehensive user statistics including total users and active users
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Object>} User statistics object
   * @returns {Promise<{totalUsers: number, activeUsers: {daily: number, weekly: number, monthly: number}}>}
   */
  async getUserStats(startDate, endDate) {
    try {
      // Ensure dates are Date objects
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);

      // Validate date range
      this.validateDateRange(startDate, endDate);

      // Get total user count (all users registered up to end date)
      const totalUsers = await User.countDocuments({
        createdAt: { $lte: endDate },
      });

      // Calculate active users for different time periods
      // Active users are those who have created conversations within the time period
      
      // Daily active users (within the selected date range)
      const dailyActiveUsers = await Conversation.distinct('user', {
        createdAt: { $gte: startDate, $lte: endDate },
      });

      // Weekly active users (last 7 days from end date)
      const weekStart = new Date(endDate);
      weekStart.setDate(weekStart.getDate() - 7);
      const weeklyActiveUsers = await Conversation.distinct('user', {
        createdAt: { $gte: weekStart, $lte: endDate },
      });

      // Monthly active users (last 30 days from end date)
      const monthStart = new Date(endDate);
      monthStart.setDate(monthStart.getDate() - 30);
      const monthlyActiveUsers = await Conversation.distinct('user', {
        createdAt: { $gte: monthStart, $lte: endDate },
      });

      return {
        totalUsers,
        activeUsers: {
          daily: dailyActiveUsers.length,
          weekly: weeklyActiveUsers.length,
          monthly: monthlyActiveUsers.length,
        },
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting user stats:', error);
      throw new Error('Failed to retrieve user statistics');
    }
  }

  /**
   * Get new user registrations grouped by time period
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @param {string} granularity - The grouping granularity: 'daily', 'weekly', or 'monthly'
   * @returns {Promise<Array<{timestamp: Date, value: number}>>} Time series data of new user registrations
   */
  async getNewUsersByPeriod(startDate, endDate, granularity = 'daily') {
    try {
      // Ensure dates are Date objects
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);

      // Validate date range
      this.validateDateRange(startDate, endDate);

      // Validate granularity
      const validGranularities = ['daily', 'weekly', 'monthly'];
      if (!validGranularities.includes(granularity)) {
        throw new Error(`Invalid granularity: ${granularity}. Must be one of: ${validGranularities.join(', ')}`);
      }

      // Determine the date format string based on granularity
      let dateFormat;
      let dateUnit;
      
      switch (granularity) {
        case 'daily':
          dateFormat = '%Y-%m-%d';
          dateUnit = 'day';
          break;
        case 'weekly':
          // ISO week format: year-week
          dateFormat = '%Y-W%V';
          dateUnit = 'week';
          break;
        case 'monthly':
          dateFormat = '%Y-%m';
          dateUnit = 'month';
          break;
      }

      // Build aggregation pipeline
      const pipeline = [
        // Match users created within the date range
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        // Group by the specified time period
        {
          $group: {
            _id: {
              $dateToString: {
                format: dateFormat,
                date: '$createdAt',
              },
            },
            count: { $sum: 1 },
            // Keep the first date in the period for timestamp
            firstDate: { $min: '$createdAt' },
          },
        },
        // Sort by date ascending
        {
          $sort: { _id: 1 },
        },
        // Project to the desired output format
        {
          $project: {
            _id: 0,
            timestamp: '$firstDate',
            value: '$count',
          },
        },
      ];

      const results = await User.aggregate(pipeline);

      return results;
    } catch (error) {
      logger.error('[AnalyticsService] Error getting new users by period:', error);
      throw new Error('Failed to retrieve new users by period');
    }
  }

  /**
   * Get breakdown of users by authentication method/provider
   * @returns {Promise<Object>} Authentication method breakdown with counts and percentages
   * @returns {Promise<{[provider: string]: {count: number, percentage: number}}>}
   */
  async getUserAuthMethodBreakdown() {
    try {
      // Get total user count for percentage calculation
      const totalUsers = await User.countDocuments();

      // If no users, return empty breakdown
      if (totalUsers === 0) {
        return {};
      }

      // Aggregate users by provider
      const pipeline = [
        {
          $group: {
            _id: '$provider',
            count: { $sum: 1 },
          },
        },
        {
          $sort: { count: -1 },
        },
      ];

      const results = await User.aggregate(pipeline);

      // Transform results into the desired format with percentages
      const breakdown = {};
      for (const result of results) {
        const provider = result._id || 'unknown';
        const count = result.count;
        const percentage = (count / totalUsers) * 100;

        breakdown[provider] = {
          count,
          percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
        };
      }

      return breakdown;
    } catch (error) {
      logger.error('[AnalyticsService] Error getting user auth method breakdown:', error);
      throw new Error('Failed to retrieve user authentication method breakdown');
    }
  }

  /**
   * Get comprehensive conversation statistics including total count and archived vs active
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Object>} Conversation statistics object
   * @returns {Promise<{totalConversations: number, archivedCount: number, activeCount: number}>}
   */
  async getConversationStats(startDate, endDate) {
    try {
      // Ensure dates are Date objects
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);

      // Validate date range
      this.validateDateRange(startDate, endDate);

      // Get total conversation count within the date range
      const totalConversations = await Conversation.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
      });

      // Get archived conversation count
      const archivedCount = await Conversation.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
        isArchived: true,
      });

      // Calculate active count (not archived)
      const activeCount = totalConversations - archivedCount;

      return {
        totalConversations,
        archivedCount,
        activeCount,
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting conversation stats:', error);
      throw new Error('Failed to retrieve conversation statistics');
    }
  }

  /**
   * Get average response time (approximated from conversation duration)
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<number>} Average response time in milliseconds
   */
  async getAverageResponseTime(startDate, endDate) {
    try {
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);
      this.validateDateRange(startDate, endDate);

      // Calculate average time between conversation creation and last message
      // This is an approximation - actual response time would need request/response timestamps
      const pipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            updatedAt: { $exists: true },
          },
        },
        {
          $lookup: {
            from: 'messages',
            localField: '_id',
            foreignField: 'conversationId',
            as: 'messages',
          },
        },
        {
          $match: {
            'messages.0': { $exists: true }, // Only conversations with messages
          },
        },
        {
          $project: {
            duration: {
              $subtract: ['$updatedAt', '$createdAt'],
            },
            messageCount: { $size: '$messages' },
          },
        },
        {
          $match: {
            messageCount: { $gt: 0 },
            duration: { $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            avgDuration: { $avg: '$duration' },
            totalConversations: { $sum: 1 },
          },
        },
      ];

      const results = await Conversation.aggregate(pipeline);

      if (results.length === 0 || results[0].totalConversations === 0) {
        return 0;
      }

      // Return average duration in milliseconds
      // If duration is very large (likely includes idle time), return 0
      const avgDuration = results[0].avgDuration;
      // If average duration is more than 1 hour, it's likely including idle time, so return 0
      if (avgDuration > 3600000) {
        return 0;
      }
      return Math.round(avgDuration);
    } catch (error) {
      logger.error('[AnalyticsService] Error getting average response time:', error);
      // Return 0 on error rather than throwing
      return 0;
    }
  }

  /**
   * Get conversations grouped by time period
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @param {string} granularity - The grouping granularity: 'daily', 'weekly', or 'monthly'
   * @returns {Promise<Array<{timestamp: Date, value: number}>>} Time series data of conversation creation
   */
  async getConversationsByPeriod(startDate, endDate, granularity = 'daily') {
    try {
      // Ensure dates are Date objects
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);

      // Validate date range
      this.validateDateRange(startDate, endDate);

      // Validate granularity
      const validGranularities = ['daily', 'weekly', 'monthly'];
      if (!validGranularities.includes(granularity)) {
        throw new Error(`Invalid granularity: ${granularity}. Must be one of: ${validGranularities.join(', ')}`);
      }

      // Determine the date format string based on granularity
      let dateFormat;
      
      switch (granularity) {
        case 'daily':
          dateFormat = '%Y-%m-%d';
          break;
        case 'weekly':
          // ISO week format: year-week
          dateFormat = '%Y-W%V';
          break;
        case 'monthly':
          dateFormat = '%Y-%m';
          break;
      }

      // Build aggregation pipeline
      const pipeline = [
        // Match conversations created within the date range
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        // Group by the specified time period
        {
          $group: {
            _id: {
              $dateToString: {
                format: dateFormat,
                date: '$createdAt',
              },
            },
            count: { $sum: 1 },
            // Keep the first date in the period for timestamp
            firstDate: { $min: '$createdAt' },
          },
        },
        // Sort by date ascending
        {
          $sort: { _id: 1 },
        },
        // Project to the desired output format
        {
          $project: {
            _id: 0,
            timestamp: '$firstDate',
            value: '$count',
          },
        },
      ];

      const results = await Conversation.aggregate(pipeline);

      return results;
    } catch (error) {
      logger.error('[AnalyticsService] Error getting conversations by period:', error);
      throw new Error('Failed to retrieve conversations by period');
    }
  }

  /**
   * Get conversations grouped by endpoint with counts and percentages
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Array<{endpoint: string, count: number, percentage: number}>>} Endpoint breakdown
   */
  async getConversationsByEndpoint(startDate, endDate) {
    try {
      // Ensure dates are Date objects
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);

      // Validate date range
      this.validateDateRange(startDate, endDate);

      // Get total conversation count for percentage calculation
      const totalConversations = await Conversation.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
      });

      // If no conversations, return empty array
      if (totalConversations === 0) {
        return [];
      }

      // Build aggregation pipeline
      const pipeline = [
        // Match conversations created within the date range
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        // Group by endpoint
        {
          $group: {
            _id: '$endpoint',
            count: { $sum: 1 },
          },
        },
        // Sort by count descending
        {
          $sort: { count: -1 },
        },
      ];

      const results = await Conversation.aggregate(pipeline);

      // Transform results to include percentages
      const breakdown = results.map((result) => {
        const endpoint = result._id || 'unknown';
        const count = result.count;
        const percentage = (count / totalConversations) * 100;

        return {
          endpoint,
          count,
          percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
        };
      });

      return breakdown;
    } catch (error) {
      logger.error('[AnalyticsService] Error getting conversations by endpoint:', error);
      throw new Error('Failed to retrieve conversations by endpoint');
    }
  }

  /**
   * Get average number of messages per conversation
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<number>} Average messages per conversation
   */
  async getAverageMessagesPerConversation(startDate, endDate) {
    try {
      // Ensure dates are Date objects
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);

      // Validate date range
      this.validateDateRange(startDate, endDate);

      // Build aggregation pipeline
      const pipeline = [
        // Match conversations created within the date range
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        // Lookup messages for each conversation
        {
          $lookup: {
            from: 'messages',
            localField: 'conversationId',
            foreignField: 'conversationId',
            as: 'messages',
          },
        },
        // Project to get message count
        {
          $project: {
            messageCount: { $size: '$messages' },
          },
        },
        // Group to calculate average
        {
          $group: {
            _id: null,
            avgMessages: { $avg: '$messageCount' },
            totalConversations: { $sum: 1 },
          },
        },
      ];

      const results = await Conversation.aggregate(pipeline);

      // If no conversations, return 0
      if (results.length === 0) {
        return 0;
      }

      // Round to 2 decimal places
      const avgMessages = results[0].avgMessages || 0;
      return Math.round(avgMessages * 100) / 100;
    } catch (error) {
      logger.error('[AnalyticsService] Error getting average messages per conversation:', error);
      throw new Error('Failed to retrieve average messages per conversation');
    }
  }

  /**
   * Get top users by activity metric (conversation count, message count, or token usage)
   * @param {number} limit - Maximum number of users to return (default: 10)
   * @param {string} metric - The metric to sort by: 'conversations', 'messages', or 'tokens'
   * @param {Date} startDate - Optional start date for filtering (default: no filter)
   * @param {Date} endDate - Optional end date for filtering (default: no filter)
   * @returns {Promise<Array<{userId: string, email: string, conversationCount: number, messageCount: number, tokenUsage: number, lastActive: Date}>>} Array of top users
   */
  async getTopUsersByActivity(limit = 10, metric = 'conversations', startDate = null, endDate = null) {
    try {
      // Validate limit
      if (typeof limit !== 'number' || limit < 1) {
        throw new Error('Limit must be a positive number');
      }

      // Validate metric
      const validMetrics = ['conversations', 'messages', 'tokens'];
      if (!validMetrics.includes(metric)) {
        throw new Error(`Invalid metric: ${metric}. Must be one of: ${validMetrics.join(', ')}`);
      }

      // Build aggregation pipeline to get user activity metrics
      const matchStage = {};
      if (startDate && endDate) {
        startDate = this.ensureDate(startDate);
        endDate = this.ensureDate(endDate);
        matchStage.createdAt = { $gte: startDate, $lte: endDate };
      }

      const pipeline = [
        // Match conversations in time range (if provided)
        ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
        // Start with conversations to get user activity
        {
          $group: {
            _id: '$user',
            conversationCount: { $sum: 1 },
            lastActive: { $max: '$updatedAt' },
          },
        },
        // Skip user lookup in aggregation - will enrich in post-processing
        // This avoids DocumentDB limitations with multiple lookups
        // Lookup messages to count user messages - SIMPLIFIED for DocumentDB compatibility
        {
          $lookup: {
            from: 'messages',
            localField: '_id',
            foreignField: 'user',
            as: 'userMessages',
          },
        },
        // Lookup transactions to calculate token usage
        {
          $lookup: {
            from: 'transactions',
            localField: '_id',
            foreignField: 'user',
            as: 'userTransactions',
          },
        },
        // Filter transactions by token type and time range if provided
        {
          $addFields: {
            userTransactions: {
              $filter: {
                input: '$userTransactions',
                as: 'tx',
                cond: startDate && endDate
                  ? {
                      $and: [
                        { $in: ['$$tx.tokenType', ['prompt', 'completion']] },
                        { $gte: ['$$tx.createdAt', startDate] },
                        { $lte: ['$$tx.createdAt', endDate] },
                      ],
                    }
                  : {
                      $in: ['$$tx.tokenType', ['prompt', 'completion']],
                    },
              },
            },
          },
        },
        // Project to final structure with calculations
        // Include all user fields for testing/debugging purposes
        {
          $project: {
            _id: 0,
            userId: { $toString: '$_id' },
            // Activity metrics
            conversationCount: 1,
            messageCount: {
              $size: {
                $filter: {
                  input: '$userMessages',
                  as: 'msg',
                  cond: { $eq: ['$$msg.isCreatedByUser', true] },
                },
              },
            },
            tokenUsage: {
              $reduce: {
                input: '$userTransactions', // Already filtered in lookup
                initialValue: 0,
                in: {
                  $add: [
                    '$$value',
                    {
                      $abs: { $ifNull: ['$$this.rawAmount', 0] },
                    },
                  ],
                },
              },
            },
            lastActive: 1,
            // userDetails will be populated in post-processing
            // Email field - will be populated in post-processing
            email: 'Unknown',
          },
        },
      ];

      // Add sorting based on the specified metric
      let sortField;
      switch (metric) {
        case 'conversations':
          sortField = 'conversationCount';
          break;
        case 'messages':
          sortField = 'messageCount';
          break;
        case 'tokens':
          sortField = 'tokenUsage';
          break;
      }

      pipeline.push({
        $sort: { [sortField]: -1 },
      });

      // Add limit
      pipeline.push({
        $limit: limit,
      });

      const results = await Conversation.aggregate(pipeline);

      // Post-process: Enrich all results with user details via direct lookups
      // This avoids DocumentDB limitations with multiple $lookup stages
      const enrichedResults = await Promise.all(
        results.map(async (user) => {
          try {
            const userId = user.userId || user._id?.toString();
            if (userId) {
              const directUser = await User.findById(userId).lean();
              if (directUser) {
                // Only include essential user fields
                user.userDetails = {
                  email: directUser.email || null,
                  name: directUser.name || null,
                  username: directUser.username || null,
                  role: directUser.role || null,
                };
                // Update the email field
                user.email = directUser.email || 'Unknown';
              } else {
                user.userDetails = null;
                user.email = 'Unknown';
              }
            }
          } catch (error) {
            logger.warn(`[AnalyticsService] Failed to enrich user ${user.userId}:`, error);
            user.userDetails = null;
            user.email = 'Unknown';
          }
          return user;
        }),
      );

      return enrichedResults;
    } catch (error) {
      logger.error('[AnalyticsService] Error getting top users by activity:', error);
      throw new Error('Failed to retrieve top users by activity');
    }
  }

  /**
   * Get user details by ID for debugging/testing purposes
   * @param {string} userId - The user ID to look up
   * @returns {Promise<Object|null>} User document or null if not found
   */
  async getUserDetailsById(userId) {
    try {
      if (!userId) {
        return null;
      }

      // Use mongoose to find user by ID
      const user = await User.findById(userId).lean();

      if (!user) {
        return null;
      }

      // Return all user fields
      return {
        _id: user._id?.toString(),
        email: user.email || null,
        emailVerified: user.emailVerified || null,
        username: user.username || null,
        name: user.name || null,
        provider: user.provider || null,
        role: user.role || null,
        avatar: user.avatar || null,
        googleId: user.googleId || null,
        facebookId: user.facebookId || null,
        openidId: user.openidId || null,
        samlId: user.samlId || null,
        ldapId: user.ldapId || null,
        githubId: user.githubId || null,
        discordId: user.discordId || null,
        appleId: user.appleId || null,
        idOnTheSource: user.idOnTheSource || null,
        createdAt: user.createdAt || null,
        updatedAt: user.updatedAt || null,
        twoFactorEnabled: user.twoFactorEnabled || null,
        termsAccepted: user.termsAccepted || null,
        // Include any other fields that might exist
        rawUser: user, // Include the full raw user object for complete inspection
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting user details by ID:', error);
      return null;
    }
  }

  /**
   * Get comprehensive token statistics including total tokens consumed
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Object>} Token statistics object
   * @returns {Promise<{totalTokens: number, promptTokens: number, completionTokens: number}>}
   */
  async getTokenStats(startDate, endDate) {
    try {
      // Ensure dates are Date objects
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);

      // Validate date range
      this.validateDateRange(startDate, endDate);

      // Build aggregation pipeline to sum tokens by type
      const pipeline = [
        // Match transactions within the date range
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            tokenType: { $in: ['prompt', 'completion'] },
          },
        },
        // Group by token type and sum rawAmount
        {
          $group: {
            _id: '$tokenType',
            totalTokens: { $sum: { $abs: '$rawAmount' } },
          },
        },
      ];

      const results = await Transaction.aggregate(pipeline);

      // Initialize token counts
      let promptTokens = 0;
      let completionTokens = 0;

      // Extract token counts from results
      for (const result of results) {
        if (result._id === 'prompt') {
          promptTokens = result.totalTokens || 0;
        } else if (result._id === 'completion') {
          completionTokens = result.totalTokens || 0;
        }
      }

      // Calculate total tokens
      const totalTokens = promptTokens + completionTokens;

      return {
        totalTokens,
        promptTokens,
        completionTokens,
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting token stats:', error);
      throw new Error('Failed to retrieve token statistics');
    }
  }

  /**
   * Get token usage aggregated by endpoint with costs
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Array<{endpoint: string, tokens: number, cost: number}>>} Token usage by endpoint
   */
  async getTokenUsageByEndpoint(startDate, endDate) {
    try {
      // Ensure dates are Date objects
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);

      // Validate date range
      this.validateDateRange(startDate, endDate);

      // Build aggregation pipeline
      // We need to join transactions with conversations to get endpoint information
      const pipeline = [
        // Match transactions within the date range
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            tokenType: { $in: ['prompt', 'completion'] },
            conversationId: { $exists: true, $ne: null },
          },
        },
        // Lookup conversation to get endpoint
        {
          $lookup: {
            from: 'conversations',
            localField: 'conversationId',
            foreignField: 'conversationId',
            as: 'conversation',
          },
        },
        // Unwind conversation array
        {
          $unwind: {
            path: '$conversation',
            preserveNullAndEmptyArrays: true,
          },
        },
        // Group by endpoint
        {
          $group: {
            _id: '$conversation.endpoint',
            tokens: { $sum: { $abs: '$rawAmount' } },
            cost: { $sum: { $abs: '$tokenValue' } },
          },
        },
        // Sort by tokens descending
        {
          $sort: { tokens: -1 },
        },
        // Project to final structure
        {
          $project: {
            _id: 0,
            endpoint: { $ifNull: ['$_id', 'unknown'] },
            tokens: 1,
            // tokenValue is stored incorrectly (multiplied by 1M), so divide by 1,000,000 to get correct cost
            // Then round to 2 decimal places using $subtract and $mod for DocumentDB compatibility
            cost: {
              $subtract: [
                { $divide: ['$cost', 1000000] },
                { $mod: [{ $divide: ['$cost', 1000000] }, 0.01] }
              ]
            },
          },
        },
      ];

      const results = await Transaction.aggregate(pipeline);

      return results;
    } catch (error) {
      logger.error('[AnalyticsService] Error getting token usage by endpoint:', error);
      throw new Error('Failed to retrieve token usage by endpoint');
    }
  }

  /**
   * Get token usage aggregated by model with costs
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Array<{model: string, tokens: number, cost: number}>>} Token usage by model
   */
  async getTokenUsageByModel(startDate, endDate) {
    try {
      // Ensure dates are Date objects
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);

      // Validate date range
      this.validateDateRange(startDate, endDate);

      // Build aggregation pipeline
      const pipeline = [
        // Match transactions within the date range
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            tokenType: { $in: ['prompt', 'completion'] },
          },
        },
        // Group by model
        {
          $group: {
            _id: '$model',
            tokens: { $sum: { $abs: '$rawAmount' } },
            cost: { $sum: { $abs: '$tokenValue' } },
          },
        },
        // Sort by tokens descending
        {
          $sort: { tokens: -1 },
        },
        // Project to final structure
        {
          $project: {
            _id: 0,
            model: { $ifNull: ['$_id', 'unknown'] },
            tokens: 1,
            // tokenValue is stored incorrectly (multiplied by 1M), so divide by 1,000,000 to get correct cost
            // Then round to 2 decimal places using $subtract and $mod for DocumentDB compatibility
            cost: {
              $subtract: [
                { $divide: ['$cost', 1000000] },
                { $mod: [{ $divide: ['$cost', 1000000] }, 0.01] }
              ]
            },
          },
        },
      ];

      const results = await Transaction.aggregate(pipeline);

      return results;
    } catch (error) {
      logger.error('[AnalyticsService] Error getting token usage by model:', error);
      throw new Error('Failed to retrieve token usage by model');
    }
  }

  /**
   * Get estimated costs with breakdown by endpoint and model
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Object>} Estimated costs object
   * @returns {Promise<{total: number, byEndpoint: Array<{endpoint: string, cost: number}>, byModel: Array<{model: string, cost: number}>}>}
   */
  async getEstimatedCosts(startDate, endDate) {
    try {
      // Ensure dates are Date objects
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);

      // Validate date range
      this.validateDateRange(startDate, endDate);

      // Get total cost
      const totalPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            tokenType: { $in: ['prompt', 'completion'] },
          },
        },
        {
          $group: {
            _id: null,
            totalCost: { $sum: { $abs: '$tokenValue' } },
          },
        },
      ];

      const totalResults = await Transaction.aggregate(totalPipeline);
      // tokenValue is stored incorrectly (multiplied by 1M), so divide by 1,000,000 to get correct cost
      const total = totalResults.length > 0 ? Math.round((totalResults[0].totalCost / 1000000) * 100) / 100 : 0;

      // Get costs by endpoint and model using existing methods
      const byEndpoint = await this.getTokenUsageByEndpoint(startDate, endDate);
      const byModel = await this.getTokenUsageByModel(startDate, endDate);

      // Format the results to only include endpoint/model and cost
      const formattedByEndpoint = byEndpoint.map((item) => ({
        endpoint: item.endpoint,
        cost: item.cost,
      }));

      const formattedByModel = byModel.map((item) => ({
        model: item.model,
        cost: item.cost,
      }));

      return {
        total,
        byEndpoint: formattedByEndpoint,
        byModel: formattedByModel,
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting estimated costs:', error);
      throw new Error('Failed to retrieve estimated costs');
    }
  }

  /**
   * Get balance statistics including total credits and average balance
   * @returns {Promise<Object>} Balance statistics object
   * @returns {Promise<{totalCredits: number, averageBalance: number, usersWithBalance: number}>}
   */
  async getBalanceStats() {
    try {
      // Build aggregation pipeline to calculate balance statistics
      const pipeline = [
        {
          $group: {
            _id: null,
            totalCredits: { $sum: '$tokenCredits' },
            averageBalance: { $avg: '$tokenCredits' },
            usersWithBalance: { $sum: 1 },
          },
        },
      ];

      const results = await Balance.aggregate(pipeline);

      // If no balances exist, return zeros
      if (results.length === 0) {
        return {
          totalCredits: 0,
          averageBalance: 0,
          usersWithBalance: 0,
        };
      }

      const stats = results[0];

      return {
        totalCredits: Math.round(stats.totalCredits * 100) / 100,
        averageBalance: Math.round(stats.averageBalance * 100) / 100,
        usersWithBalance: stats.usersWithBalance,
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting balance stats:', error);
      throw new Error('Failed to retrieve balance statistics');
    }
  }

  /**
   * Get cache statistics including hit rates and savings
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Object>} Cache statistics object
   * @returns {Promise<{writeTokens: number, readTokens: number, hitRate: number, savings: number}>}
   */
  async getCacheStats(startDate, endDate) {
    try {
      // Ensure dates are Date objects
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);

      // Validate date range
      this.validateDateRange(startDate, endDate);

      // Build aggregation pipeline to calculate cache statistics
      // Cache tokens are stored in writeTokens and readTokens fields for structured transactions
      const pipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            tokenType: 'prompt',
          },
        },
        {
          $group: {
            _id: null,
            writeTokens: { $sum: { $ifNull: ['$writeTokens', 0] } },
            readTokens: { $sum: { $ifNull: ['$readTokens', 0] } },
            inputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
            totalPromptTokens: { $sum: { $abs: '$rawAmount' } },
          },
        },
      ];

      const results = await Transaction.aggregate(pipeline);

      // If no transactions, return zeros
      if (results.length === 0) {
        return {
          writeTokens: 0,
          readTokens: 0,
          hitRate: 0,
          savings: 0,
        };
      }

      const stats = results[0];
      const writeTokens = Math.abs(stats.writeTokens || 0);
      const readTokens = Math.abs(stats.readTokens || 0);
      const totalCacheTokens = writeTokens + readTokens;

      // Calculate hit rate: readTokens / (writeTokens + readTokens)
      // Hit rate represents the percentage of cache reads vs total cache operations
      let hitRate = 0;
      if (totalCacheTokens > 0) {
        hitRate = (readTokens / totalCacheTokens) * 100;
      }

      // Calculate savings: readTokens represent tokens that were cached and reused
      // Savings is the cost difference between reading from cache vs computing fresh
      // Typically cache reads are cheaper than writes, so savings = readTokens * (write_cost - read_cost)
      // For simplicity, we'll estimate savings as a percentage of read tokens
      // Assuming cache reads are ~90% cheaper than fresh computation
      const savingsMultiplier = 0.9;
      const savings = readTokens * savingsMultiplier;

      return {
        writeTokens,
        readTokens,
        hitRate: Math.round(hitRate * 100) / 100,
        savings: Math.round(savings),
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting cache stats:', error);
      throw new Error('Failed to retrieve cache statistics');
    }
  }

  /**
   * Get comprehensive message statistics including total count and user vs AI breakdown
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Object>} Message statistics object
   * @returns {Promise<{totalMessages: number, userGeneratedCount: number, aiGeneratedCount: number, errorCount: number, errorRate: number}>}
   */
  async getMessageStats(startDate, endDate) {
    // Ensure dates are Date objects
    startDate = this.ensureDate(startDate);
    endDate = this.ensureDate(endDate);

    // Validate date range
    this.validateDateRange(startDate, endDate);

    try {
      // Build aggregation pipeline to calculate message statistics
      const pipeline = [
        // Match messages within the date range
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        // Group to calculate counts
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            userGeneratedCount: {
              $sum: {
                $cond: [{ $eq: ['$isCreatedByUser', true] }, 1, 0],
              },
            },
            aiGeneratedCount: {
              $sum: {
                $cond: [{ $eq: ['$isCreatedByUser', false] }, 1, 0],
              },
            },
            errorCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$error', null] },
                      { $ne: ['$error', false] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ];

      const results = await Message.aggregate(pipeline);

      // If no messages, return zeros
      if (results.length === 0) {
        return {
          totalMessages: 0,
          userGeneratedCount: 0,
          aiGeneratedCount: 0,
          errorCount: 0,
          errorRate: 0,
        };
      }

      const stats = results[0];
      const totalMessages = stats.totalMessages || 0;
      const userGeneratedCount = stats.userGeneratedCount || 0;
      const aiGeneratedCount = stats.aiGeneratedCount || 0;
      const errorCount = stats.errorCount || 0;

      // Calculate error rate as percentage
      let errorRate = 0;
      if (totalMessages > 0) {
        errorRate = (errorCount / totalMessages) * 100;
      }

      return {
        totalMessages,
        userGeneratedCount,
        aiGeneratedCount,
        errorCount,
        errorRate: Math.round(errorRate * 100) / 100, // Round to 2 decimal places
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting message stats:', error);
      throw new Error('Failed to retrieve message statistics');
    }
  }

  /**
   * Get messages grouped by time period
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @param {string} granularity - The grouping granularity: 'daily', 'weekly', or 'monthly'
   * @returns {Promise<Array<{timestamp: Date, value: number}>>} Time series data of message creation
   */
  async getMessagesByPeriod(startDate, endDate, granularity = 'daily') {
    // Ensure dates are Date objects
    startDate = this.ensureDate(startDate);
    endDate = this.ensureDate(endDate);

    // Validate date range
    this.validateDateRange(startDate, endDate);

    // Validate granularity
    const validGranularities = ['daily', 'weekly', 'monthly'];
    if (!validGranularities.includes(granularity)) {
      throw new Error(`Invalid granularity: ${granularity}. Must be one of: ${validGranularities.join(', ')}`);
    }

    try {
      // Determine the date format string based on granularity
      let dateFormat;
      
      switch (granularity) {
        case 'daily':
          dateFormat = '%Y-%m-%d';
          break;
        case 'weekly':
          // ISO week format: year-week
          dateFormat = '%Y-W%V';
          break;
        case 'monthly':
          dateFormat = '%Y-%m';
          break;
      }

      // Build aggregation pipeline
      const pipeline = [
        // Match messages created within the date range
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        // Group by the specified time period
        {
          $group: {
            _id: {
              $dateToString: {
                format: dateFormat,
                date: '$createdAt',
              },
            },
            count: { $sum: 1 },
            // Keep the first date in the period for timestamp
            firstDate: { $min: '$createdAt' },
          },
        },
        // Sort by date ascending
        {
          $sort: { _id: 1 },
        },
        // Project to the desired output format
        {
          $project: {
            _id: 0,
            timestamp: '$firstDate',
            value: '$count',
          },
        },
      ];

      const results = await Message.aggregate(pipeline);

      return results;
    } catch (error) {
      logger.error('[AnalyticsService] Error getting messages by period:', error);
      throw new Error('Failed to retrieve messages by period');
    }
  }

  /**
   * Get model usage analytics including distribution and trends
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Object>} Model usage analytics object
   */
  async getModelUsageAnalytics(startDate, endDate) {
    try {
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);
      this.validateDateRange(startDate, endDate);

      // Get token usage by model (already exists)
      const tokensByModel = await this.getTokenUsageByModel(startDate, endDate);

      // Get model distribution (percentage of total tokens)
      const totalTokens = tokensByModel.reduce((sum, item) => sum + item.tokens, 0);
      const modelDistribution = tokensByModel.map((item) => ({
        model: item.model,
        tokens: item.tokens,
        cost: item.cost,
        percentage: totalTokens > 0 ? (item.tokens / totalTokens) * 100 : 0,
      }));

      // Get model usage over time
      const modelTrendsPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            tokenType: { $in: ['prompt', 'completion'] },
            model: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: {
              model: '$model',
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                },
              },
            },
            tokens: { $sum: { $abs: '$rawAmount' } },
            cost: { $sum: { $abs: '$tokenValue' } },
          },
        },
        {
          $sort: { '_id.date': 1, '_id.model': 1 },
        },
        {
          $project: {
            _id: 0,
            model: '$_id.model',
            date: '$_id.date',
            tokens: 1,
            // tokenValue is stored incorrectly (multiplied by 1M), so divide by 1,000,000 to get correct cost
            // Then round to 2 decimal places using $subtract and $mod for DocumentDB compatibility
            cost: {
              $subtract: [
                { $divide: ['$cost', 1000000] },
                { $mod: [{ $divide: ['$cost', 1000000] }, 0.01] }
              ]
            },
          },
        },
      ];

      const modelTrends = await Transaction.aggregate(modelTrendsPipeline);

      // Get average tokens per conversation by model
      const avgTokensByModelPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            tokenType: { $in: ['prompt', 'completion'] },
            conversationId: { $exists: true, $ne: null },
            model: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: {
              model: '$model',
              conversationId: '$conversationId',
            },
            tokens: { $sum: { $abs: '$rawAmount' } },
          },
        },
        {
          $group: {
            _id: '$_id.model',
            avgTokensPerConversation: { $avg: '$tokens' },
            conversationCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            model: { $ifNull: ['$_id', 'unknown'] },
            avgTokensPerConversation: {
              $subtract: ['$avgTokensPerConversation', { $mod: ['$avgTokensPerConversation', 1] }],
            },
            conversationCount: 1,
          },
        },
        {
          $sort: { avgTokensPerConversation: -1 },
        },
      ];

      const avgTokensByModel = await Transaction.aggregate(avgTokensByModelPipeline);

      return {
        tokensByModel,
        modelDistribution,
        modelTrends,
        avgTokensByModel,
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting model usage analytics:', error);
      throw new Error('Failed to retrieve model usage analytics');
    }
  }

  /**
   * Get enhanced balance and credits analytics
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Object>} Enhanced balance analytics object
   */
  async getBalanceAnalytics(startDate, endDate) {
    try {
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);
      this.validateDateRange(startDate, endDate);

      // Get basic balance stats
      const balanceStats = await this.getBalanceStats();

      // Get balance distribution (histogram)
      const balanceDistributionPipeline = [
        {
          $project: {
            balance: '$tokenCredits',
            range: {
              $switch: {
                branches: [
                  { case: { $lt: ['$tokenCredits', 10000] }, then: '0-10k' },
                  { case: { $lt: ['$tokenCredits', 50000] }, then: '10k-50k' },
                  { case: { $lt: ['$tokenCredits', 100000] }, then: '50k-100k' },
                  { case: { $lt: ['$tokenCredits', 500000] }, then: '100k-500k' },
                  { case: { $gte: ['$tokenCredits', 500000] }, then: '500k+' },
                ],
                default: 'unknown',
              },
            },
          },
        },
        {
          $group: {
            _id: '$range',
            count: { $sum: 1 },
          },
        },
        {
          $sort: {
            _id: 1,
          },
        },
        {
          $project: {
            _id: 0,
            range: '$_id',
            count: 1,
          },
        },
      ];

      const balanceDistribution = await Balance.aggregate(balanceDistributionPipeline);

      // Get low balance users (below 10% of average)
      const lowBalanceThreshold = balanceStats.averageBalance * 0.1;
      const lowBalanceUsers = await Balance.countDocuments({
        tokenCredits: { $lt: lowBalanceThreshold },
      });

      // Get credit refill activity (transactions with tokenType 'credits' and positive rawAmount)
      const creditRefillPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            tokenType: 'credits',
            rawAmount: { $gt: 0 },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
              },
            },
            totalCredits: { $sum: '$rawAmount' },
            refillCount: { $sum: 1 },
          },
        },
        {
          $sort: { _id: 1 },
        },
        {
          $project: {
            _id: 0,
            date: '$_id',
            totalCredits: 1,
            refillCount: 1,
          },
        },
      ];

      const creditRefillActivity = await Transaction.aggregate(creditRefillPipeline);

      // Get total credits distributed in time range
      const totalCreditsDistributed = creditRefillActivity.reduce(
        (sum, item) => sum + item.totalCredits,
        0,
      );

      return {
        ...balanceStats,
        balanceDistribution,
        lowBalanceUsers,
        creditRefillActivity,
        totalCreditsDistributed,
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting balance analytics:', error);
      throw new Error('Failed to retrieve balance analytics');
    }
  }

  /**
   * Get error and failure analytics
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Object>} Error analytics object
   */
  async getErrorAnalytics(startDate, endDate) {
    try {
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);
      this.validateDateRange(startDate, endDate);

      // Get total messages and error count
      const totalMessages = await Message.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
      });

      // Count messages with actual errors (error field exists, is not null, and is truthy)
      const errorMessagesPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            error: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            count: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$error', null] },
                      { $ne: ['$error', false] },
                      { $ne: [{ $type: '$error' }, 'null'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ];
      const errorMessagesResult = await Message.aggregate(errorMessagesPipeline);
      const errorMessages = errorMessagesResult.length > 0 ? errorMessagesResult[0].count : 0;

      const errorRate = totalMessages > 0 ? errorMessages / totalMessages : 0;

      // Get errors by endpoint (via conversations)
      const errorsByEndpointPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            error: { $exists: true, $ne: null },
          },
        },
        {
          $lookup: {
            from: 'conversations',
            localField: 'conversationId',
            foreignField: '_id',
            as: 'conversation',
          },
        },
        {
          $unwind: {
            path: '$conversation',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: { $ifNull: ['$conversation.endpoint', 'unknown'] },
            errorCount: { $sum: 1 },
          },
        },
        {
          $sort: { errorCount: -1 },
        },
        {
          $project: {
            _id: 0,
            endpoint: '$_id',
            errorCount: 1,
          },
        },
      ];

      const errorsByEndpoint = await Message.aggregate(errorsByEndpointPipeline);

      // Get error trends over time
      const errorTrendsPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            error: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
              },
            },
            errorCount: { $sum: 1 },
          },
        },
        {
          $sort: { _id: 1 },
        },
        {
          $project: {
            _id: 0,
            date: '$_id',
            errorCount: 1,
          },
        },
      ];

      const errorTrends = await Message.aggregate(errorTrendsPipeline);

      // Get success rate by endpoint
      const successRateByEndpointPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $lookup: {
            from: 'conversations',
            localField: 'conversationId',
            foreignField: '_id',
            as: 'conversation',
          },
        },
        {
          $unwind: {
            path: '$conversation',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: { $ifNull: ['$conversation.endpoint', 'unknown'] },
            totalMessages: { $sum: 1 },
            errorMessages: {
              $sum: {
                $cond: [{ $ifNull: ['$error', false] }, 1, 0],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            endpoint: '$_id',
            totalMessages: 1,
            errorMessages: 1,
            successRate: {
              $subtract: [
                100,
                {
                  $multiply: [
                    {
                      $cond: [
                        { $gt: ['$totalMessages', 0] },
                        { $divide: ['$errorMessages', '$totalMessages'] },
                        0,
                      ],
                    },
                    100,
                  ],
                },
              ],
            },
          },
        },
        {
          $sort: { successRate: 1 },
        },
      ];

      const successRateByEndpoint = await Message.aggregate(successRateByEndpointPipeline);

      return {
        totalMessages,
        errorMessages,
        errorRate,
        errorsByEndpoint,
        errorTrends,
        successRateByEndpoint,
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting error analytics:', error);
      throw new Error('Failed to retrieve error analytics');
    }
  }

  /**
   * Get file upload analytics
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Object>} File upload analytics object
   */
  async getFileUploadAnalytics(startDate, endDate) {
    try {
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);
      this.validateDateRange(startDate, endDate);

      // Get total files uploaded
      const totalFiles = await File.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
      });

      // Get files by type
      const filesByTypePipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: {
              $ifNull: ['$type', 'unknown'],
            },
            count: { $sum: 1 },
            totalSize: { $sum: { $ifNull: ['$bytes', 0] } },
          },
        },
        {
          $sort: { count: -1 },
        },
        {
          $project: {
            _id: 0,
            type: '$_id',
            count: 1,
            totalSize: 1,
            totalSizeMB: {
              $divide: [{ $ifNull: ['$totalSize', 0] }, 1048576],
            },
          },
        },
      ];

      const filesByType = await File.aggregate(filesByTypePipeline);

      // Get total storage usage
      const totalStoragePipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            totalBytes: { $sum: { $ifNull: ['$bytes', 0] } },
          },
        },
      ];

      const totalStorageResult = await File.aggregate(totalStoragePipeline);
      const totalStorageBytes = totalStorageResult.length > 0 ? totalStorageResult[0].totalBytes : 0;
      const totalStorageMB = totalStorageBytes / 1048576;
      const totalStorageGB = totalStorageMB / 1024;

      // Get top users by file uploads
      const topUsersByFilesPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            user: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: '$user',
            fileCount: { $sum: 1 },
            totalSize: { $sum: { $ifNull: ['$bytes', 0] } },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'userDetails',
          },
        },
        {
          $unwind: {
            path: '$userDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 0,
            userId: { $toString: '$_id' },
            email: {
              $cond: {
                if: {
                  $and: [
                    { $ne: ['$userDetails', null] },
                    { $ne: ['$userDetails.email', null] },
                    { $ne: ['$userDetails.email', ''] },
                  ],
                },
                then: '$userDetails.email',
                else: 'Unknown',
              },
            },
            fileCount: 1,
            totalSize: 1,
            totalSizeMB: {
              $divide: [{ $ifNull: ['$totalSize', 0] }, 1048576],
            },
          },
        },
        {
          $sort: { fileCount: -1 },
        },
        {
          $limit: 10,
        },
      ];

      const topUsersByFiles = await File.aggregate(topUsersByFilesPipeline);

      // Get upload activity over time
      const uploadActivityPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
              },
            },
            fileCount: { $sum: 1 },
            totalSize: { $sum: { $ifNull: ['$bytes', 0] } },
          },
        },
        {
          $sort: { _id: 1 },
        },
        {
          $project: {
            _id: 0,
            date: '$_id',
            fileCount: 1,
            totalSizeMB: {
              $divide: [{ $ifNull: ['$totalSize', 0] }, 1048576],
            },
          },
        },
      ];

      const uploadActivity = await File.aggregate(uploadActivityPipeline);

      return {
        totalFiles,
        filesByType,
        totalStorageBytes,
        totalStorageMB,
        totalStorageGB,
        topUsersByFiles,
        uploadActivity,
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting file upload analytics:', error);
      throw new Error('Failed to retrieve file upload analytics');
    }
  }

  /**
   * Get user engagement metrics including retention, session length, and churn
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Object>} User engagement analytics object
   */
  async getUserEngagementMetrics(startDate, endDate) {
    try {
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);
      this.validateDateRange(startDate, endDate);

      // Calculate time range in days
      const daysInRange = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      const previousPeriodStart = new Date(startDate.getTime() - (endDate - startDate));

      // Get users active in current period
      const currentActiveUsers = await Conversation.distinct('user', {
        createdAt: { $gte: startDate, $lte: endDate },
      });

      // Get users active in previous period
      const previousActiveUsers = await Conversation.distinct('user', {
        createdAt: { $gte: previousPeriodStart, $lte: startDate },
      });

      // Calculate retention rate (users active in both periods)
      const retainedUsers = currentActiveUsers.filter((userId) =>
        previousActiveUsers.some((prevUserId) => prevUserId.toString() === userId.toString()),
      );
      const retentionRate =
        previousActiveUsers.length > 0 ? (retainedUsers.length / previousActiveUsers.length) * 100 : 0;

      // Calculate average session length (time between first and last conversation in a day)
      const sessionLengthPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            user: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: {
              user: '$user',
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                },
              },
            },
            firstActivity: { $min: '$createdAt' },
            lastActivity: { $max: '$updatedAt' },
          },
        },
        {
          $project: {
            _id: 0,
            sessionLength: {
              $divide: [
                { $subtract: ['$lastActivity', '$firstActivity'] },
                1000 * 60, // Convert to minutes
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgSessionLength: { $avg: '$sessionLength' },
          },
        },
      ];

      const sessionLengthResult = await Conversation.aggregate(sessionLengthPipeline);
      const avgSessionLength =
        sessionLengthResult.length > 0 ? sessionLengthResult[0].avgSessionLength : 0;

      // Calculate time between sessions (days between first and last conversation)
      const timeBetweenSessionsPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            user: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: '$user',
            firstSession: { $min: '$createdAt' },
            lastSession: { $max: '$createdAt' },
            sessionCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            daysBetween: {
              $divide: [
                { $subtract: ['$lastSession', '$firstSession'] },
                1000 * 60 * 60 * 24,
              ],
            },
            sessionCount: 1,
          },
        },
        {
          $match: {
            sessionCount: { $gt: 1 },
          },
        },
        {
          $group: {
            _id: null,
            avgDaysBetween: { $avg: '$daysBetween' },
          },
        },
      ];

      const timeBetweenResult = await Conversation.aggregate(timeBetweenSessionsPipeline);
      const avgDaysBetweenSessions =
        timeBetweenResult.length > 0 ? timeBetweenResult[0].avgDaysBetween : 0;

      // Calculate churn rate (users who haven't been active in last 30 days)
      const thirtyDaysAgo = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      const totalUsers = await User.countDocuments({
        createdAt: { $lte: endDate },
      });
      const activeInLast30Days = await Conversation.distinct('user', {
        createdAt: { $gte: thirtyDaysAgo, $lte: endDate },
      });
      const churnedUsers = totalUsers - activeInLast30Days.length;
      const churnRate = totalUsers > 0 ? (churnedUsers / totalUsers) * 100 : 0;

      // Identify power users (users with above-average activity)
      const userActivityPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            user: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: '$user',
            conversationCount: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: null,
            avgConversations: { $avg: '$conversationCount' },
          },
        },
      ];

      const avgActivityResult = await Conversation.aggregate(userActivityPipeline);
      const avgConversationsPerUser =
        avgActivityResult.length > 0 ? avgActivityResult[0].avgConversations : 0;

      const powerUsersPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            user: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: '$user',
            conversationCount: { $sum: 1 },
          },
        },
        {
          $match: {
            conversationCount: { $gt: avgConversationsPerUser },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'userDetails',
          },
        },
        {
          $unwind: {
            path: '$userDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 0,
            userId: { $toString: '$_id' },
            email: {
              $cond: {
                if: {
                  $and: [
                    { $ne: ['$userDetails', null] },
                    { $ne: ['$userDetails.email', null] },
                    { $ne: ['$userDetails.email', ''] },
                  ],
                },
                then: '$userDetails.email',
                else: 'Unknown',
              },
            },
            conversationCount: 1,
          },
        },
        {
          $sort: { conversationCount: -1 },
        },
        {
          $limit: 10,
        },
      ];

      const powerUsers = await Conversation.aggregate(powerUsersPipeline);

      return {
        retentionRate: Math.round(retentionRate * 100) / 100,
        avgSessionLength: Math.round(avgSessionLength * 100) / 100, // in minutes
        avgDaysBetweenSessions: Math.round(avgDaysBetweenSessions * 100) / 100,
        churnRate: Math.round(churnRate * 100) / 100,
        churnedUsers,
        totalUsers,
        activeUsers: activeInLast30Days.length,
        powerUsers,
        avgConversationsPerUser: Math.round(avgConversationsPerUser * 100) / 100,
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting user engagement metrics:', error);
      throw new Error('Failed to retrieve user engagement metrics');
    }
  }

  /**
   * Get endpoint performance metrics
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Object>} Endpoint performance analytics object
   */
  async getEndpointPerformanceMetrics(startDate, endDate) {
    try {
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);
      this.validateDateRange(startDate, endDate);

      // Get conversations by endpoint with timing data
      const endpointStatsPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            endpoint: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: '$endpoint',
            conversationCount: { $sum: 1 },
            totalDuration: {
              $sum: {
                $subtract: ['$updatedAt', '$createdAt'],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            endpoint: '$_id',
            conversationCount: 1,
            avgResponseTime: {
              $divide: [
                {
                  $divide: ['$totalDuration', '$conversationCount'],
                },
                1000, // Convert to seconds
              ],
            },
          },
        },
        {
          $sort: { conversationCount: -1 },
        },
      ];

      const endpointStats = await Conversation.aggregate(endpointStatsPipeline);

      // Get error rate by endpoint (from error analytics)
      const errorsByEndpointPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            error: { $exists: true, $ne: null },
          },
        },
        {
          $lookup: {
            from: 'conversations',
            localField: 'conversationId',
            foreignField: '_id',
            as: 'conversation',
          },
        },
        {
          $unwind: {
            path: '$conversation',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: { $ifNull: ['$conversation.endpoint', 'unknown'] },
            errorCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            endpoint: '$_id',
            errorCount: 1,
          },
        },
      ];

      const errorsByEndpoint = await Message.aggregate(errorsByEndpointPipeline);

      // Merge error counts with endpoint stats
      const endpointPerformance = endpointStats.map((stat) => {
        const errorData = errorsByEndpoint.find((e) => e.endpoint === stat.endpoint);
        const errorCount = errorData ? errorData.errorCount : 0;
        const errorRate = stat.conversationCount > 0 ? (errorCount / stat.conversationCount) * 100 : 0;
        const successRate = 100 - errorRate;

        return {
          ...stat,
          errorCount,
          errorRate: Math.round(errorRate * 100) / 100,
          successRate: Math.round(successRate * 100) / 100,
        };
      });

      // Get endpoint popularity trends
      const endpointTrendsPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            endpoint: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: {
              endpoint: '$endpoint',
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                },
              },
            },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { '_id.date': 1, '_id.endpoint': 1 },
        },
        {
          $project: {
            _id: 0,
            endpoint: '$_id.endpoint',
            date: '$_id.date',
            count: 1,
          },
        },
      ];

      const endpointTrends = await Conversation.aggregate(endpointTrendsPipeline);

      return {
        endpointPerformance,
        endpointTrends,
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting endpoint performance metrics:', error);
      throw new Error('Failed to retrieve endpoint performance metrics');
    }
  }

  /**
   * Get conversation quality metrics
   * @param {Date} startDate - The start date for the time range
   * @param {Date} endDate - The end date for the time range
   * @returns {Promise<Object>} Conversation quality analytics object
   */
  async getConversationQualityMetrics(startDate, endDate) {
    try {
      startDate = this.ensureDate(startDate);
      endDate = this.ensureDate(endDate);
      this.validateDateRange(startDate, endDate);

      // Get total conversations
      const totalConversations = await Conversation.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
      });

      // Calculate average conversation duration
      const avgDurationPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $project: {
            duration: {
              $divide: [
                { $subtract: ['$updatedAt', '$createdAt'] },
                1000 * 60, // Convert to minutes
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgDuration: { $avg: '$duration' },
          },
        },
      ];

      const avgDurationResult = await Conversation.aggregate(avgDurationPipeline);
      const avgDuration =
        avgDurationResult.length > 0 ? avgDurationResult[0].avgDuration : 0;

      // Calculate completion rate (conversations with more than 2 messages)
      const completionPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $lookup: {
            from: 'messages',
            localField: '_id',
            foreignField: 'conversationId',
            as: 'messages',
          },
        },
        {
          $project: {
            messageCount: { $size: '$messages' },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: {
              $sum: {
                $cond: [{ $gt: ['$messageCount', 2] }, 1, 0],
              },
            },
          },
        },
      ];

      const completionResult = await Conversation.aggregate(completionPipeline);
      const completedConversations =
        completionResult.length > 0 ? completionResult[0].completed : 0;
      const completionRate =
        totalConversations > 0 ? (completedConversations / totalConversations) * 100 : 0;

      // Calculate abandoned conversations (started but only 1-2 messages)
      const abandonedConversations = totalConversations - completedConversations;
      const abandonmentRate =
        totalConversations > 0 ? (abandonedConversations / totalConversations) * 100 : 0;

      // Get multi-turn conversations (conversations with many back-and-forths)
      const multiTurnPipeline = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $lookup: {
            from: 'messages',
            localField: '_id',
            foreignField: 'conversationId',
            as: 'messages',
          },
        },
        {
          $project: {
            messageCount: { $size: '$messages' },
          },
        },
        {
          $group: {
            _id: {
              $cond: {
                if: { $gte: ['$messageCount', 20] },
                then: 'very-long',
                else: {
                  $cond: {
                    if: { $gte: ['$messageCount', 10] },
                    then: 'long',
                    else: {
                      $cond: {
                        if: { $gte: ['$messageCount', 5] },
                        then: 'medium',
                        else: 'short',
                      },
                    },
                  },
                },
              },
            },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            category: '$_id',
            count: 1,
          },
        },
      ];

      const multiTurnBreakdown = await Conversation.aggregate(multiTurnPipeline);

      // Calculate average messages per conversation
      const avgMessagesPerConversation = await this.getAverageMessagesPerConversation(startDate, endDate);

      return {
        totalConversations,
        avgDuration: Math.round(avgDuration * 100) / 100, // in minutes
        completionRate: Math.round(completionRate * 100) / 100,
        completedConversations,
        abandonmentRate: Math.round(abandonmentRate * 100) / 100,
        abandonedConversations,
        multiTurnBreakdown,
        avgMessagesPerConversation: Math.round(avgMessagesPerConversation * 100) / 100,
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting conversation quality metrics:', error);
      throw new Error('Failed to retrieve conversation quality metrics');
    }
  }

  /**
   * Get live/real-time data including active sessions, active conversations, and current activity
   * @returns {Promise<Object>} Live data object
   */
  async getLiveData() {
    try {
      const now = new Date();
      
      // Active window: last 15 minutes for sessions and conversations
      const activeWindowStart = new Date(now.getTime() - 15 * 60 * 1000);
      
      // Message rate window: last 1 minute
      const messageRateWindowStart = new Date(now.getTime() - 60 * 1000);
      
      // Token usage window: last 1 minute
      const tokenRateWindowStart = new Date(now.getTime() - 60 * 1000);

      // Get active sessions (users who have updated conversations or created messages in last 15 minutes)
      const activeSessionsPipeline = [
        {
          $match: {
            updatedAt: { $gte: activeWindowStart, $lte: now },
            user: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: '$user',
            lastActivity: { $max: '$updatedAt' },
            conversationCount: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'userDetails',
          },
        },
        {
          $unwind: {
            path: '$userDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 0,
            userId: { $toString: '$_id' },
            email: {
              $cond: {
                if: {
                  $and: [
                    { $ne: ['$userDetails', null] },
                    { $ne: ['$userDetails.email', null] },
                    { $ne: ['$userDetails.email', ''] },
                  ],
                },
                then: '$userDetails.email',
                else: 'Unknown',
              },
            },
            lastActivity: 1,
            conversationCount: 1,
          },
        },
        {
          $sort: { lastActivity: -1 },
        },
        {
          $limit: 20,
        },
      ];

      const activeSessionsRaw = await Conversation.aggregate(activeSessionsPipeline);
      
      // Post-process: Enrich active sessions with user details via direct lookups
      // This avoids DocumentDB limitations with $lookup stages
      const activeSessions = await Promise.all(
        activeSessionsRaw.map(async (session) => {
          // If email is "Unknown", try direct lookup
          if (session.email === 'Unknown' || !session.email) {
            try {
              const userId = session.userId || session._id?.toString();
              if (userId) {
                const directUser = await User.findById(userId).lean();
                if (directUser && directUser.email) {
                  session.email = directUser.email;
                }
              }
            } catch (error) {
              logger.warn(`[AnalyticsService] Failed to enrich active session ${session.userId}:`, error);
            }
          }
          return session;
        }),
      );
      
      const activeSessionCount = activeSessions.length;

      // Get active conversations (conversations updated in last 15 minutes)
      const activeConversations = await Conversation.countDocuments({
        updatedAt: { $gte: activeWindowStart, $lte: now },
      });

      // Get current message rate (messages in last minute)
      const messagesLastMinute = await Message.countDocuments({
        createdAt: { $gte: messageRateWindowStart, $lte: now },
      });
      const messageRate = messagesLastMinute; // messages per minute

      // Get current token usage rate (tokens consumed in last minute)
      const tokenRatePipeline = [
        {
          $match: {
            createdAt: { $gte: tokenRateWindowStart, $lte: now },
            tokenType: { $in: ['prompt', 'completion'] },
          },
        },
        {
          $group: {
            _id: null,
            totalTokens: { $sum: { $abs: '$rawAmount' } },
          },
        },
      ];

      const tokenRateResult = await Transaction.aggregate(tokenRatePipeline);
      const tokenRate = tokenRateResult.length > 0 ? tokenRateResult[0].totalTokens : 0;

      // Get active endpoints (endpoints used in last 15 minutes)
      const activeEndpointsPipeline = [
        {
          $match: {
            updatedAt: { $gte: activeWindowStart, $lte: now },
            endpoint: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: '$endpoint',
            count: { $sum: 1 },
          },
        },
        {
          $sort: { count: -1 },
        },
        {
          $project: {
            _id: 0,
            endpoint: '$_id',
            count: 1,
          },
        },
        {
          $limit: 10,
        },
      ];

      const activeEndpoints = await Conversation.aggregate(activeEndpointsPipeline);

      // Get recent messages (last 10 messages)
      const recentMessages = await Message.find({
        createdAt: { $gte: activeWindowStart, $lte: now },
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('createdAt isCreatedByUser error conversationId')
        .lean();

      // Get recent errors (actual errors in last 15 minutes)
      // Use aggregation to properly detect actual errors (not null, not false, not empty objects)
      const recentErrorsPipeline = [
        {
          $match: {
            createdAt: { $gte: activeWindowStart, $lte: now },
            error: { $exists: true, $ne: null },
          },
        },
        {
          $match: {
            $expr: {
              $and: [
                { $ne: ['$error', null] },
                { $ne: ['$error', false] },
                { $ne: [{ $type: '$error' }, 'bool'] }, // Exclude boolean false
              ],
            },
          },
        },
        {
          $count: 'errorCount',
        },
      ];

      const recentErrorsResult = await Message.aggregate(recentErrorsPipeline);
      const recentErrors = recentErrorsResult.length > 0 ? recentErrorsResult[0].errorCount : 0;

      return {
        timestamp: now,
        activeSessions: {
          count: activeSessionCount,
          users: activeSessions,
        },
        activeConversations,
        messageRate, // messages per minute
        tokenRate, // tokens per minute
        activeEndpoints,
        recentMessages: recentMessages.map((msg) => ({
          timestamp: msg.createdAt,
          isUserMessage: msg.isCreatedByUser,
          hasError: !!msg.error,
          conversationId: msg.conversationId?.toString(),
        })),
        recentErrors,
      };
    } catch (error) {
      logger.error('[AnalyticsService] Error getting live data:', error);
      throw new Error('Failed to retrieve live data');
    }
  }
}

module.exports = new AnalyticsService();
