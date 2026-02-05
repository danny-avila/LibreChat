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
      .select('email username name role groups provider createdAt emailVerified avatar')
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
 * Supports system roles (ADMIN, USER) and custom group names
 * @param {object} req - Express Request
 * @param {object} res - Express Response
 */
const updateUserRoleController = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    // Validate role - allow system roles and custom group names
    if (!role || typeof role !== 'string' || role.trim().length === 0) {
      return res.status(400).json({ message: 'Invalid role. Role cannot be empty' });
    }

    // Prevent admin from changing their own role
    if (userId === req.user.id) {
      return res.status(403).json({ message: 'You cannot change your own role' });
    }

    const user = await User.findByIdAndUpdate(userId, { role: role.trim() }, { new: true }).select(
      'email username name role groups',
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
 * Update user groups (admin only)
 * Allows adding user to multiple groups
 * @param {object} req - Express Request
 * @param {object} res - Express Response
 */
const updateUserGroupsController = async (req, res) => {
  try {
    const { userId } = req.params;
    const { groups } = req.body;

    // Validate groups - must be an array of strings
    if (!groups || !Array.isArray(groups)) {
      return res.status(400).json({ message: 'Invalid groups. Groups must be an array' });
    }

    // Filter out empty strings and trim values
    const validGroups = groups.filter((g) => typeof g === 'string' && g.trim().length > 0).map((g) => g.trim());

    // Prevent admin from changing their own groups
    if (userId === req.user.id) {
      return res.status(403).json({ message: 'You cannot change your own groups' });
    }

    const user = await User.findByIdAndUpdate(userId, { groups: validGroups }, { new: true }).select(
      'email username name role groups',
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    logger.info(`[updateUserGroupsController] User groups updated: ${user.email} to [${validGroups.join(', ')}]`);
    res.status(200).json({ message: 'User groups updated successfully', user });
  } catch (error) {
    logger.error('[updateUserGroupsController] Error updating user groups:', error);
    res.status(500).json({ message: 'Error updating user groups' });
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

    // Debug log to check what messages are being returned
    logger.info(`[getConversationMessagesController] Found ${messages.length} messages for conversation ${conversationId}`);
    messages.forEach((msg, idx) => {
      logger.info(`[getConversationMessagesController] Message ${idx}: isCreatedByUser=${msg.isCreatedByUser}, hasContent=${!!msg.content}, hasText=${!!msg.text}`);
    });

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

// In-memory storage for custom groups (in production, use a database collection)
let customGroups = [];

/**
 * List all custom groups (admin only)
 * @param {object} req - Express Request
 * @param {object} res - Express Response
 */
const listGroupsController = async (req, res) => {
  try {
    // Get groups from config or in-memory storage
    // Also get unique groups from users' groups array
    const systemRoles = [SystemRoles.ADMIN, SystemRoles.USER];
    
    // Get all unique groups from users' groups array
    const usersWithGroups = await User.distinct('groups');
    const customGroupsFromUsers = usersWithGroups.filter(
      (group) => group && !systemRoles.includes(group),
    );

    // Merge custom groups with groups found in users
    const allGroups = [...new Set([...customGroups, ...customGroupsFromUsers])];

    res.status(200).json({
      groups: allGroups.map((name) => ({ name })),
      systemRoles: systemRoles,
    });
  } catch (error) {
    logger.error('[listGroupsController] Error listing groups:', error);
    res.status(500).json({ message: 'Error listing groups' });
  }
};

/**
 * Create a new custom group (admin only)
 * @param {object} req - Express Request
 * @param {object} res - Express Response
 */
const createGroupController = async (req, res) => {
  try {
    const { name } = req.body;

    // Validate group name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'Group name is required' });
    }

    const groupName = name.trim();

    // Check if it's a system role
    if ([SystemRoles.ADMIN, SystemRoles.USER].includes(groupName.toUpperCase())) {
      return res.status(400).json({ message: 'Cannot create a group with a system role name' });
    }

    // Check if group already exists
    if (customGroups.includes(groupName)) {
      return res.status(409).json({ message: 'Group already exists' });
    }

    customGroups.push(groupName);

    logger.info(`[createGroupController] Group created: ${groupName}`);
    res.status(201).json({ message: 'Group created successfully', group: { name: groupName } });
  } catch (error) {
    logger.error('[createGroupController] Error creating group:', error);
    res.status(500).json({ message: 'Error creating group' });
  }
};

/**
 * Delete a custom group (admin only)
 * @param {object} req - Express Request
 * @param {object} res - Express Response
 */
const deleteGroupController = async (req, res) => {
  try {
    const { groupName } = req.params;

    // Decode the group name (in case it has special characters)
    const decodedName = decodeURIComponent(groupName);

    // Check if it's a system role
    if ([SystemRoles.ADMIN, SystemRoles.USER].includes(decodedName.toUpperCase())) {
      return res.status(400).json({ message: 'Cannot delete a system role' });
    }

    // Remove from custom groups
    customGroups = customGroups.filter((g) => g !== decodedName);

    // Optionally: Remove this group from all users' groups array
    const { resetUsers } = req.query;
    if (resetUsers === 'true') {
      // Pull the group from all users' groups arrays
      await User.updateMany(
        { groups: decodedName },
        { $pull: { groups: decodedName } }
      );
      logger.info(`[deleteGroupController] Removed group ${decodedName} from all users`);
    }

    logger.info(`[deleteGroupController] Group deleted: ${decodedName}`);
    res.status(200).json({ message: 'Group deleted successfully' });
  } catch (error) {
    logger.error('[deleteGroupController] Error deleting group:', error);
    res.status(500).json({ message: 'Error deleting group' });
  }
};

/**
 * Get users by group/role (admin only)
 * @param {object} req - Express Request
 * @param {object} res - Express Response
 */
const getUsersByGroupController = async (req, res) => {
  try {
    const { groupName } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const decodedName = decodeURIComponent(groupName);

    // Query users where groups array contains the specified group
    const users = await User.find({ groups: decodedName })
      .select('email username name role groups provider createdAt emailVerified avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await User.countDocuments({ groups: decodedName });

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
    logger.error('[getUsersByGroupController] Error getting users by group:', error);
    res.status(500).json({ message: 'Error getting users by group' });
  }
};

module.exports = {
  listUsersController,
  createAdminUserController,
  updateUserRoleController,
  updateUserGroupsController,
  deleteUserByAdminController,
  listAllConversationsController,
  getConversationMessagesController,
  listGroupsController,
  createGroupController,
  deleteGroupController,
  getUsersByGroupController,
};
