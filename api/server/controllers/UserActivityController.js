const { logger } = require('~/config');
const { UserActivityLog, User, Message } = require('~/db/models');
const mongoose = require('mongoose');

/** ---------------- Shared helpers ---------------- **/
const buildFilterFromQuery = (query = {}) => {
  const { userId, action, startDate, endDate, search } = query;
  const filter = {};
  if (userId) {
    try {
      filter.user = mongoose.Types.ObjectId(userId);
    } catch {
      // ignore invalid userId here; the main handlers validate when needed
    }
  }
  if (action) filter.action = action;
  if (startDate || endDate) {
    filter.timestamp = {};
    if (startDate) filter.timestamp.$gte = new Date(startDate);
    if (endDate) filter.timestamp.$lte = new Date(endDate);
  }
  return { filter, search };
};

const buildLogsAggregation = (filter, { skip = 0, limitNum = 20 }, search) => {
  const pipeline = [
    { $match: filter },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userInfo',
        pipeline: [
          { $project: { name: 1, email: 1, username: 1, avatar: 1, role: 1 } }
        ]
      }
    },
    { $unwind: '$userInfo' },
  ];
  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { 'userInfo.name': { $regex: search, $options: 'i' } },
          { 'userInfo.email': { $regex: search, $options: 'i' } },
          { 'userInfo.username': { $regex: search, $options: 'i' } },
          { action: { $regex: search, $options: 'i' } }
        ]
      }
    });
  }
  pipeline.push(
    {
      $addFields: {
        tokenUsage: {
          $cond: [
            { $in: ['$action', ['MODEL CHANGED']] },
            '$details',
            null
          ]
        }
      }
    },
    { $sort: { timestamp: -1 } },
    { $skip: skip },
    { $limit: limitNum }
  );
  return pipeline;
};

/**
 * Shared fetcher used by both /logs and /stream (initial snapshot)
 * Supports ?all=true to return ALL matching logs in the first frame.
 */
