const express = require('express');
const mongoose = require('mongoose');
const moment = require('moment'); // Ensure Moment.js is imported
const router = express.Router();
const { requireJwtAuth, checkAdmin } = require('~/server/middleware');
const queryLogger = require('~/server/services/QueryLogger');
const { Message, User, Conversation } = require('~/db/models');
const { exportQueryLogsToCSV } = require('~/server/utils/excelExport');
const { logger } = require('~/config');

router.use(requireJwtAuth, checkAdmin);

/** ---------------- Shared Helpers ---------------- **/

// Build filter and search conditions from query parameters
const buildFilterFromQuery = (query = {}) => {
  const { search } = query;
  const filter = {};
  let userMatchExpr = null;

  if (search) {
    filter.$or = [
      { model: { $regex: search, $options: 'i' } },
      { text: { $regex: search, $options: 'i' } },
    ];
    userMatchExpr = {
      $expr: {
        $or: [
          { $regexMatch: { input: '$userInfo.name', regex: search, options: 'i' } },
          { $regexMatch: { input: '$userInfo.email', regex: search, options: 'i' } },
          { $regexMatch: { input: '$conversationDoc.title', regex: search, $options: 'i' } },
        ],
      },
    };
  }

  return { filter, userMatchExpr };
};

// Build aggregation pipeline for conversations
const buildConversationsAggregation = (filter, userMatchExpr, { skip = 0, limitNum = 10 }) => {
  const pipeline = [
    { $match: filter },
    {
      $group: {
        _id: '$conversationId',
        user: { $first: '$user' },
        createdAt: { $min: '$createdAt' },
        updatedAt: { $max: '$createdAt' },
        totalTokens: { $sum: { $ifNull: ['$tokenCount', 0] } },
        messageCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'users',
        let: { userId: '$user' },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: [
                  '$_id',
                  {
                    $cond: [
                      { $eq: [{ $type: '$$userId' }, 'objectId'] },
                      '$$userId',
                      { $toObjectId: '$$userId' },
                    ],
                  },
                ],
              },
            },
          },
          { $project: { name: 1, email: 1 } },
        ],
        as: 'userInfo',
      },
    },
    { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'conversations',
        localField: '_id',
        foreignField: 'conversationId',
        as: 'conversationDoc',
      },
    },
    { $unwind: { path: '$conversationDoc', preserveNullAndEmptyArrays: true } },
    ...(userMatchExpr ? [{ $match: userMatchExpr }] : []),
    {
      $project: {
        conversationId: '$_id',
        user: {
          name: '$userInfo.name',
          email: '$userInfo.email',
          id: '$user',
        },
        title: { $ifNull: ['$conversationDoc.title', 'New Chat'] },
        createdAt: 1,
        updatedAt: 1,
        totalTokens: 1,
        messageCount: 1,
      },
    },
    { $sort: { updatedAt: -1 } },
    { $skip: skip },
    { $limit: limitNum },
  ];
  return pipeline;
};

