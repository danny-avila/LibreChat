const { logger } = require('@librechat/data-schemas');

/**
 * Get groups with filtering and pagination
 * @param {Object} filter - MongoDB filter object
 * @param {Object} options - Query options (pagination, sorting, population)
 * @returns {Promise<Object>} Paginated groups result
 */
const getGroups = async (filter = {}, options = {}) => {
  try {
    const models = require('~/db/models');
    const { Group } = models;
    
    // Check if Group model is available
    if (!Group) {
      logger.warn('Group model not available, returning empty result');
      return {
        groups: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: 10,
        },
      };
    }

    const {
      page = 1,
      limit = 10,
      sort = { name: 1 },
      populate = [],
    } = options;

    const skip = (page - 1) * limit;
    
    const [groups, total] = await Promise.all([
      Group.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate(populate)
        .lean(),
      Group.countDocuments(filter),
    ]);

    return {
      groups,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
      },
    };
  } catch (error) {
    logger.error('Error in getGroups:', error);
    throw new Error('Failed to fetch groups');
  }
};

/**
 * Get single group by filter
 * @param {Object} filter - MongoDB filter object
 * @param {Object} options - Query options
 * @returns {Promise<Object|null>} Group document or null
 */
const getGroup = async (filter, options = {}) => {
  try {
    const models = require('~/db/models');
    const { Group } = models;
    
    // Check if Group model is available
    if (!Group) {
      logger.warn('Group model not available, returning null');
      return null;
    }

    const { populate = [], lean = true } = options;

    let query = Group.findOne(filter);
    
    if (populate.length > 0) {
      query = query.populate(populate);
    }
    
    if (lean) {
      query = query.lean();
    }

    return await query.exec();
  } catch (error) {
    logger.error('Error in getGroup:', error);
    throw new Error('Failed to fetch group');
  }
};

/**
 * Create new group
 * @param {Object} groupData - Group data object
 * @returns {Promise<Object>} Created group document
 */
const createGroup = async (groupData) => {
  try {
    const models = require('~/db/models');
    const { Group } = models;
    
    // Check if Group model is available
    if (!Group) {
      logger.warn('Group model not available, cannot create group');
      throw new Error('Group model not available');
    }
    
    const group = new Group(groupData);
    const savedGroup = await group.save();
    
    // Populate created group
    return await Group.findById(savedGroup._id)
      .populate([
        { path: 'createdBy', select: 'name email' },
      ])
      .lean();
  } catch (error) {
    logger.error('Error in createGroup:', error);
    if (error.code === 11000) {
      throw new Error('Group with this name already exists');
    }
    throw new Error('Failed to create group');
  }
};

/**
 * Update group by filter
 * @param {Object} filter - MongoDB filter object
 * @param {Object} updateData - Data to update
 * @param {Object} options - Update options
 * @returns {Promise<Object|null>} Updated group document
 */
const updateGroup = async (filter, updateData, options = {}) => {
  try {
    const models = require('~/db/models');
    const { Group } = models;
    
    // Check if Group model is available
    if (!Group) {
      logger.warn('Group model not available');
      throw new Error('Group model not available');
    }
    
    const updatedGroup = await Group.findOneAndUpdate(
      filter,
      { $set: updateData },
      { new: true, runValidators: true, ...options }
    )
      .populate([
        { path: 'createdBy', select: 'name email' },
        { path: 'updatedBy', select: 'name email' },
      ])
      .lean();

    return updatedGroup;
  } catch (error) {
    logger.error('Error in updateGroup:', error);
    if (error.code === 11000) {
      throw new Error('Group with this name already exists');
    }
    throw new Error('Failed to update group');
  }
};

/**
 * Delete group by filter
 * @param {Object} filter - MongoDB filter object
 * @returns {Promise<boolean>} Success status
 */
const deleteGroup = async (filter) => {
  try {
    const models = require('~/db/models');
    const { Group } = models;
    
    // Check if Group model is available
    if (!Group) {
      logger.warn('Group model not available');
      throw new Error('Group model not available');
    }
    
    const result = await Group.deleteOne(filter);
    return result.deletedCount > 0;
  } catch (error) {
    logger.error('Error in deleteGroup:', error);
    throw new Error('Failed to delete group');
  }
};

/**
 * Add time window to group
 * @param {string} groupId - Group ID
 * @param {Object} timeWindowData - Time window data
 * @returns {Promise<Object>} Updated group document
 */
const addTimeWindow = async (groupId, timeWindowData) => {
  try {
    const models = require('~/db/models');
    const { Group } = models;
    
    // Check if Group model is available
    if (!Group) {
      logger.warn('Group model not available');
      throw new Error('Group model not available');
    }
    
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { 
        $push: { 
          timeWindows: {
            ...timeWindowData,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        }
      },
      { new: true, runValidators: true }
    ).lean();

    return updatedGroup;
  } catch (error) {
    logger.error('Error in addTimeWindow:', error);
    throw new Error('Failed to add time window');
  }
};

