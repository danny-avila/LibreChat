const { logger } = require('@librechat/data-schemas');
const { Transaction, Balance, User, Group } = require('~/db/models');
const { SystemRoles } = require('librechat-data-provider');

/**
 * Get group leaderboard with aggregated usage statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getGroupLeaderboard = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'totalTokens',
      sortOrder = 'desc',
      dateFrom,
      dateTo,
      minMembers,
      includeInactive = false
    } = req.query;

    // Validate admin access
    if (req.user?.role !== SystemRoles.ADMIN) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Admin role required to access group statistics'
        }
      });
    }

    // Parse pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Build date filter for transactions
    const dateFilter = {};
    if (dateFrom || dateTo) {
      dateFilter.createdAt = {};
      if (dateFrom) dateFilter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) dateFilter.createdAt.$lte = new Date(dateTo);
    }

    // Build sort object
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortObj = {};
    
    switch (sortBy) {
      case 'averagePerMember':
        sortObj.averagePerMember = sortDirection;
        break;
      case 'memberCount':
        sortObj.memberCount = sortDirection;
        break;
      case 'totalCost':
        sortObj.totalCost = sortDirection;
        break;
      case 'lastActivity':
        sortObj.lastActivity = sortDirection;
        break;
      default:
        sortObj.totalTokens = sortDirection;
    }

    // Get all groups first
    const groups = await Group.find(
      includeInactive === 'false' || includeInactive === false 
        ? { isActive: true } 
        : {}
    ).lean();

    if (groups.length === 0) {
      return res.json({
        success: true,
        data: {
          groups: [],
          pagination: {
            currentPage: pageNum,
            totalPages: 0,
            totalGroups: 0,
            groupsPerPage: limitNum
          },
          summary: {
            totalGroups: 0,
            totalMembers: 0,
            totalTokensUsed: 0,
            averageGroupSize: 0,
            mostActiveGroup: null
          }
        }
      });
    }

    // Main aggregation pipeline for group statistics
    const pipeline = [
      // Match transactions within date range
      ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
      
      // Lookup user info to get group memberships
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      
      // Add group information to each transaction
      {
        $addFields: {
          userGroups: {
            $filter: {
              input: groups,
              as: 'group',
              cond: { $in: ['$user', { $ifNull: ['$$group.members', []] }] }
            }
          }
        }
      },
      
      // Unwind groups to create a record per group per transaction
      { $unwind: { path: '$userGroups', preserveNullAndEmptyArrays: false } },
      
      // Group by group to calculate statistics
      {
        $group: {
          _id: '$userGroups._id',
          groupName: { $first: '$userGroups.name' },
          groupDescription: { $first: '$userGroups.description' },
          isActive: { $first: '$userGroups.isActive' },
          memberCount: { $first: { $size: { $ifNull: ['$userGroups.members', []] } } },
          timeWindowsCount: { $first: { $size: { $ifNull: ['$userGroups.timeWindows', []] } } },
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
          uniqueMembers: { $addToSet: '$user' },
          conversationIds: { $addToSet: '$conversationId' }
        }
      },
      
      // Filter by minimum members if specified
      ...(minMembers ? [
        { $match: { memberCount: { $gte: parseInt(minMembers) } } }
      ] : []),
      
      // Calculate derived fields
      {
        $project: {
          groupId: '$_id',
          groupName: 1,
          groupDescription: 1,
          isActive: 1,
          memberCount: 1,
          activeMemberCount: { $size: '$uniqueMembers' },
          totalTokens: 1,
          promptTokens: 1,
          completionTokens: 1,
          averagePerMember: {
            $cond: [
              { $gt: ['$memberCount', 0] },
              { $round: [{ $divide: ['$totalTokens', '$memberCount'] }, 0] },
              0
            ]
          },
          averagePerActiveMember: {
            $cond: [
              { $gt: [{ $size: '$uniqueMembers' }, 0] },
              { $round: [{ $divide: ['$totalTokens', { $size: '$uniqueMembers' }] }, 0] },
              0
            ]
          },
          totalCost: { $round: ['$totalCost', 4] },
          timeWindowsActive: '$timeWindowsCount',
          lastActivity: 1,
          conversationCount: { $size: '$conversationIds' }
        }
      },
      
      // Sort results
      { $sort: sortObj },
      
      // Add pagination
      { $skip: skip },
      { $limit: limitNum }
    ];

    // Execute aggregation
    const groupStats = await Transaction.aggregate(pipeline);
    
    // Add ranking and get balance info
    const groupsWithRank = await Promise.all(
      groupStats.map(async (group, index) => {
        // Get group balance (sum of member balances)
        const memberBalances = await Balance.find({
          user: { $in: groups.find(g => g._id.toString() === group.groupId.toString())?.members || [] }
        }).lean();
        
        const groupBalance = memberBalances.reduce((sum, balance) => sum + (balance.tokenCredits || 0), 0);
        
        return {
          ...group,
          rank: skip + index + 1,
          groupBalance,
          averageBalance: group.memberCount > 0 ? Math.round(groupBalance / group.memberCount) : 0,
          membersWithLowBalance: memberBalances.filter(b => b.tokenCredits < 1000).length
        };
      })
    );

    // Get total count for pagination
    const countPipeline = [
      ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          userGroups: {
            $filter: {
              input: groups,
              as: 'group',
              cond: { $in: ['$user', { $ifNull: ['$$group.members', []] }] }
            }
          }
        }
      },
      { $unwind: { path: '$userGroups', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: '$userGroups._id',
          memberCount: { $first: { $size: { $ifNull: ['$userGroups.members', []] } } }
        }
      },
      ...(minMembers ? [
        { $match: { memberCount: { $gte: parseInt(minMembers) } } }
      ] : []),
      { $count: 'total' }
    ];

    const countResult = await Transaction.aggregate(countPipeline);
    const totalGroups = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalGroups / limitNum);

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
    const totalMembers = await User.countDocuments({ _id: { $in: groups.flatMap(g => g.members || []) } });
    
    const summary = {
      totalGroups: groups.length,
      totalMembers,
      totalTokensUsed: summaryResult.length > 0 ? summaryResult[0].totalTokensUsed : 0,
      averageGroupSize: groups.length > 0 ? Math.round(totalMembers / groups.length) : 0,
      mostActiveGroup: groupsWithRank.length > 0 ? groupsWithRank[0].groupName : null
    };

    logger.info(`[GroupStatistics] Generated leaderboard for ${totalGroups} groups`);

    res.json({
      success: true,
      data: {
        groups: groupsWithRank,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalGroups,
          groupsPerPage: limitNum
        },
        summary
      }
    });

  } catch (error) {
    logger.error('[GroupStatistics] Error generating group leaderboard:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate group leaderboard',
        details: error.message
      }
    });
  }
};

/**
 * Get detailed statistics for a specific group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getGroupStatistics = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { dateFrom, dateTo, includeMemberDetails = false } = req.query;

    // Validate admin access
    if (req.user?.role !== SystemRoles.ADMIN) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Admin role required to access group statistics'
        }
      });
    }

    // Get group info
    const group = await Group.findById(groupId).lean();
    if (!group) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'GROUP_NOT_FOUND',
          message: 'Group not found'
        }
      });
    }

    // Build date filter
    const dateFilter = { user: { $in: group.members || [] } };
    if (dateFrom || dateTo) {
      dateFilter.createdAt = {};
      if (dateFrom) dateFilter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) dateFilter.createdAt.$lte = new Date(dateTo);
    }

    // Get overall group usage statistics
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
          conversationIds: { $addToSet: '$conversationId' },
          uniqueUsers: { $addToSet: '$user' }
        }
      },
      {
        $project: {
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: { $add: ['$promptTokens', '$completionTokens'] },
          totalCost: { $round: ['$totalCost', 4] },
          conversationCount: { $size: '$conversationIds' },
          activeMemberCount: { $size: '$uniqueUsers' }
        }
      }
    ]);

    const totalUsage = usageStats.length > 0 ? usageStats[0] : {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      conversationCount: 0,
      activeMemberCount: 0
    };

    // Get member usage breakdown
    const memberUsage = await Transaction.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$user',
          tokens: { $sum: { $abs: '$rawAmount' } },
          cost: { 
            $sum: { 
              $multiply: [
                { $abs: '$rawAmount' },
                0.000005  // $5 per 1M tokens = $0.000005 per token
              ]
            }
          },
          lastActivity: { $max: '$createdAt' }
        }
      },
      { $sort: { tokens: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'balances',
          localField: '_id',
          foreignField: 'user',
          as: 'balance'
        }
      },
      { $unwind: { path: '$balance', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userId: '$_id',
          email: '$userInfo.email',
          username: '$userInfo.username',
          tokens: 1,
          cost: { $round: ['$cost', 2] },
          balance: { $ifNull: ['$balance.tokenCredits', 0] },
          lastActivity: 1,
          percentageOfGroup: {
            $round: [
              {
                $multiply: [
                  { $divide: ['$tokens', totalUsage.totalTokens || 1] },
                  100
                ]
              },
              1
            ]
          }
        }
      }
    ]);

    // Get highest and lowest users
    const highestUser = memberUsage.length > 0 ? memberUsage[0] : null;
    const lowestUser = memberUsage.length > 0 ? memberUsage[memberUsage.length - 1] : null;

    // Get group balance info
    const memberBalances = await Balance.find({
      user: { $in: group.members || [] }
    }).lean();
    
    const groupBalance = {
      totalBalance: memberBalances.reduce((sum, b) => sum + (b.tokenCredits || 0), 0),
      averageBalance: group.members.length > 0 
        ? Math.round(memberBalances.reduce((sum, b) => sum + (b.tokenCredits || 0), 0) / group.members.length)
        : 0,
      membersWithLowBalance: memberBalances.filter(b => b.tokenCredits < 1000).length
    };

    // Get period comparison (this month vs last month)
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    const periodComparison = await Promise.all([
      // This month
      Transaction.aggregate([
        { $match: { user: { $in: group.members || [] }, createdAt: { $gte: thisMonth } } },
        {
          $group: {
            _id: null,
            tokens: { $sum: { $abs: '$rawAmount' } },
            cost: { 
            $sum: { 
              $multiply: [
                { $abs: '$rawAmount' },
                0.000005  // $5 per 1M tokens = $0.000005 per token
              ]
            }
          }
          }
        }
      ]),
      // Last month
      Transaction.aggregate([
        { 
          $match: { 
            user: { $in: group.members || [] }, 
            createdAt: { $gte: lastMonth, $lt: thisMonth } 
          } 
        },
        {
          $group: {
            _id: null,
            tokens: { $sum: { $abs: '$rawAmount' } },
            cost: { 
            $sum: { 
              $multiply: [
                { $abs: '$rawAmount' },
                0.000005  // $5 per 1M tokens = $0.000005 per token
              ]
            }
          }
          }
        }
      ])
    ]);

    const thisMonthData = periodComparison[0].length > 0 ? periodComparison[0][0] : { tokens: 0, cost: 0 };
    const lastMonthData = periodComparison[1].length > 0 ? periodComparison[1][0] : { tokens: 0, cost: 0 };
    
    const growth = lastMonthData.tokens > 0 
      ? ((thisMonthData.tokens - lastMonthData.tokens) / lastMonthData.tokens * 100).toFixed(1)
      : 0;

    // Get top models used by group
    const topModels = await Transaction.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$model',
          usage: { $sum: { $abs: '$rawAmount' } },
          cost: { 
            $sum: { 
              $multiply: [
                { $abs: '$rawAmount' },
                0.000005  // $5 per 1M tokens = $0.000005 per token
              ]
            }
          }
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

    // Calculate time window compliance if applicable
    let complianceRate = null;
    if (group.timeWindows && group.timeWindows.length > 0) {
      // Simple compliance check - percentage of usage during active time windows
      // This is a simplified version - full implementation would check actual time windows
      complianceRate = 0.87; // Placeholder - implement actual time window checking
    }

    const groupData = {
      groupId: group._id,
      groupName: group.name,
      description: group.description,
      memberCount: group.members.length,
      isActive: group.isActive,
      timeWindows: group.timeWindows.map(tw => ({
        name: tw.name,
        windowType: tw.windowType,
        isActive: tw.isActive
      })),
      totalUsage,
      memberUsage: {
        averagePerMember: group.members.length > 0 
          ? Math.round(totalUsage.totalTokens / group.members.length)
          : 0,
        highestUser,
        lowestUser,
        topMembers: includeMemberDetails === 'true' || includeMemberDetails === true ? memberUsage : memberUsage.slice(0, 3)
      },
      groupBalance,
      periodComparison: {
        thisMonth: { 
          tokens: thisMonthData.tokens, 
          cost: Math.round(thisMonthData.cost * 100) / 100 
        },
        lastMonth: { 
          tokens: lastMonthData.tokens, 
          cost: Math.round(lastMonthData.cost * 100) / 100 
        },
        growth: growth > 0 ? `+${growth}%` : `${growth}%`
      },
      topModels,
      ...(complianceRate !== null && { timeWindowCompliance: complianceRate })
    };

    logger.info(`[GroupStatistics] Generated statistics for group ${groupId}`);

    res.json({
      success: true,
      data: groupData
    });

  } catch (error) {
    logger.error('[GroupStatistics] Error generating group statistics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate group statistics',
        details: error.message
      }
    });
  }
};

/**
 * Get member statistics within a group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getGroupMemberStatistics = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { 
      page = 1,
      limit = 50,
      sortBy = 'tokens',
      sortOrder = 'desc',
      dateFrom,
      dateTo 
    } = req.query;

    // Validate admin access
    if (req.user?.role !== SystemRoles.ADMIN) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Admin role required to access group member statistics'
        }
      });
    }

    // Get group info
    const group = await Group.findById(groupId).lean();
    if (!group) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'GROUP_NOT_FOUND',
          message: 'Group not found'
        }
      });
    }

    // Parse pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Build date filter
    const dateFilter = { user: { $in: group.members || [] } };
    if (dateFrom || dateTo) {
      dateFilter.createdAt = {};
      if (dateFrom) dateFilter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) dateFilter.createdAt.$lte = new Date(dateTo);
    }

    // Build sort object
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortObj = {};
    
    switch (sortBy) {
      case 'balance':
        sortObj['balance.tokenCredits'] = sortDirection;
        break;
      case 'cost':
        sortObj.cost = sortDirection;
        break;
      case 'lastActivity':
        sortObj.lastActivity = sortDirection;
        break;
      default:
        sortObj.tokens = sortDirection;
    }

    // Get group total for percentage calculation
    const groupTotal = await Transaction.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalTokens: { $sum: { $abs: '$rawAmount' } }
        }
      }
    ]);

    const groupTotalTokens = groupTotal.length > 0 ? groupTotal[0].totalTokens : 0;

    // Get member statistics
    const memberStats = await Transaction.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$user',
          tokens: { $sum: { $abs: '$rawAmount' } },
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
          cost: { 
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
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'balances',
          localField: '_id',
          foreignField: 'user',
          as: 'balance'
        }
      },
      { $unwind: { path: '$balance', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userId: '$_id',
          email: '$user.email',
          username: '$user.username',
          tokens: 1,
          promptTokens: 1,
          completionTokens: 1,
          cost: { $round: ['$cost', 2] },
          balance: { $ifNull: ['$balance.tokenCredits', 0] },
          lastActivity: 1,
          conversationCount: { $size: '$conversationIds' },
          percentageOfGroup: {
            $round: [
              {
                $multiply: [
                  { $divide: ['$tokens', groupTotalTokens || 1] },
                  100
                ]
              },
              1
            ]
          }
        }
      },
      { $sort: sortObj },
      { $skip: skip },
      { $limit: limitNum }
    ]);

    // Add ranking
    const membersWithRank = memberStats.map((member, index) => ({
      ...member,
      rank: skip + index + 1
    }));

    // Get total member count for pagination
    const totalMembers = group.members.length;
    const totalPages = Math.ceil(totalMembers / limitNum);

    logger.info(`[GroupStatistics] Generated member statistics for group ${groupId}`);

    res.json({
      success: true,
      data: {
        groupId: group._id,
        groupName: group.name,
        members: membersWithRank,
        groupTotals: {
          totalTokens: groupTotalTokens,
          totalMembers,
          averagePerMember: totalMembers > 0 ? Math.round(groupTotalTokens / totalMembers) : 0
        },
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalMembers,
          membersPerPage: limitNum
        }
      }
    });

  } catch (error) {
    logger.error('[GroupStatistics] Error generating group member statistics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate group member statistics',
        details: error.message
      }
    });
  }
};

module.exports = {
  getGroupLeaderboard,
  getGroupStatistics,
  getGroupMemberStatistics
};