const { logger } = require('@librechat/data-schemas');
const { SystemRoles, EModelEndpoint } = require('librechat-data-provider');
const { User, Conversation, Message } = require('~/db/models');
const { registerUser } = require('~/server/services/AuthService');

/**
 * List all users (admin only)
 * @param {object} req - Express Request
 * @param {object} res - Express Response
 */
const listUsersController = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = {};
    if (search) {
      query = {
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } },
        ],
      };
    }

    const users = await User.find(query)
      .select('email username name role provider createdAt emailVerified avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await User.countDocuments(query);

    res.status(200).json({
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('[listUsersController] Error listing users:', error);
    res.status(500).json({ message: 'Error listing users' });
  }
};

/**
 * Create a new admin user (admin only)
 * @param {object} req - Express Request
 * @param {object} res - Express Response
 */
const createAdminUserController = async (req, res) => {
  try {
    const { email, name, username, password } = req.body;

    // Validate required fields
    if (!email || !name || !username || !password) {
      return res.status(400).json({
        message: 'Missing required fields: email, name, username, and password are required',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'User with this email already exists' });
    }

    // Check if username is taken
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(409).json({ message: 'Username already taken' });
    }

    // Create the admin user
    const user = await registerUser({
      email,
      password,
      name,
      username,
      role: SystemRoles.ADMIN,
      emailVerified: true,
    });

    // Return user data without sensitive fields
    const userData = {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    };

    logger.info(`[createAdminUserController] Admin user created: ${email}`);
    res.status(201).json({ message: 'Admin user created successfully', user: userData });
  } catch (error) {
    logger.error('[createAdminUserController] Error creating admin user:', error);
    res.status(500).json({ message: 'Error creating admin user' });
  }
};

/**
 * Update user role (admin only)
 * @param {object} req - Express Request
 * @param {object} res - Express Response
 */
const updateUserRoleController = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    // Validate role
    if (!role || ![SystemRoles.ADMIN, SystemRoles.USER].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be ADMIN or USER' });
    }

    // Prevent admin from changing their own role
    if (userId === req.user.id) {
      return res.status(403).json({ message: 'You cannot change your own role' });
    }

    const user = await User.findByIdAndUpdate(userId, { role }, { new: true }).select(
      'email username name role',
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    logger.info(`[updateUserRoleController] User role updated: ${user.email} to ${role}`);
    res.status(200).json({ message: 'User role updated successfully', user });
  } catch (error) {
    logger.error('[updateUserRoleController] Error updating user role:', error);
    res.status(500).json({ message: 'Error updating user role' });
  }
};

/**
 * Delete user (admin only)
 * @param {object} req - Express Request
 * @param {object} res - Express Response
 */
const deleteUserByAdminController = async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent admin from deleting themselves
    if (userId === req.user.id) {
      return res.status(403).json({ message: 'You cannot delete your own account' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await User.findByIdAndDelete(userId);

    logger.info(`[deleteUserByAdminController] User deleted: ${user.email}`);
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('[deleteUserByAdminController] Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
};

/**
 * Get all users' assistant conversations (admin only)
 * @param {object} req - Express Request
 * @param {object} res - Express Response
 */
const listAllConversationsController = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      userId, 
      search = '',
      endpoint,
      sortBy = 'updatedAt',
      sortDirection = 'desc'
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    let query = {};
    
    // Filter by user if specified
    if (userId) {
      query.user = userId;
    }
    
    // Filter by endpoint (assistants, azureAssistants, agents, etc.)
    if (endpoint) {
      query.endpoint = endpoint;
    } else {
      // By default, show assistants and agents conversations
      query.endpoint = { 
        $in: [
          EModelEndpoint.assistants, 
          EModelEndpoint.azureAssistants,
          EModelEndpoint.agents
        ] 
      };
    }

    // Exclude temporary/expired conversations
    query.$or = [{ expiredAt: null }, { expiredAt: { $exists: false } }];

    // Search by title
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    // Build sort
    const validSortFields = ['title', 'createdAt', 'updatedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'updatedAt';
    const sortOrder = sortDirection === 'asc' ? 1 : -1;

    const conversations = await Conversation.find(query)
      .select('conversationId title endpoint user model agent_id assistant_id createdAt updatedAt')
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get user info for each conversation
    const userIds = [...new Set(conversations.map(c => c.user.toString()))];
    const users = await User.find({ _id: { $in: userIds } })
      .select('_id email name username avatar')
      .lean();
    
    const userMap = {};
    users.forEach(u => {
      userMap[u._id.toString()] = u;
    });

    // Attach user info to conversations
    const conversationsWithUsers = conversations.map(convo => ({
      ...convo,
      userInfo: userMap[convo.user.toString()] || null,
    }));

    const total = await Conversation.countDocuments(query);

    res.status(200).json({
      conversations: conversationsWithUsers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('[listAllConversationsController] Error listing conversations:', error);
    res.status(500).json({ message: 'Error listing conversations' });
  }
};

/**
 * Get conversation messages by conversationId (admin only)
 * @param {object} req - Express Request
 * @param {object} res - Express Response
 */
const getConversationMessagesController = async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Get conversation first to verify it exists
    const conversation = await Conversation.findOne({ conversationId }).lean();
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Get user info
    const user = await User.findById(conversation.user)
      .select('email name username avatar')
      .lean();

    // Get all messages for this conversation
    const messages = await Message.find({ conversationId })
      .select('-__v')
      .sort({ createdAt: 1 })
      .lean();

    res.status(200).json({
      conversation: {
        ...conversation,
        userInfo: user,
      },
      messages,
    });
  } catch (error) {
    logger.error('[getConversationMessagesController] Error getting messages:', error);
    res.status(500).json({ message: 'Error getting conversation messages' });
  }
};

module.exports = {
  listUsersController,
  createAdminUserController,
  updateUserRoleController,
  deleteUserByAdminController,
  listAllConversationsController,
  getConversationMessagesController,
};