/**
 * Update time window in group
 * @param {string} groupId - Group ID
 * @param {string} timeWindowId - Time window ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated group document
 */
const updateTimeWindow = async (groupId, timeWindowId, updateData) => {
  try {
    const models = require('~/db/models');
    const { Group } = models;
    
    // Check if Group model is available
    if (!Group) {
      logger.warn('Group model not available');
      throw new Error('Group model not available');
    }
    
    const updatedGroup = await Group.findOneAndUpdate(
      { _id: groupId, 'timeWindows._id': timeWindowId },
      { 
        $set: {
          'timeWindows.$.name': updateData.name,
          'timeWindows.$.windowType': updateData.windowType,
          'timeWindows.$.startTime': updateData.startTime,
          'timeWindows.$.endTime': updateData.endTime,
          'timeWindows.$.daysOfWeek': updateData.daysOfWeek,
          'timeWindows.$.startDate': updateData.startDate,
          'timeWindows.$.endDate': updateData.endDate,
          'timeWindows.$.timezone': updateData.timezone,
          'timeWindows.$.isActive': updateData.isActive,
          'timeWindows.$.updatedAt': new Date(),
        }
      },
      { new: true, runValidators: true }
    ).lean();

    return updatedGroup;
  } catch (error) {
    logger.error('Error in updateTimeWindow:', error);
    throw new Error('Failed to update time window');
  }
};

/**
 * Remove time window from group
 * @param {string} groupId - Group ID
 * @param {string} timeWindowId - Time window ID
 * @returns {Promise<Object>} Updated group document
 */
const removeTimeWindow = async (groupId, timeWindowId) => {
  try {
    const models = require('~/db/models');
    const { Group } = models;
    
    // Check if Group model is available
    if (!Group) {
      logger.warn('Group model not available');
      throw new Error('Group model not available');
    }
    
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { $pull: { timeWindows: { _id: timeWindowId } } },
      { new: true }
    ).lean();

    return updatedGroup;
  } catch (error) {
    logger.error('Error in removeTimeWindow:', error);
    throw new Error('Failed to remove time window');
  }
};

/**
 * Get groups by user membership
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} User's groups
 */
const getUserGroups = async (userId, options = {}) => {
  try {
    const { User } = require('~/db/models');
    const { lean = true } = options;

    let query = User.findById(userId)
      .select('groupMemberships')
      .populate({
        path: 'groupMemberships.groupId',
        select: 'name description isActive timeWindows memberCount',
        match: { isActive: true },
      });

    if (lean) {
      query = query.lean();
    }

    const user = await query.exec();
    
    if (!user) {
      return [];
    }

    return user.groupMemberships
      .filter(membership => membership.groupId) // Filter out null refs
      .map(membership => ({
        ...membership.groupId,
        assignedAt: membership.assignedAt,
        assignedBy: membership.assignedBy,
      }));
  } catch (error) {
    logger.error('Error in getUserGroups:', error);
    throw new Error('Failed to fetch user groups');
  }
};

/**
 * Get group statistics
 * @returns {Promise<Object>} Group statistics
 */
const getGroupStats = async () => {
  try {
    const models = require('~/db/models');
    const { Group } = models;
    
    // Check if Group model is available
    if (!Group) {
      logger.warn('Group model not available');
      throw new Error('Group model not available');
    }
    
    const [totalGroups, activeGroups, groupsWithTimeWindows] = await Promise.all([
      Group.countDocuments({}),
      Group.countDocuments({ isActive: true }),
      Group.countDocuments({ 'timeWindows.0': { $exists: true } })
    ]);

    // Calculate total members by aggregating across all groups
    const memberStats = await Group.aggregate([
      {
        $group: {
          _id: null,
          totalMembers: { $sum: '$memberCount' },
          avgMembersPerGroup: { $avg: '$memberCount' }
        }
      }
    ]);

    const stats = memberStats[0] || { totalMembers: 0, avgMembersPerGroup: 0 };

    return {
      totalGroups,
      activeGroups,
      totalMembers: stats.totalMembers,
      averageMembersPerGroup: Math.round(stats.avgMembersPerGroup * 10) / 10,
      groupsWithTimeWindows
    };
  } catch (error) {
    logger.error('Error in getGroupStats:', error);
    throw new Error('Failed to fetch group statistics');
  }
};

/**
 * Get users available for group membership (Entra ID users only)
 * @param {Object} filter - MongoDB filter object
 * @returns {Promise<Array>} Available users
 */
const getAvailableUsers = async (filter = {}) => {
  try {
    const models = require('~/db/models');
    const { User } = models;
    
    if (!User) {
      logger.warn('User model not available, returning empty result');
      return [];
    }

    // Only get Entra ID users (openid provider)
    const entraFilter = {
      provider: 'openid',
      ...filter,
    };

    const users = await User.find(entraFilter, {
      _id: 1,
      name: 1,
      email: 1,
      avatar: 1,
      provider: 1,
    }).lean();

    return users;
  } catch (error) {
    logger.error('Error getting available users:', error);
    throw error;
  }
};