const fetchActivityLogs = async (query = {}) => {
  const pageNum = Math.max(parseInt(query.page ?? 1, 10), 1);
  const limitQ = Math.min(Math.max(parseInt(query.limit ?? 20, 10), 1), 100);
  const includeTokenUsage =
    (typeof query.includeTokenUsage === 'boolean')
      ? query.includeTokenUsage
      : `${query.includeTokenUsage ?? 'true'}` === 'true';

  const { filter, search } = buildFilterFromQuery(query);
  logger.info('[fetchActivityLogs] Query params:', query);
  logger.info('[fetchActivityLogs] Built filter:', filter);

  // Compute total count with search filter
  const countPipeline = [
    { $match: filter },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userInfo',
        pipeline: [
          { $project: { name: 1, email: 1, username: 1, avatar: 1, role: 1 } }
        ]
      }
    },
    { $unwind: '$userInfo' }
  ];
  if (search) {
    countPipeline.push({
      $match: {
        $or: [
          { 'userInfo.name': { $regex: search, $options: 'i' } },
          { 'userInfo.email': { $regex: search, $options: 'i' } },
          { 'userInfo.username': { $regex: search, $options: 'i' } },
          { action: { $regex: search, $options: 'i' } }
        ]
      }
    });
  }
  countPipeline.push({ $count: 'total' });
  const [countResult] = await UserActivityLog.aggregate(countPipeline);
  const totalCount = countResult?.total || 0;
  logger.info('[fetchActivityLogs] Total documents count:', totalCount);

  let skip = (pageNum - 1) * limitQ;
  let limitNum = limitQ;

  if (`${query.all ?? 'false'}` === 'true') {
    skip = 0;
    limitNum = Math.max(totalCount, 1);
  }

  logger.info('[fetchActivityLogs] Pagination:', { skip, limitNum, pageNum, limitQ });

  const logs = await UserActivityLog.aggregate(buildLogsAggregation(filter, { skip, limitNum }, search));
  logger.info('[fetchActivityLogs] Retrieved logs count:', logs.length);

  // Enrich token usage if requested
  if (includeTokenUsage) {
    for (const log of logs) {
      if (
        ['MODEL CHANGED'].includes(log.action) &&
        log.details?.conversationId
      ) {
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

  const totalPages = Math.max(1, Math.ceil(totalCount / limitNum));

  return {
    logs,
    pagination: {
      currentPage: Math.min(pageNum, totalPages),
      totalPages,
      totalCount,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1
    }
  };
};
/** ---------------- End helpers ---------------- **/

/**
 * Get user activity logs with token usage data
 * Query: page, limit, userId, action, startDate, endDate, includeTokenUsage, all, search
 */
const getUserActivityLogs = async (req, res) => {
  try {
    const { logs, pagination } = await fetchActivityLogs(req.query);
    res.json({ success: true, data: { logs, pagination } });
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
    // Messages can have model: null — use timestamps to split
    const allMessages = await Message.find({
      user: userId,
      conversationId
    })
      .select('tokenCount summaryTokenCount model createdAt')
      .sort({ createdAt: 1 })
      .lean();

    if (allMessages.length === 0) {
      return {
        beforeModelChange: { model: fromModel, totalTokens: 0, messageCount: 0 },
        afterModelChange:  { model: toModel,   totalTokens: 0, messageCount: 0 },
        tokenDifference: 0
      };
    }

    const changeAt = new Date(changeTimestamp);
    const beforeMessages = allMessages.filter(msg => new Date(msg.createdAt) < changeAt);
    const afterMessages  = allMessages.filter(msg => new Date(msg.createdAt) >= changeAt);

    const sumTokens = (msgs) => msgs.reduce((sum, msg) =>
      sum + (msg.tokenCount || 0) + (msg.summaryTokenCount || 0), 0);

    const beforeTokens = sumTokens(beforeMessages);
    const afterTokens  = sumTokens(afterMessages);

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
      beforeModelChange: { model: fromModel, totalTokens: 0, messageCount: 0 },
      afterModelChange:  { model: toModel,   totalTokens: 0, messageCount: 0 },
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
      case '1h':  startDate = new Date(Date.now() - 60 * 60 * 1000); break;
      case '24h': startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); break;
      case '7d':  startDate = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000); break;
      case '30d': startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); break;
      default:    startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    const stats = await UserActivityLog.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      { $group: { _id: '$action', count: { $sum: 1 }, latestActivity: { $max: '$timestamp' } } },
      { $project: { action: '$_id', count: 1, latestActivity: 1, _id: 0 } }
    ]);

    const activeUsers = await UserActivityLog.distinct('user', { timestamp: { $gte: startDate } });

    const modelChangeStats = await UserActivityLog.aggregate([
      { $match: { action: { $in: ['MODEL CHANGED'] }, timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: { fromModel: '$details.fromModel', toModel: '$details.toModel' },
          count: { $sum: 1 }
        }
      },
      { $project: { fromModel: '$_id.fromModel', toModel: '$_id.toModel', count: 1, _id: 0 } },
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
    res.status(500).json({ success: false, error: 'Failed to fetch activity statistics' });
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
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }

    let startDate;
    switch (timeframe) {
      case '24h': startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); break;
      case '7d':  startDate = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000); break;
      case '30d': startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); break;
      default:    startDate = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
    }

    const userObjectId = mongoose.Types.ObjectId(userId);

    const user = await User.findById(userObjectId)
      .select('name email username avatar role')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const activitySummary = await UserActivityLog.aggregate([
      { $match: { user: userObjectId, timestamp: { $gte: startDate } } },
      { $group: { _id: '$action', count: { $sum: 1 }, lastActivity: { $max: '$timestamp' } } }
    ]);

    const tokenUsage = await Message.aggregate([
      { $match: { user: userId, createdAt: { $gte: startDate } } },
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
        totalTokens: tokenUsage.reduce((sum, m) => sum + m.totalTokens, 0)
      }
    });

  } catch (error) {
    logger.error('[getUserActivitySummary] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user activity summary' });
  }
};

module.exports = {
  getUserActivityLogs,
  getActivityStats,
  getUserActivitySummary,
  getTokenUsageForModelChange,
  fetchActivityLogs, // exported for streaming service
};