// Fetch conversations with pagination
const fetchConversations = async (query = {}) => {
  const pageNum = Math.max(parseInt(query.page ?? 1, 10), 1);
  const limitQ = Math.min(Math.max(parseInt(query.limit ?? 10, 10), 1), 100);
  const all = query.all === 'true';

  const { filter, userMatchExpr } = buildFilterFromQuery(query);
  logger.info('[fetchConversations] Query params:', query);
  logger.info('[fetchConversations] Built filter:', filter);

  const countPipeline = [
    { $match: filter },
    {
      $group: {
        _id: '$conversationId',
      },
    },
    {
      $lookup: {
        from: 'users',
        let: { userId: '$user' },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: [
                  '$_id',
                  {
                    $cond: [
                      { $eq: [{ $type: '$$userId' }, 'objectId'] },
                      '$$userId',
                      { $toObjectId: '$$userId' },
                    ],
                  },
                ],
              },
            },
          },
          { $project: { name: 1, email: 1 } },
        ],
        as: 'userInfo',
      },
    },
    { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'conversations',
        localField: '_id',
        foreignField: 'conversationId',
        as: 'conversationDoc',
      },
    },
    { $unwind: { path: '$conversationDoc', preserveNullAndEmptyArrays: true } },
    ...(userMatchExpr ? [{ $match: userMatchExpr }] : []),
    { $count: 'total' },
  ];
  const [countResult] = await Message.aggregate(countPipeline);
  const totalCount = countResult?.total || 0;
  logger.info('[fetchConversations] Total conversations count:', totalCount);

  let skip = all ? 0 : (pageNum - 1) * limitQ;
  let limitNum = all ? Math.max(totalCount, 1) : limitQ;

  const conversations = await Message.aggregate(buildConversationsAggregation(filter, userMatchExpr, { skip, limitNum }));
  logger.info('[fetchConversations] Retrieved conversations count:', conversations.length);

  const totalPages = Math.max(1, Math.ceil(totalCount / limitNum));

  return {
    conversations,
    pagination: {
      currentPage: Math.min(pageNum, totalPages),
      totalPages,
      totalCount,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
  };
};

/** ---------------- End Helpers ---------------- **/

// Build log data for SSE streaming
async function buildLogData(message, eventType = 'log') {
  const user = await User.findById(message.user).lean();
  const userInfo = user ? { name: user.name, email: user.email, id: message.user } : { id: message.user };

  return {
    event: eventType,
    type: 'message',
    role: message.model ? 'assistant' : message.toolCalls?.length ? 'tool' : 'user',
    messageId: message.messageId,
    text: message.text || '',
    model: message.model || null,
    user: userInfo,
    tokenCount: message.tokenCount || 0,
    createdAt: message.createdAt.toISOString(),
    toolType: message.toolCalls?.[0]?.type || null,
    searchQuery: message.toolCalls?.find(t => t.type === 'web_search')?.query || null,
  };
}

// Endpoint: Fetch individual query by messageId
router.get('/query/:messageId', async (req, res) => {
  try {
    const message = await Message.findOne({ messageId: req.params.messageId }).lean();
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    res.json({ messageId: message.messageId, query: message.text || '' });
  } catch (error) {
    logger.error('[logs/query] Error fetching full query:', error);
    res.status(500).json({ message: 'Error fetching full query' });
  }
});

