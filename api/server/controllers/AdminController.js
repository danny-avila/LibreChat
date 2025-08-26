const { SystemRoles } = require('librechat-data-provider');
const { logger } = require('~/config');
const {
  deleteConvos,
  deletePresets,
  deleteMessages,
  deleteUserById,
  deleteAllSharedLinks,
} = require('~/models');
const { deleteUserPluginAuth } = require('~/server/services/PluginService');
const { deleteUserKey } = require('~/server/services/UserService');
const { processDeleteRequest } = require('~/server/services/Files/process');
const { getFiles } = require('~/models');
const { Transaction, Balance, User, Conversation, Message, File, UserActivityLog } = require('~/db/models');
const mongoose = require('mongoose');
const { deleteAllUserSessions } = require('~/models');

function sanitizeUser(userDoc) {
  const user = userDoc.toObject ? userDoc.toObject() : userDoc;
  const {
    password,
    totpSecret,
    backupCodes,
    refreshToken,
    expiresAt,
    __v,
    ...safe
  } = user;
  return safe;
}

const listUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const search = (req.query.search || '').toString().trim();
    const role = (req.query.role || '').toString().trim().toUpperCase();

    const filter = {};
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        // Allow searching by role string (e.g., "admin" or "user")
        { role: { $regex: search, $options: 'i' } },
      ];
    }
    if (role && [SystemRoles.ADMIN, SystemRoles.USER].includes(role)) {
      filter.role = role;
    }

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    res.status(200).json({
      page,
      limit,
      total,
      users: users.map(sanitizeUser),
    });
  } catch (error) {
    logger.error('[admin:listUsers]', error);
    res.status(500).json({ message: 'Failed to list users' });
  }
};

const getUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(sanitizeUser(user));
  } catch (error) {
    logger.error('[admin:getUser]', error);
    res.status(500).json({ message: 'Failed to fetch user' });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const nextRole = typeof role === 'string' ? role.toUpperCase() : '';
    if (![SystemRoles.ADMIN, SystemRoles.USER].includes(nextRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    const user = await User.findByIdAndUpdate(id, { role: nextRole }, { new: true });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(sanitizeUser(user));
  } catch (error) {
    logger.error('[admin:updateUserRole]', error);
    res.status(500).json({ message: 'Failed to update user role' });
  }
};

const getUserStats = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('_id');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const [convoCount, messageCount, fileCount, txCount, balanceCount] = await Promise.all([
      Conversation.countDocuments({ user: user._id }),
      Message.countDocuments({ user: user._id }),
      File.countDocuments({ user: user._id }),
      Transaction.countDocuments({ user: user._id }),
      Balance.countDocuments({ user: user._id }),
    ]);

    res.status(200).json({
      userId: id,
      conversations: convoCount,
      messages: messageCount,
      files: fileCount,
      transactions: txCount,
      balances: balanceCount,
    });
  } catch (error) {
    logger.error('[admin:getUserStats]', error);
    res.status(500).json({ message: 'Failed to fetch user stats' });
  }
};