/**
 * Get group members
 * @param {string} groupId - Group ID
 * @returns {Promise<Array>} Group members
 */
const getGroupMembers = async (groupId) => {
  try {
    const models = require('~/db/models');
    const { User } = models;
    
    if (!User) {
      logger.warn('User model not available, returning empty result');
      return [];
    }

    // Find all users who have this group in their groupMemberships
    const members = await User.find(
      { 
        'groupMemberships.groupId': groupId,
        provider: 'openid' // Only Entra ID users
      },
      'name email avatar provider'
    ).lean();

    return members || [];
  } catch (error) {
    logger.error('Error getting group members:', error);
    throw error;
  }
};

/**
 * Add user to group
 * @param {string} groupId - Group ID
 * @param {string} userId - User ID
 * @param {string} assignedBy - ID of user who is assigning
 * @returns {Promise<Object>} Updated user with group membership
 */
const addUserToGroup = async (groupId, userId, assignedBy = null) => {
  try {
    const { Group, User } = require('../db/models');
    
    if (!Group || !User) {
      logger.warn('Required models not available');
      throw new Error('Required models not available');
    }

    // Verify group exists
    const group = await Group.findById(groupId);
    if (!group) {
      throw new Error('Group not found');
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user is already in group
    const existingMembership = user.groupMemberships?.find(
      membership => membership.groupId.toString() === groupId
    );
    if (existingMembership) {
      throw new Error('User is already a member of this group');
    }

    // Add group membership to user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        $push: { 
          groupMemberships: {
            groupId: groupId,
            assignedAt: new Date(),
            assignedBy: assignedBy || userId
          }
        }
      },
      { new: true }
    );

    // Update group members array and member count
    const memberCount = await User.countDocuments({
      'groupMemberships.groupId': groupId
    });
    
    // Add user to group's members array
    await Group.findByIdAndUpdate(
      groupId, 
      { 
        $addToSet: { members: userId },
        memberCount: memberCount
      }
    );

    return { user: updatedUser, group };
  } catch (error) {
    logger.error('Error adding user to group:', error);
    throw error;
  }
};

/**
 * Remove user from group
 * @param {string} groupId - Group ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Updated user
 */
const removeUserFromGroup = async (groupId, userId) => {
  try {
    const { Group, User } = require('../db/models');
    
    if (!Group || !User) {
      logger.warn('Required models not available');
      throw new Error('Required models not available');
    }

    // Remove group membership from user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        $pull: { 
          groupMemberships: { groupId: groupId }
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      throw new Error('User not found');
    }

    // Update group members array and member count
    const memberCount = await User.countDocuments({
      'groupMemberships.groupId': groupId
    });
    
    // Remove user from group's members array
    await Group.findByIdAndUpdate(
      groupId,
      {
        $pull: { members: userId },
        memberCount: memberCount
      }
    );

    return updatedUser;
  } catch (error) {
    logger.error('Error removing user from group:', error);
    throw error;
  }
};

/**
 * Resolve pending email memberships for a user who just logged in.
 * Finds all groups that have this email in pendingEmails, adds the user
 * to each group, and removes the email from pendingEmails.
 * Errors are caught per-group so one failure does not block the rest.
 *
 * @param {string} email - The user's email address (will be lowercased)
 * @param {string} userId - The user's MongoDB ObjectId string
 */
const resolvePendingMemberships = async (email, userId) => {
  if (!email || !userId) return;
  const normalizedEmail = email.toLowerCase();
  try {
    const { Group } = require('../db/models');
    if (!Group) return;
    const groups = await Group.find({ pendingEmails: normalizedEmail }).lean();
    if (!groups.length) return;
    for (const group of groups) {
      try {
        await addUserToGroup(group._id.toString(), userId, userId);
        await Group.findByIdAndUpdate(group._id, { $pull: { pendingEmails: normalizedEmail } });
        logger.info(`[resolvePendingMemberships] Added ${email} to group ${group.name}`);
      } catch (err) {
        logger.error(`[resolvePendingMemberships] Failed to resolve group ${group._id}: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`[resolvePendingMemberships] Outer error: ${err.message}`);
  }
};

/**
 * Remove a pending email from a group.
 * @param {string} groupId - Group ID
 * @param {string} email - Email to remove (case-insensitive)
 */
const removePendingEmail = async (groupId, email) => {
  const { Group } = require('../db/models');
  await Group.findByIdAndUpdate(groupId, { $pull: { pendingEmails: email.toLowerCase() } });
};

module.exports = {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addTimeWindow,
  updateTimeWindow,
  removeTimeWindow,
  getUserGroups,
  getGroupStats,
  getAvailableUsers,
  getGroupMembers,
  addUserToGroup,
  removeUserFromGroup,
  resolvePendingMemberships,
  removePendingEmail,
};