// Endpoint: Export query logs to CSV
router.get('/queries/export', async (req, res) => {
  try {
    const { search } = req.query;
    const filter = search ? {
      $or: [
        { model: { $regex: search, $options: 'i' } },
        { text: { $regex: search, $options: 'i' } },
      ],
    } : {};

    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ],
      }).distinct('_id');
      if (matchingUsers.length > 0) {
        filter.$or = filter.$or || [];
        filter.$or.push({ user: { $in: matchingUsers } });
      }
    }

    const messages = await Message.find(filter)
      .populate({
        path: 'user',
        select: 'name email',
        model: 'User',
      })
      .select('user text model tokenCount createdAt toolCalls conversationId')
      .sort({ createdAt: -1 }) // Sort newest first
      .lean();

    if (!messages || messages.length === 0) {
      return res.status(404).json({ message: 'No query logs found matching the criteria' });
    }

    // Fetch conversation titles
    const conversationIds = [...new Set(messages.map((m) => m.conversationId))];
    const conversations = await Conversation.find({ conversationId: { $in: conversationIds } })
      .select('conversationId title')
      .lean();
    const conversationTitleMap = conversations.reduce((acc, conv) => {
      acc[conv.conversationId] = conv.title || 'New Chat';
      return acc;
    }, {});

    const formattedLogs = messages.map((message) => ({
      role: message.model ? 'assistant' : message.toolCalls?.length ? 'tool' : 'user',
      model: message.model || null,
      text: message.text || '',
      tokenCount: message.tokenCount || 0,
      createdAt: message.createdAt ? moment(message.createdAt).format('Do MMMM YY, h:mm:ss a') : moment().format('Do MMM YY, h:mm:ss a'),
      user: {
        name: message.user?.name || 'N/A',
        email: message.user?.email || 'N/A',
      },
      toolType: message.toolCalls?.[0]?.type || null,
      searchQuery: message.toolCalls?.find(t => t.type === 'web_search')?.query || null,
      conversationId: message.conversationId,
      conversationTitle: conversationTitleMap[message.conversationId] || 'New Chat',
    }));

    const csv = await exportQueryLogsToCSV(formattedLogs);
    const date = new Date().toISOString().split('T')[0];
    const filename = `query-logs-${date}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    return res.send(csv);
  } catch (error) {
    logger.error('[logs/queries/export] Error exporting query logs to CSV:', error);
    return res.status(500).json({ message: 'Failed to export query logs', error: error.message });
  }
});

// Modified Endpoint: Export all conversation messages to CSV
router.get('/conversations/export', async (req, res) => {
  try {
    const { search } = req.query;

    // Build search filter
    const filter = {};
    if (search) {
      filter.$or = [
        { model: { $regex: search, $options: 'i' } },
      ];
    }

    // Find matching users for name/email search
    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ],
      }).distinct('_id');
      if (matchingUsers.length > 0) {
        filter.$or = filter.$or || [];
        filter.$or.push({ user: { $in: matchingUsers } });
      }
    }

    // Get all matching messages with required fields and populate user data
    const messages = await Message.find(filter)
      .populate({
        path: 'user',
        select: 'name email',
        model: 'User'
      })
      .select('user text model tokenCount createdAt')
      .sort({ createdAt: -1 }) // Sort newest first
      .lean();

    if (!messages || messages.length === 0) {
      return res.status(404).json({ message: 'No messages found matching the criteria' });
    }

    // Format messages for CSV export
    const formattedLogs = messages.map((message) => {
      const user = message.user || {};
      const isAI = !!message.model;
      
      return {
        role: isAI ? 'assistant' : 'user',
        model: message.model || null,
        text: message.text || '',
        tokenCount: message.tokenCount || 0,
        createdAt: message.createdAt ? moment(message.createdAt).format('Do MMM YY, h:mm:ss a') : moment().format('Do MMM YY, h:mm:ss a'),
        user: {
          name: user.name || 'N/A',
          email: user.email || 'N/A'
        }
      };
    });

    // Generate CSV
    const csv = await exportQueryLogsToCSV(formattedLogs);
    
    // Set headers for file download
    const date = new Date().toISOString().split('T')[0];
    const filename = `all-conversations-${date}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');
    
    // Send the CSV file
    return res.send(csv);
  } catch (error) {
    logger.error('[logs/conversations/export] Error exporting conversation messages to CSV:', error);
    return res.status(500).json({ message: 'Failed to export conversation messages', error: error.message });
  }
});