const deleteUserByAdmin = async (req, res) => {
  const targetUserId = req.params.id;
  try {
    const user = await User.findById(targetUserId).select('email _id');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await deleteMessages({ user: targetUserId });
    await deleteAllUserSessions({ userId: targetUserId });
    await Transaction.deleteMany({ user: targetUserId });
    await deleteUserKey({ userId: targetUserId, all: true });
    await Balance.deleteMany({ user: targetUserId });
    await deletePresets(targetUserId);
    try {
      await deleteConvos(targetUserId);
    } catch (error) {
      logger.error('[admin:deleteUser] Error deleting user convos (likely none)', error);
    }
    await deleteUserPluginAuth(targetUserId, null, true);
    await deleteAllSharedLinks(targetUserId);

    try {
      const userFiles = await getFiles({ user: targetUserId });
      await processDeleteRequest({ req, files: userFiles });
      await File.deleteMany({ user: targetUserId });
    } catch (error) {
      logger.error('[admin:deleteUser] Error deleting files', error);
    }

    await deleteUserById(targetUserId);

    logger.info(`[admin:deleteUser] User deleted by admin. ID: ${targetUserId}`);
    res.status(200).json({ message: 'User deleted' });
  } catch (err) {
    logger.error('[admin:deleteUser]', err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

const listUserConversations = async (req, res) => {
  try {
    const { id } = req.params;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const [total, convos] = await Promise.all([
      Conversation.countDocuments({ user: id }),
      Conversation.find({ user: id })
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);
    res.status(200).json({ page, limit, total, conversations: convos });
  } catch (error) {
    logger.error('[admin:listUserConversations]', error);
    res.status(500).json({ message: 'Failed to list user conversations' });
  }
};

const listUserMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const conversationId = req.query.conversationId;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const filter = { user: id };
    if (conversationId) {
      filter.conversationId = conversationId;
    }
    const [total, messages] = await Promise.all([
      Message.countDocuments(filter),
      Message.find(filter)
        .sort({ createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);
    res.status(200).json({ page, limit, total, messages });
  } catch (error) {
    logger.error('[admin:listUserMessages]', error);
    res.status(500).json({ message: 'Failed to list user messages' });
  }
};

/**
 * Aggregate token usage by model and token type for a user
 * GET /api/admin/users/:id/usage?from=ISO&to=ISO
 */
async function getUserUsage(req, res) {
  try {
    const { id } = req.params;
    const { from, to } = req.query || {};
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const match = { user: new mongoose.Types.ObjectId(id) };
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to) match.createdAt.$lte = new Date(to);
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: { model: '$model', tokenType: '$tokenType' },
          rawAmount: { $sum: '$rawAmount' },
          tokenValue: { $sum: '$tokenValue' },
        },
      },
      {
        $group: {
          _id: '$_id.model',
          promptTokens: {
            $sum: {
              $cond: [{ $eq: ['$_id.tokenType', 'prompt'] }, { $abs: '$rawAmount' }, 0],
            },
          },
          completionTokens: {
            $sum: {
              $cond: [{ $eq: ['$_id.tokenType', 'completion'] }, { $abs: '$rawAmount' }, 0],
            },
          },
          tokenValue: { $sum: '$tokenValue' },
        },
      },
      {
        $project: {
          _id: 0,
          model: '$_id',
          promptTokens: 1,
          completionTokens: 1,
          tokenValue: 1,
          totalTokens: { $add: ['$promptTokens', '$completionTokens'] },
        },
      },
      { $sort: { totalTokens: -1 } },
    ];

    const byModel = await Transaction.aggregate(pipeline);
    const totals = byModel.reduce(
      (acc, m) => {
        acc.promptTokens += m.promptTokens || 0;
        acc.completionTokens += m.completionTokens || 0;
        acc.tokenValue += m.tokenValue || 0;
        return acc;
      },
      { promptTokens: 0, completionTokens: 0, tokenValue: 0 },
    );

    return res.status(200).json({ byModel, totals });
  } catch (error) {
    logger.error('[admin:getUserUsage]', error);
    res.status(500).json({ message: 'Failed to fetch usage' });
  }
}

/**
 * List user login/logout activities
 */
const listUserActivities = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const userId = req.query.userId;
    const action = req.query.action;
    const from = req.query.from;
    const to = req.query.to;

    const filter = {};
    if (userId) filter.user = userId;
    if (action && ['LOGIN', 'LOGOUT'].includes(action)) filter.action = action;
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(to);
    }

    const [total, activities] = await Promise.all([
      UserActivityLog.countDocuments(filter),
      UserActivityLog.find(filter)
        .populate('user', 'email username name')
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    res.status(200).json({
      page,
      limit,
      total,
      activities: activities.map((activity) => ({
        _id: activity._id,
        user: activity.user,
        action: activity.action,
        timestamp: activity.timestamp,
        createdAt: activity.createdAt,
      })),
    });
  } catch (error) {
    logger.error('[admin:listUserActivities]', error);
    res.status(500).json({ message: 'Failed to list user activities' });
  }
};

/**
 * Get aggregated login/logout stats for a user
 */
const getUserActivityStats = async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const match = { user: new mongoose.Types.ObjectId(id) };
    if (from || to) {
      match.timestamp = {};
      if (from) match.timestamp.$gte = new Date(from);
      if (to) match.timestamp.$lte = new Date(to);
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          lastActivity: { $max: '$timestamp' },
        },
      },
    ];

    const stats = await UserActivityLog.aggregate(pipeline);

    const result = {
      userId: id,
      totalLogins: 0,
      totalLogouts: 0,
      lastLogin: null,
      lastLogout: null,
    };

    stats.forEach((stat) => {
      if (stat._id === 'LOGIN') {
        result.totalLogins = stat.count;
        result.lastLogin = stat.lastActivity;
      } else if (stat._id === 'LOGOUT') {
        result.totalLogouts = stat.count;
        result.lastLogout = stat.lastActivity;
      }
    });

    res.status(200).json(result);
  } catch (error) {
    logger.error('[admin:getUserActivityStats]', error);
    res.status(500).json({ message: 'Failed to fetch user activity stats' });
  }
};

module.exports = {
  listUsers,
  getUser,
  getUserStats,
  updateUserRole,
  deleteUserByAdmin,
  listUserConversations,
  listUserMessages,
  getUserUsage,
  listUserActivities,
  getUserActivityStats,
};
