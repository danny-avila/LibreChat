const { logger } = require('@librechat/data-schemas');
const { Transaction, Balance, User } = require('~/db/models');
const { SystemRoles } = require('librechat-data-provider');

/**
 * Get user leaderboard with token usage statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getUserLeaderboard = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      sortBy = 'totalTokens',
      sortOrder = 'desc',
      dateFrom,
      dateTo,
      groupId,
      minUsage,
      maxUsage,
      includeInactive = false
    } = req.query;

    // Validate admin access
    if (req.user?.role !== SystemRoles.ADMIN) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Admin role required to access user statistics'
        }
      });
    }

    // Parse pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Build date filter
    const dateFilter = {};
    if (dateFrom || dateTo) {
      dateFilter.createdAt = {};
      if (dateFrom) dateFilter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) dateFilter.createdAt.$lte = new Date(dateTo);
    }

    // Build usage filter
    const usageFilter = {};
    if (minUsage) usageFilter.$gte = parseInt(minUsage);
    if (maxUsage) usageFilter.$lte = parseInt(maxUsage);

    // Build sort object
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortObj = {};
    
    switch (sortBy) {
      case 'balance':
        sortObj['balance.tokenCredits'] = sortDirection;
        break;
      case 'lastActivity':
        sortObj.lastActivity = sortDirection;
        break;
      case 'joinDate':
        sortObj['user.createdAt'] = sortDirection;
        break;
      case 'totalCost':
        sortObj.totalCost = sortDirection;
        break;
      default:
        sortObj.totalTokens = sortDirection;
    }

    // Main aggregation pipeline
    const pipeline = [
      // Match transactions within date range
      ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
      
      // Group by user to calculate token usage
      {
        $group: {
          _id: '$user',
          totalTokens: { $sum: { $abs: '$rawAmount' } },
          promptTokens: { 
            $sum: { 
              $cond: [
                { $eq: ['$tokenType', 'prompt'] }, 
                { $abs: '$rawAmount' }, 
                0
              ]
            }
          },
          completionTokens: { 
            $sum: { 
              $cond: [
                { $eq: ['$tokenType', 'completion'] }, 
                { $abs: '$rawAmount' }, 
                0
              ]
            }
          },
          totalCost: { 
            $sum: { 
              $multiply: [
                { $abs: '$rawAmount' },
                0.000005  // $5 per 1M tokens = $0.000005 per token
              ]
            }
          },
          lastActivity: { $max: '$createdAt' },
          conversationIds: { $addToSet: '$conversationId' }
        }
      },
      
      // Apply usage filters
      ...(Object.keys(usageFilter).length > 0 ? [
        { $match: { totalTokens: usageFilter } }
      ] : []),
      
      // Lookup user information
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      
      // Lookup balance information
      {
        $lookup: {
          from: 'balances',
          localField: '_id', 
          foreignField: 'user',
          as: 'balance'
        }
      },
      
      // Unwind and shape the data
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$balance', preserveNullAndEmptyArrays: true } },
      
      // Filter inactive users if needed
      ...(includeInactive === 'false' || includeInactive === false ? [
        {
          $match: {
            lastActivity: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Active in last 30 days
          }
        }
      ] : []),
      
      // Project final shape
      {
        $project: {
          userId: '$_id',
          email: '$user.email',
          username: '$user.username',
          totalTokens: 1,
          promptTokens: 1,
          completionTokens: 1,
          currentBalance: { $ifNull: ['$balance.tokenCredits', 0] },
          totalCost: { $round: ['$totalCost', 4] },
          lastActivity: 1,
          joinDate: '$user.createdAt',
          conversationCount: { $size: '$conversationIds' },
          // Calculate averages
          averageDaily: {
            $round: [
              {
                $divide: [
                  '$totalTokens',
                  {
                    $max: [
                      1,
                      {
                        $divide: [
                          { $subtract: ['$$NOW', '$user.createdAt'] },
                          24 * 60 * 60 * 1000 // milliseconds in a day
                        ]
                      }
                    ]
                  }
                ]
              },
              0
            ]
          }
        }
      },
      
      // Sort results
      { $sort: sortObj },
      
      // Add pagination
      { $skip: skip },
      { $limit: limitNum }
    ];

    // Execute aggregation
    const users = await Transaction.aggregate(pipeline);
    
    // Add ranking
    const usersWithRank = users.map((user, index) => ({
      ...user,
      rank: skip + index + 1
    }));

    // Get total count for pagination
    const countPipeline = [
      ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
      {
        $group: {
          _id: '$user',
          totalTokens: { $sum: { $abs: '$rawAmount' } },
          lastActivity: { $max: '$createdAt' }
        }
      },
      ...(Object.keys(usageFilter).length > 0 ? [
        { $match: { totalTokens: usageFilter } }
      ] : []),
      ...(includeInactive === 'false' || includeInactive === false ? [
        {
          $match: {
            lastActivity: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          }
        }
      ] : []),
      { $count: 'total' }
    ];

    const countResult = await Transaction.aggregate(countPipeline);
    const totalUsers = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalUsers / limitNum);

    // Calculate summary statistics
    const summaryPipeline = [
      ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
      {
        $group: {
          _id: null,
          totalTokensUsed: { $sum: { $abs: '$rawAmount' } },
          totalCost: { 
            $sum: { 
              $multiply: [
                { $abs: '$rawAmount' },
                0.000005  // $5 per 1M tokens = $0.000005 per token
              ]
            }
          },
          uniqueUsers: { $addToSet: '$user' }
        }
      }
    ];

    const summaryResult = await Transaction.aggregate(summaryPipeline);
    const summary = summaryResult.length > 0 ? {
      totalTokensUsed: summaryResult[0].totalTokensUsed,
      totalCost: Math.round(summaryResult[0].totalCost * 10000) / 10000,
      averagePerUser: totalUsers > 0 ? Math.round(summaryResult[0].totalTokensUsed / totalUsers) : 0,
      mostActiveUser: usersWithRank.length > 0 ? usersWithRank[0].email : null,
      dateRange: {
        from: dateFrom || null,
        to: dateTo || null
      }
    } : {
      totalTokensUsed: 0,
      totalCost: 0,
      averagePerUser: 0,
      mostActiveUser: null,
      dateRange: { from: dateFrom || null, to: dateTo || null }
    };

    logger.info(`[UserStatistics] Generated leaderboard for ${totalUsers} users`);

    res.json({
      success: true,
      data: {
        users: usersWithRank,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalUsers,
          usersPerPage: limitNum
        },
        summary
      }
    });

  } catch (error) {
    logger.error('[UserStatistics] Error generating leaderboard:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate user leaderboard',
        details: error.message
      }
    });
  }
};

/**
 * Get individual user statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getUserStatistics = async (req, res) => {
  try {
    const { userId } = req.params;
    const { dateFrom, dateTo, includeHistory = false } = req.query;

    // Validate admin access
    if (req.user?.role !== SystemRoles.ADMIN) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Admin role required to access user statistics'
        }
      });
    }

    // Get user info
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    // Get user balance
    const balance = await Balance.findOne({ user: userId }).lean();

    // Build date filter
    const dateFilter = { user: userId };
    if (dateFrom || dateTo) {
      dateFilter.createdAt = {};
      if (dateFrom) dateFilter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) dateFilter.createdAt.$lte = new Date(dateTo);
    }

    // Get overall usage statistics
    const usageStats = await Transaction.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          promptTokens: { 
            $sum: { 
              $cond: [
                { $eq: ['$tokenType', 'prompt'] }, 
                { $abs: '$rawAmount' }, 
                0
              ]
            }
          },
          completionTokens: { 
            $sum: { 
              $cond: [
                { $eq: ['$tokenType', 'completion'] }, 
                { $abs: '$rawAmount' }, 
                0
              ]
            }
          },
          totalCost: { 
            $sum: { 
              $multiply: [
                { $abs: '$rawAmount' },
                0.000005  // $5 per 1M tokens = $0.000005 per token
              ]
            }
          },
          conversationIds: { $addToSet: '$conversationId' }
        }
      },
      {
        $project: {
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: { $add: ['$promptTokens', '$completionTokens'] },
          totalCost: { $round: ['$totalCost', 4] },
          conversationCount: { $size: '$conversationIds' }
        }
      }
    ]);

    const totalUsage = usageStats.length > 0 ? usageStats[0] : {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      conversationCount: 0
    };

    // Get period usage (today, this week, this month)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const periodUsage = await Promise.all([
      // Today
      Transaction.aggregate([
        { $match: { user: userId, createdAt: { $gte: today } } },
        {
          $group: {
            _id: null,
            tokens: { $sum: { $abs: '$rawAmount' } },
            cost: { $sum: { $abs: '$tokenValue' } }
          }
        }
      ]),
      // This week
      Transaction.aggregate([
        { $match: { user: userId, createdAt: { $gte: thisWeek } } },
        {
          $group: {
            _id: null,
            tokens: { $sum: { $abs: '$rawAmount' } },
            cost: { $sum: { $abs: '$tokenValue' } }
          }
        }
      ]),
      // This month
      Transaction.aggregate([
        { $match: { user: userId, createdAt: { $gte: thisMonth } } },
        {
          $group: {
            _id: null,
            tokens: { $sum: { $abs: '$rawAmount' } },
            cost: { $sum: { $abs: '$tokenValue' } }
          }
        }
      ])
    ]);

    const periods = {
      today: periodUsage[0].length > 0 ? {
        tokens: periodUsage[0][0].tokens,
        cost: Math.round(periodUsage[0][0].cost * 100) / 100
      } : { tokens: 0, cost: 0 },
      thisWeek: periodUsage[1].length > 0 ? {
        tokens: periodUsage[1][0].tokens,
        cost: Math.round(periodUsage[1][0].cost * 100) / 100
      } : { tokens: 0, cost: 0 },
      thisMonth: periodUsage[2].length > 0 ? {
        tokens: periodUsage[2][0].tokens,
        cost: Math.round(periodUsage[2][0].cost * 100) / 100
      } : { tokens: 0, cost: 0 }
    };

    // Get top models
    const topModels = await Transaction.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$model',
          usage: { $sum: { $abs: '$rawAmount' } },
          cost: { $sum: { $abs: '$tokenValue' } }
        }
      },
      { $sort: { usage: -1 } },
      { $limit: 5 },
      {
        $project: {
          model: '$_id',
          usage: 1,
          cost: { $round: ['$cost', 2] },
          percentage: {
            $round: [
              {
                $multiply: [
                  { $divide: ['$usage', totalUsage.totalTokens || 1] },
                  100
                ]
              },
              1
            ]
          }
        }
      }
    ]);

    // Calculate averages
    const daysSinceJoin = Math.max(1, Math.floor((now - user.createdAt) / (24 * 60 * 60 * 1000)));
    const averages = {
      tokensPerDay: Math.round(totalUsage.totalTokens / daysSinceJoin),
      tokensPerConversation: totalUsage.conversationCount > 0 ? 
        Math.round(totalUsage.totalTokens / totalUsage.conversationCount) : 0,
      conversationsPerDay: Math.round((totalUsage.conversationCount / daysSinceJoin) * 10) / 10
    };

    // Get usage history if requested
    let usageHistory = [];
    if (includeHistory === 'true' || includeHistory === true) {
      const historyPipeline = [
        { $match: dateFilter },
        {
          $group: {
            _id: {
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt'
                }
              }
            },
            promptTokens: { 
              $sum: { 
                $cond: [
                  { $eq: ['$tokenType', 'prompt'] }, 
                  { $abs: '$rawAmount' }, 
                  0
                ]
              }
            },
            completionTokens: { 
              $sum: { 
                $cond: [
                  { $eq: ['$tokenType', 'completion'] }, 
                  { $abs: '$rawAmount' }, 
                  0
                ]
              }
            },
            cost: { $sum: { $abs: '$tokenValue' } },
            conversations: { $addToSet: '$conversationId' }
          }
        },
        {
          $project: {
            date: '$_id.date',
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: { $add: ['$promptTokens', '$completionTokens'] },
            cost: { $round: ['$cost', 2] },
            conversations: { $size: '$conversations' }
          }
        },
        { $sort: { date: -1 } },
        { $limit: 30 }
      ];

      usageHistory = await Transaction.aggregate(historyPipeline);
    }

    const userData = {
      userId: user._id,
      email: user.email,
      username: user.username,
      joinDate: user.createdAt,
      currentBalance: balance?.tokenCredits || 0,
      totalUsage,
      periodUsage: periods,
      topModels,
      averages,
      ...(usageHistory.length > 0 && { usageHistory })
    };

    logger.info(`[UserStatistics] Generated statistics for user ${userId}`);

    res.json({
      success: true,
      data: userData
    });

  } catch (error) {
    logger.error('[UserStatistics] Error generating user statistics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate user statistics',
        details: error.message
      }
    });
  }
};

module.exports = {
  getUserLeaderboard,
  getUserStatistics
};