// Endpoint: Export messages for a specific conversation to CSV
router.get('/conversations/:conversationId/export', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { search } = req.query;

    const filter = { conversationId };
    if (search) {
      filter.$or = [
        { model: { $regex: search, $options: 'i' } },
        { text: { $regex: search, $options: 'i' } },
      ];
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ],
      }).distinct('_id');
      if (matchingUsers.length > 0) {
        filter.$or.push({ user: { $in: matchingUsers } });
      }
    }

    const messages = await Message.find(filter)
      .populate({
        path: 'user',
        select: 'name email',
        model: 'User',
      })
      .select('user text model tokenCount createdAt toolCalls')
      .sort({ createdAt: -1 }) // Sort newest first
      .lean();

    if (!messages || messages.length === 0) {
      return res.status(404).json({ message: 'No messages found for this conversation' });
    }

    const conversation = await Conversation.findOne({ conversationId }).select('title').lean();
    const title = conversation?.title || 'New Chat';

    const formattedLogs = messages.map((message) => ({
      role: message.model ? 'assistant' : message.toolCalls?.length ? 'tool' : 'user',
      model: message.model || null,
      text: message.text || '',
      tokenCount: message.tokenCount || 0,
      createdAt: message.createdAt ? moment(message.createdAt).format('Do MMM YY, h:mm:ss a') : moment().format('Do MMM YY, h:mm:ss a'),
      user: {
        name: message.user?.name || 'N/A',
        email: message.user?.email || 'N/A',
      },
      toolType: message.toolCalls?.[0]?.type || null,
      searchQuery: message.toolCalls?.find(t => t.type === 'web_search')?.query || null,
      conversationId,
      conversationTitle: title,
    }));

    const csv = await exportQueryLogsToCSV(formattedLogs);
    const date = new Date().toISOString().split('T')[0];
    const filename = `conversation-${conversationId}-${date}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    return res.send(csv);
  } catch (error) {
    logger.error(`[logs/conversations/${req.params.conversationId}/export] Error exporting conversation messages to CSV:`, error);
    return res.status(500).json({ message: 'Failed to export conversation messages', error: error.message });
  }
});

// Endpoint: Fetch conversation summaries with real-time updates
router.get('/conversations', async (req, res) => {
  logger.info('[logs/conversations] Starting SSE response for user:', req.user?.email || 'unknown');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write('retry: 10000\n\n');
  res.flushHeaders();

  try {
    const { conversations, pagination } = await fetchConversations(req.query);
    const { currentPage, totalPages, totalCount, hasNext, hasPrev } = pagination;

    res.write(`data: ${JSON.stringify({
      type: 'init',
      count: conversations.length,
      total: totalCount,
      pagination: { currentPage, totalPages, hasNext, hasPrev },
    })}\n\n`);
    res.flush();

    for (const c of conversations) {
      try {
        const conversationData = {
          event: 'historical_conversation',
          type: 'conversation_summary',
          conversationId: c.conversationId,
          user: c.user,
          title: c.title,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          totalTokens: c.totalTokens,
          messageCount: c.messageCount,
        };
        res.write(`data: ${JSON.stringify(conversationData)}\n\n`);
        res.flush();
      } catch (error) {
        logger.error(`[logs/conversations] Error processing conversation ${c.conversationId}:`, error);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'historical_complete' })}\n\n`);
    res.flush();
  } catch (error) {
    logger.error('[logs/conversations] Error fetching conversations:', error);
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Error fetching conversations' })}\n\n`);
    res.flush();
    res.end();
    return;
  }

  const heartbeatInterval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`);
    res.flush();
  }, 30000);

  const processedConversationIds = new Set();
  let changeStream;
  let convoChangeStream;

  try {
    const { filter, userMatchExpr } = buildFilterFromQuery(req.query);
    changeStream = Message.watch([{ $match: { operationType: 'insert', ...filter } }], { fullDocument: 'updateLookup' });

    changeStream.on('change', async (change) => {
      if (change.operationType !== 'insert') return;
      const newMessage = change.fullDocument;
      if (!newMessage?.conversationId || processedConversationIds.has(newMessage.conversationId)) return;
      processedConversationIds.add(newMessage.conversationId);

      try {
        const [summary] = await Message.aggregate([
          { $match: { conversationId: newMessage.conversationId } },
          ...buildConversationsAggregation({}, userMatchExpr, { skip: 0, limitNum: 1 }).slice(1),
        ]);

        if (summary) {
          if (userMatchExpr) {
            const name = summary.user?.name || '';
            const email = summary.user?.email || '';
            const title = summary.title || '';
            if (
              !new RegExp(req.query.search, 'i').test(name) &&
              !new RegExp(req.query.search, 'i').test(email) &&
              !new RegExp(req.query.search, 'i').test(title)
            ) {
              return;
            }
          }

          const conversationData = {
            event: 'realtime_conversation',
            type: 'conversation_summary',
            conversationId: summary.conversationId,
            user: summary.user,
            title: summary.title,
            createdAt: summary.createdAt.toISOString(),
            updatedAt: summary.updatedAt.toISOString(),
            totalTokens: summary.totalTokens,
            messageCount: summary.messageCount,
          };
          res.write(`data: ${JSON.stringify(conversationData)}\n\n`);
          res.flush();
        }
      } catch (error) {
        logger.error(`[logs/conversations] Error processing real-time conversation ${newMessage.conversationId}:`, error);
      }
    });

    changeStream.on('error', (error) => {
      logger.error('[logs/conversations] Change stream error:', error);
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'Change stream error' })}\n\n`);
      res.flush();
    });

    convoChangeStream = Conversation.watch([{ $match: { operationType: 'update' } }], { fullDocument: 'updateLookup' });

    convoChangeStream.on('change', async (change) => {
      try {
        const updatedFields = change.updateDescription?.updatedFields || {};
        if (!('title' in updatedFields)) return;

        const convDoc = change.fullDocument || (await Conversation.findById(change.documentKey?._id).select('conversationId title updatedAt user').lean());
        if (!convDoc?.conversationId) return;

        if (req.query.search) {
          const user = await User.findById(convDoc.user).lean();
          const name = user?.name || '';
          const email = user?.email || '';
          if (
            !new RegExp(req.query.search, 'i').test(name) &&
            !new RegExp(req.query.search, 'i').test(email) &&
            !new RegExp(req.query.search, 'i').test(convDoc.title)
          ) {
            return;
          }
        }

        const payload = {
          event: 'conversation_update',
          type: 'title',
          conversationId: convDoc.conversationId,
          title: convDoc.title || 'New Chat',
          updatedAt: (convDoc.updatedAt ? new Date(convDoc.updatedAt).toISOString() : new Date().toISOString()),
        };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        res.flush();
      } catch (err) {
        logger.error('[logs/conversations] Error processing conversation title update:', err);
      }
    });

    convoChangeStream.on('error', (err) => {
      logger.error('[logs/conversations] Conversation change stream error:', err);
    });
  } catch (err) {
    logger.warn('[logs/conversations] Change streams unavailable; running without real-time updates:', err?.message || err);
    res.write(`event: warning\ndata: ${JSON.stringify({ message: 'Real-time updates unavailable; showing historical conversations only' })}\n\n`);
    res.flush();
  }

  queryLogger.addClient(res);

  req.on('close', () => {
    logger.info('[logs/conversations] Client disconnected');
    queryLogger.removeClient(res);
    if (changeStream) {
      try {
        changeStream.close();
      } catch (err) {
        logger.error('[logs/conversations] Error closing change stream:', err);
      }
    }
    if (convoChangeStream) {
      try {
        convoChangeStream.close();
      } catch (err) {
        logger.error('[logs/conversations] Error closing conversation change stream:', err);
      }
    }
    clearInterval(heartbeatInterval);
    res.end();
  });
});

