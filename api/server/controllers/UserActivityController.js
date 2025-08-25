const { logger } = require('~/config');
const { UserActivityLog, User, Message } = require('~/db/models');
const mongoose = require('mongoose');

/**
 * Get user activity logs with token usage data
 * Supports filtering, pagination, and includes token usage for model changes
 */
const getUserActivityLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      userId,
      action,
      startDate,
      endDate,
      includeTokenUsage = true
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10), 1), 100);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const filter = {};
    if (userId) {
      filter.user = mongoose.Types.ObjectId(userId);
    }
    if (action) {
      filter.action = action;
    }
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    // Aggregation pipeline for enriched data
    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userInfo',
          pipeline: [
            {
              $project: {
                name: 1,
                email: 1,
                username: 1,
                avatar: 1,
                role: 1
              }
            }
          ]
        }
      },
      { $unwind: '$userInfo' },
      {
        $addFields: {
          tokenUsage: {
            $cond: {
              if: { $eq: ['$action', 'MODEL CHANGED'] },
              then: '$details',
              else: null
            }
          }
        }
      },
      { $sort: { timestamp: -1 } },
      { $skip: skip },
      { $limit: limitNum }
    ];

    const [logs, totalCount] = await Promise.all([
      UserActivityLog.aggregate(pipeline),
      UserActivityLog.countDocuments(filter)
    ]);

    // Enrich with token usage data for model changes
    if (includeTokenUsage === 'true') {
      for (const log of logs) {
        if (log.action === 'MODEL CHANGED' && log.details?.conversationId) {
          const tokenStats = await getTokenUsageForModelChange(
            log.user,
            log.details.conversationId,
            log.details.fromModel,
            log.details.toModel,
            log.timestamp
          );
          log.tokenUsage = { ...log.details, ...tokenStats };
        }
      }
    }

    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalCount,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1
        }
      }
    });

  } catch (error) {
    logger.error('[getUserActivityLogs] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user activity logs'
    });
  }
};

/**
 * Get token usage statistics for a specific model change
 */
const getTokenUsageForModelChange = async (userId, conversationId, fromModel, toModel, changeTimestamp) => {
  try {
    // Get all messages in the conversation to calculate token usage
    // Since messages might have model: null, we'll use timestamp-based approach
    const allMessages = await Message.find({
      user: userId,
      conversationId
    }).select('tokenCount summaryTokenCount model createdAt').sort({ createdAt: 1 }).lean();

    if (allMessages.length === 0) {
      return {
        beforeModelChange: {
          model: fromModel,
          totalTokens: 0,
          messageCount: 0
        },
        afterModelChange: {
          model: toModel,
          totalTokens: 0,
          messageCount: 0
        },
        tokenDifference: 0
      };
    }

    // Split messages by the model change timestamp
    const beforeMessages = allMessages.filter(msg => new Date(msg.createdAt) < new Date(changeTimestamp));
    const afterMessages = allMessages.filter(msg => new Date(msg.createdAt) >= new Date(changeTimestamp));

    const beforeTokens = beforeMessages.reduce((sum, msg) => 
      sum + (msg.tokenCount || 0) + (msg.summaryTokenCount || 0), 0
    );

    const afterTokens = afterMessages.reduce((sum, msg) => 
      sum + (msg.tokenCount || 0) + (msg.summaryTokenCount || 0), 0
    );

    return {
      beforeModelChange: {
        model: fromModel,
        totalTokens: beforeTokens,
        messageCount: beforeMessages.length
      },
      afterModelChange: {
        model: toModel,
        totalTokens: afterTokens,
        messageCount: afterMessages.length
      },
      tokenDifference: afterTokens - beforeTokens
    };

  } catch (error) {
    logger.error('[getTokenUsageForModelChange] Error:', error);
    return {
      beforeModelChange: {
        model: fromModel,
        totalTokens: 0,
        messageCount: 0
      },
      afterModelChange: {
        model: toModel,
        totalTokens: 0,
        messageCount: 0
      },
      tokenDifference: 0
    };
  }
};

/**
 * Get real-time activity statistics
 */
const getActivityStats = async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;
    
    let startDate;
    switch (timeframe) {
      case '1h':
        startDate = new Date(Date.now() - 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    const stats = await UserActivityLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          latestActivity: { $max: '$timestamp' }
        }
      },
      {
        $project: {
          action: '$_id',
          count: 1,
          latestActivity: 1,
          _id: 0
        }
      }
    ]);

    // Get active users count
    const activeUsers = await UserActivityLog.distinct('user', {
      timestamp: { $gte: startDate }
    });

    // Get model change statistics with token usage
    const modelChangeStats = await UserActivityLog.aggregate([
      {
        $match: {
          action: 'MODEL CHANGED',
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            fromModel: '$details.fromModel',
            toModel: '$details.toModel'
          },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          fromModel: '$_id.fromModel',
          toModel: '$_id.toModel',
          count: 1,
          _id: 0
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        timeframe,
        activeUsers: activeUsers.length,
        activityBreakdown: stats,
        modelChangeStats,
        lastUpdated: new Date()
      }
    });

  } catch (error) {
    logger.error('[getActivityStats] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity statistics'
    });
  }
};

/**
 * Get user-specific activity summary
 */
const getUserActivitySummary = async (req, res) => {
  try {
    const { userId } = req.params;
    const { timeframe = '7d' } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }

    let startDate;
    switch (timeframe) {
      case '24h':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    const userObjectId = mongoose.Types.ObjectId(userId);

    // Get user info
    const user = await User.findById(userObjectId)
      .select('name email username avatar role')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get activity summary
    const activitySummary = await UserActivityLog.aggregate([
      {
        $match: {
          user: userObjectId,
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          lastActivity: { $max: '$timestamp' }
        }
      }
    ]);

    // Get token usage for this user
    const tokenUsage = await Message.aggregate([
      {
        $match: {
          user: userId,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$model',
          totalTokens: {
            $sum: {
              $add: [
                { $ifNull: ['$tokenCount', 0] },
                { $ifNull: ['$summaryTokenCount', 0] }
              ]
            }
          },
          messageCount: { $sum: 1 }
        }
      },
      { $sort: { totalTokens: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        user,
        timeframe,
        activitySummary,
        tokenUsage,
        totalTokens: tokenUsage.reduce((sum, model) => sum + model.totalTokens, 0)
      }
    });

  } catch (error) {
    logger.error('[getUserActivitySummary] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user activity summary'
    });
  }
};

module.exports = {
  getUserActivityLogs,
  getActivityStats,
  getUserActivitySummary,
  getTokenUsageForModelChange
};
