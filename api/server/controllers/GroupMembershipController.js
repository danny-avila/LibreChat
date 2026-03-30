const { SystemRoles } = require('librechat-data-provider');
const { getUser, updateUser, getGroup } = require('../../models');
const { logger } = require('@librechat/data-schemas');

/**
 * Get group members
 */
const getGroupMembersHandler = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, limit = 10, search } = req.query;

    // Mock group members data for testing
    const mockMembers = [
      {
        _id: '507f1f77bcf86cd799439011',
        name: 'John Doe',
        email: 'john.doe@example.com',
        username: 'johndoe',
        avatar: null,
        role: 'USER',
        assignedAt: new Date(),
        assignedBy: {
          _id: '507f1f77bcf86cd799439012',
          name: 'Admin User',
          email: 'admin@example.com'
        }
      },
      {
        _id: '507f1f77bcf86cd799439013',
        name: 'Jane Smith',
        email: 'jane.smith@example.com',
        username: 'janesmith',
        avatar: null,
        role: 'USER',
        assignedAt: new Date(Date.now() - 86400000),
        assignedBy: {
          _id: '507f1f77bcf86cd799439012',
          name: 'Admin User',
          email: 'admin@example.com'
        }
      }
    ];

    const filteredMembers = search 
      ? mockMembers.filter(member => 
          member.name.toLowerCase().includes(search.toLowerCase()) ||
          member.email.toLowerCase().includes(search.toLowerCase())
        )
      : mockMembers;

    res.status(200).json({
      success: true,
      data: {
        members: filteredMembers,
        group: {
          _id: groupId,
          name: 'Sample Group',
          description: 'A sample group for testing',
          memberCount: filteredMembers.length,
        },
        pagination: {
          currentPage: parseInt(page, 10),
          totalPages: 1,
          totalItems: filteredMembers.length,
          itemsPerPage: parseInt(limit, 10),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching group members:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch group members',
      error: error.message,
    });
  }
};

/**
 * Add user to group
 */
const addUserToGroupHandler = async (req, res) => {
  try {
    const { groupId, userId } = req.params;
    const adminId = '507f1f77bcf86cd799439012'; // Mock admin ID for testing

    // Mock successful addition
    const membership = {
      userId,
      groupId,
      assignedAt: new Date(),
      assignedBy: adminId,
    };

    res.status(200).json({
      success: true,
      message: 'User added to group successfully',
      data: membership,
    });
  } catch (error) {
    logger.error('Error adding user to group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add user to group',
      error: error.message,
    });
  }
};

/**
 * Remove user from group
 */
const removeUserFromGroupHandler = async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    // Mock successful removal
    res.status(200).json({
      success: true,
      message: 'User removed from group successfully',
      data: {
        userId,
        groupId,
      },
    });
  } catch (error) {
    logger.error('Error removing user from group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove user from group',
      error: error.message,
    });
  }
};

/**
 * Bulk add users to group
 */
const bulkAddUsersToGroupHandler = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userIds } = req.body;
    const adminId = req.user.id;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User IDs array is required',
      });
    }

    const User = req.app.locals.User;
    const Group = req.app.locals.Group;

    // Check if group exists and is active
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    if (!group.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Cannot add users to inactive group',
      });
    }

    // Get all users and check which ones exist and aren't already members
    const users = await User.find({ _id: { $in: userIds } });
    const existingUserIds = users.map(u => u._id.toString());
    
    const notFoundUsers = userIds.filter(id => !existingUserIds.includes(id.toString()));
    
    const usersToAdd = users.filter(user => {
      const isAlreadyMember = user.groupMemberships?.some(
        membership => membership.groupId.toString() === groupId
      );
      return !isAlreadyMember;
    });

    const alreadyMembers = users.filter(user => {
      const isAlreadyMember = user.groupMemberships?.some(
        membership => membership.groupId.toString() === groupId
      );
      return isAlreadyMember;
    });

    // Add users to group
    if (usersToAdd.length > 0) {
      const membership = {
        groupId,
        assignedAt: new Date(),
        assignedBy: adminId,
      };

      await User.updateMany(
        { _id: { $in: usersToAdd.map(u => u._id) } },
        { 
          $push: { groupMemberships: membership },
          $unset: { effectiveTimeWindows: 1, lastAccessValidation: 1 },
        }
      );
    }

    // Update group member count
    await group.updateMemberCount();

    res.status(200).json({
      success: true,
      message: `Bulk operation completed. Added ${usersToAdd.length} users to group.`,
      data: {
        groupId,
        added: usersToAdd.length,
        alreadyMembers: alreadyMembers.length,
        notFound: notFoundUsers.length,
        details: {
          addedUsers: usersToAdd.map(u => ({ id: u._id, name: u.name, email: u.email })),
          alreadyMemberUsers: alreadyMembers.map(u => ({ id: u._id, name: u.name, email: u.email })),
          notFoundUserIds: notFoundUsers,
        },
      },
    });
  } catch (error) {
    logger.error('Error in bulk add users to group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk add users to group',
      error: error.message,
    });
  }
};

/**
 * Get user's groups
 */
const getUserGroupsHandler = async (req, res) => {
  try {
    const { userId } = req.params;

    // Mock user groups data
    const mockGroups = [
      {
        _id: '507f1f77bcf86cd799439020',
        name: 'Developers',
        description: 'Development team group',
        isActive: true,
        timeWindows: [],
        memberCount: 15,
        assignedAt: new Date(Date.now() - 2629746000), // 1 month ago
        assignedBy: {
          _id: '507f1f77bcf86cd799439012',
          name: 'Admin User',
          email: 'admin@example.com'
        }
      },
      {
        _id: '507f1f77bcf86cd799439021',
        name: 'QA Team',
        description: 'Quality Assurance team',
        isActive: true,
        timeWindows: [],
        memberCount: 8,
        assignedAt: new Date(Date.now() - 1814400000), // 3 weeks ago
        assignedBy: {
          _id: '507f1f77bcf86cd799439012',
          name: 'Admin User',
          email: 'admin@example.com'
        }
      }
    ];

    res.status(200).json({
      success: true,
      data: {
        userId,
        userName: 'Test User',
        userEmail: 'test.user@example.com',
        groups: mockGroups,
        totalGroups: mockGroups.length,
        activeGroups: mockGroups.filter(g => g.isActive).length,
      },
    });
  } catch (error) {
    logger.error('Error fetching user groups:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user groups',
      error: error.message,
    });
  }
};

module.exports = {
  getGroupMembersHandler,
  addUserToGroupHandler,
  removeUserFromGroupHandler,
  bulkAddUsersToGroupHandler,
  getUserGroupsHandler,
};