// Endpoint: Fetch detailed messages for a specific conversation
router.get('/conversations/:conversationId/messages', async (req, res) => {
  const { conversationId } = req.params;
  logger.info('[logs/conversations/messages] Starting SSE response for conversation:', conversationId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write('retry: 10000\n\n');
  res.flushHeaders();

  try {
    const messages = await Message.find({ conversationId })
      .select('messageId conversationId user model text tokenCount createdAt toolCalls')
      .sort({ createdAt: 1 })
      .lean();

    const uniqueUserIds = Array.from(
      new Set(
        messages
          .map((m) => (typeof m.user === 'string' ? m.user : null))
          .filter((id) => id && mongoose.Types.ObjectId.isValid(id)),
      ),
    );

    let userInfoMap = {};
    if (uniqueUserIds.length) {
      const userDocs = await User.find({
        _id: { $in: uniqueUserIds.map((id) => new mongoose.Types.ObjectId(id)) },
      })
        .select('name email')
        .lean();

      userInfoMap = userDocs.reduce((acc, u) => {
        acc[u._id.toString()] = {
          name: u.name || 'Unknown',
          email: u.email || 'N/A',
          id: u._id.toString(),
        };
        return acc;
      }, {});
    }

    res.write(`data: ${JSON.stringify({ type: 'init', conversationId, count: messages.length })}\n\n`);
    res.flush();

    for (const message of messages) {
      try {
        const resolvedUser =
          (typeof message.user === 'string' && userInfoMap[message.user]) || null;

        const messageData = await buildLogData(message, 'historical_message');
        res.write(`data: ${JSON.stringify(messageData)}\n\n`);
        res.flush();
      } catch (error) {
        logger.error(`[logs/conversations/messages] Error processing message ${message.messageId}:`, error);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'historical_complete' })}\n\n`);
    res.flush();
  } catch (error) {
    logger.error('[logs/conversations/messages] Error fetching messages:', error);
    res.write(`data: ${JSON.stringify({ type: 'init', conversationId, count: 0 })}\n\n`);
    res.flush();
  }

  const heartbeatInterval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`);
    res.flush();
  }, 30000);

  const processedMessageIds = new Set();
  let changeStream;

  try {
    changeStream = Message.watch(
      [
        {
          $match: {
            operationType: 'insert',
            'fullDocument.conversationId': conversationId,
          },
        },
      ],
      { fullDocument: 'updateLookup' },
    );

    changeStream.on('change', async (change) => {
      if (change.operationType !== 'insert') return;
      const newMessage = change.fullDocument;
      if (!newMessage?._id || processedMessageIds.has(newMessage._id.toString())) return;
      processedMessageIds.add(newMessage._id.toString());

      try {
        const messageData = await buildLogData(newMessage, 'realtime_message');
        res.write(`data: ${JSON.stringify(messageData)}\n\n`);
        res.flush();
      } catch (error) {
        logger.error(`[logs/conversations/messages] Error processing real-time message ${newMessage._id}:`, error);
      }
    });

    changeStream.on('error', (error) => {
      logger.error('[logs/conversations/messages] Change stream error:', error);
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'Change stream error' })}\n\n`);
      res.flush();
    });
  } catch (err) {
    logger.warn('[logs/conversations/messages] Change streams unavailable; running without real-time updates:', err?.message || err);
    res.write(`event: warning\ndata: ${JSON.stringify({ message: 'Real-time updates unavailable; showing historical messages only' })}\n\n`);
    res.flush();
  }

  queryLogger.addClient(res);

  req.on('close', () => {
    logger.info('[logs/conversations/messages] Client disconnected');
    queryLogger.removeClient(res);
    if (changeStream) {
      try {
        changeStream.close();
      } catch (err) {
        logger.error('[logs/conversations/messages] Error closing change stream:', err);
      }
    }
    clearInterval(heartbeatInterval);
    res.end();
  });
});

// Endpoint: Test database for conversations
router.get('/test', requireJwtAuth, checkAdmin, async (req, res) => {
  try {
    const totalCount = await Message.aggregate([
      { $group: { _id: '$conversationId' } },
      { $count: 'total' },
    ]);
    const recentConversations = await Message.aggregate([
      {
        $group: {
          _id: '$conversationId',
          createdAt: { $min: '$createdAt' },
          updatedAt: { $max: '$createdAt' },
        },
      },
      { $sort: { updatedAt: -1 } },
      { $limit: 5 },
    ]);
    res.json({
      success: true,
      data: {
        totalCount: totalCount[0]?.total || 0,
        recentConversations,
        message: 'Database check completed',
      },
    });
  } catch (error) {
    logger.error('[logs/test] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to check database' });
  }
});

module.exports = router;