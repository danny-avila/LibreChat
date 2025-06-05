const mongoose = require('mongoose');
const User = require('./User');
const Group = require('./Group');
const { searchUsers } = require('./userMethods');
const { logger } = require('~/config');
/**
 * @import { TPrincipalSearchResult } from 'librechat-data-provider'
 * @import { TUser } from 'librechat-data-provider'
 * @import { IGroup } from '@librechat/data-schemas'
 */

/**
 * Find a group by its ID
 * @param {string|mongoose.Types.ObjectId} groupId - The group ID
 * @param {Object} projection - Optional projection of fields to return
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<Object|null>} The group document or null if not found
 */
const findGroupById = async function (groupId, projection = {}, session = null) {
  const query = Group.findOne({ _id: groupId }, projection);
  if (session) {
    query.session(session);
  }
  return await query.lean();
};

/**
 * Find a group by its external ID (e.g., Entra ID)
 * @param {string} idOnTheSource - The external ID
 * @param {string} source - The source ('entra' or 'local')
 * @param {Object} projection - Optional projection of fields to return
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<Object|null>} The group document or null if not found
 */
const findGroupByExternalId = async function (
  idOnTheSource,
  source = 'entra',
  projection = {},
  session = null,
) {
  const query = Group.findOne({ idOnTheSource, source }, projection);
  if (session) {
    query.session(session);
  }
  return await query.lean();
};

/**
 * Find groups by name pattern (case-insensitive partial match)
 * @param {string} namePattern - The name pattern to search for
 * @param {string} source - Optional source filter ('entra', 'local', or null for all)
 * @param {number} limit - Maximum number of results to return
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<Array>} Array of matching groups
 */
const findGroupsByNamePattern = async function (
  namePattern,
  source = null,
  limit = 20,
  session = null,
) {
  const regex = new RegExp(namePattern, 'i');
  const query = {
    $or: [{ name: regex }, { email: regex }, { description: regex }],
  };

  if (source) {
    query.source = source;
  }

  const dbQuery = Group.find(query).limit(limit);
  if (session) {
    dbQuery.session(session);
  }
  return await dbQuery.lean();
};

/**
 * Find all groups a user is a member of by their ID or idOnTheSource
 * @param {string|mongoose.Types.ObjectId} userId - The user ID
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<Array>} Array of groups the user is a member of
 */
const findGroupsByMemberId = async function (userId, session = null) {
  const userQuery = User.findById(userId, 'idOnTheSource');
  if (session) {
    userQuery.session(session);
  }
  const user = await userQuery.lean();

  if (!user) {
    return [];
  }

  const userIdOnTheSource = user.idOnTheSource || userId.toString();

  const query = Group.find({ memberIds: userIdOnTheSource });
  if (session) {
    query.session(session);
  }
  return await query.lean();
};

/**
 * Create a new group
 * @param {Object} groupData - Group data including name, source, and optional idOnTheSource
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<Object>} The created group
 */
const createGroup = async function (groupData, session = null) {
  const options = session ? { session } : {};
  return await Group.create([groupData], options).then((groups) => groups[0]);
};

/**
 * Update or create a group by external ID
 * @param {string} idOnTheSource - The external ID
 * @param {string} source - The source ('entra' or 'local')
 * @param {Object} updateData - Data to update or set if creating
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<Object>} The updated or created group
 */
const upsertGroupByExternalId = async function (idOnTheSource, source, updateData, session = null) {
  const options = {
    new: true,
    upsert: true,
  };

  if (session) {
    options.session = session;
  }

  return await Group.findOneAndUpdate({ idOnTheSource, source }, { $set: updateData }, options);
};

/**
 * Add a user to a group
 * Only updates Group.memberIds (one-way relationship)
 * Note: memberIds stores idOnTheSource values, not ObjectIds
 *
 * @param {string|mongoose.Types.ObjectId} userId - The user ID
 * @param {string|mongoose.Types.ObjectId} groupId - The group ID to add
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<{user: Object, group: Object}>} The user and updated group documents
 */
const addUserToGroup = async function (userId, groupId, session = null) {
  const options = { new: true };
  if (session) {
    options.session = session;
  }

  const user = await User.findById(userId, 'idOnTheSource', options).lean();
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const userIdOnTheSource = user.idOnTheSource || userId.toString();
  const updatedGroup = await Group.findByIdAndUpdate(
    groupId,
    { $addToSet: { memberIds: userIdOnTheSource } },
    options,
  ).lean();

  return { user: user, group: updatedGroup };
};

/**
 * Remove a user from a group
 * Only updates Group.memberIds (one-way relationship)
 * Note: memberIds stores idOnTheSource values, not ObjectIds
 *
 * @param {string|mongoose.Types.ObjectId} userId - The user ID
 * @param {string|mongoose.Types.ObjectId} groupId - The group ID to remove
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<{user: Object, group: Object}>} The user and updated group documents
 */
const removeUserFromGroup = async function (userId, groupId, session = null) {
  const options = { new: true };
  if (session) {
    options.session = session;
  }

  const user = await User.findById(userId, 'idOnTheSource', options).lean();
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const userIdOnTheSource = user.idOnTheSource || userId.toString();
  const updatedGroup = await Group.findByIdAndUpdate(
    groupId,
    { $pull: { memberIds: userIdOnTheSource } },
    options,
  ).lean();

  return { user: user, group: updatedGroup };
};

/**
 * Get all groups a user is a member of
 * @param {string|mongoose.Types.ObjectId} userId - The user ID
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<Array>} Array of group documents
 */
const getUserGroups = async function (userId, session = null) {
  return await findGroupsByMemberId(userId, session);
};

/**
 * Get a list of all principal identifiers for a user (user ID + group IDs + public)
 * For use in permission checks
 * @param {string|mongoose.Types.ObjectId} userId - The user ID
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<Array<Object>>} Array of principal objects with type and id
 */
const getUserPrincipals = async function (userId, session = null) {
  const principals = [{ principalType: 'user', principalId: userId }];

  const userGroups = await getUserGroups(userId, session);
  if (userGroups && userGroups.length > 0) {
    userGroups.forEach((group) => {
      principals.push({ principalType: 'group', principalId: group._id.toString() });
    });
  }

  principals.push({ principalType: 'public', principalId: null });

  return principals;
};

/**
 * Sync a user's Entra ID group memberships
 * @param {string|mongoose.Types.ObjectId} userId - The user ID
 * @param {Array<Object>} entraGroups - Array of Entra groups with id and name
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<Object>} The updated user with new group memberships
 */
const syncUserEntraGroups = async function (userId, entraGroups, session = null) {
  const options = { new: true };
  if (session) {
    options.session = session;
  }

  const query = User.findById(userId, { idOnTheSource: 1 });
  if (session) {
    query.session(session);
  }
  const user = await query.lean();

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Get user's idOnTheSource for storing in group.memberIds
  const userIdOnTheSource = user.idOnTheSource || userId.toString();

  const entraIdMap = new Map();
  const addedGroups = [];
  const removedGroups = [];

  for (const entraGroup of entraGroups) {
    entraIdMap.set(entraGroup.id, true);

    let group = await findGroupByExternalId(entraGroup.id, 'entra', null, session);

    if (!group) {
      group = await createGroup(
        {
          name: entraGroup.name,
          description: entraGroup.description,
          email: entraGroup.email,
          idOnTheSource: entraGroup.id,
          source: 'entra',
          memberIds: [userIdOnTheSource],
        },
        session,
      );

      addedGroups.push(group);
    } else if (!group.memberIds?.includes(userIdOnTheSource)) {
      const { group: updatedGroup } = await addUserToGroup(userId, group._id, session);
      addedGroups.push(updatedGroup);
    }
  }

  const groupsQuery = Group.find(
    { source: 'entra', memberIds: userIdOnTheSource },
    { _id: 1, idOnTheSource: 1 },
  );
  if (session) {
    groupsQuery.session(session);
  }
  const existingGroups = await groupsQuery.lean();

  for (const group of existingGroups) {
    if (group.idOnTheSource && !entraIdMap.has(group.idOnTheSource)) {
      const { group: removedGroup } = await removeUserFromGroup(userId, group._id, session);
      removedGroups.push(removedGroup);
    }
  }

  const userQuery = User.findById(userId);
  if (session) {
    userQuery.session(session);
  }
  const updatedUser = await userQuery.lean();

  return {
    user: updatedUser,
    addedGroups,
    removedGroups,
  };
};

/**
 * Calculate relevance score for a search result
 * @param {TPrincipalSearchResult} item - The search result item
 * @param {string} searchPattern - The search pattern
 * @returns {number} Relevance score (0-100)
 */
const calculateRelevanceScore = (item, searchPattern) => {
  const exactRegex = new RegExp(`^${searchPattern}$`, 'i');
  const startsWithPattern = searchPattern.toLowerCase();

  // Get searchable text based on type
  const searchableFields =
    item.type === 'user'
      ? [item.name, item.email, item.username].filter(Boolean)
      : [item.name, item.email, item.description].filter(Boolean);

  let maxScore = 0;

  for (const field of searchableFields) {
    const fieldLower = field.toLowerCase();
    let score = 0;

    // Exact match gets highest score
    if (exactRegex.test(field)) {
      score = 100;
    }
    // Starts with query gets high score
    else if (fieldLower.startsWith(startsWithPattern)) {
      score = 80;
    }
    // Contains query gets medium score
    else if (fieldLower.includes(startsWithPattern)) {
      score = 50;
    }
    // Default score for regex match
    else {
      score = 10;
    }

    maxScore = Math.max(maxScore, score);
  }

  return maxScore;
};

/**
 * Sort principals by relevance score and type priority
 * @param {Array} results - Array of results with _searchScore property
 * @returns {Array} Sorted array
 */
const sortPrincipalsByRelevance = (results) => {
  return results.sort((a, b) => {
    if (b._searchScore !== a._searchScore) {
      return b._searchScore - a._searchScore;
    }
    if (a.type !== b.type) {
      return a.type === 'user' ? -1 : 1;
    }
    const aName = a.name || a.email || '';
    const bName = b.name || b.email || '';
    return aName.localeCompare(bName);
  });
};

/**
 * Transform user object to TPrincipalSearchResult format
 * @param {TUser} user - User object from database
 * @returns {TPrincipalSearchResult} Transformed user result
 */
const transformUserToTPrincipalSearchResult = (user) => {
  return {
    id: user._id?.toString(),
    type: 'user',
    name: user.name || user.email,
    email: user.email,
    username: user.username,
    avatar: user.avatar,
    provider: user.provider,
    source: 'local',
    idOnTheSource: user.idOnTheSource || user._id?.toString(),
  };
};

/**
 * Transform group object to TPrincipalSearchResult format
 * @param {IGroup} group - Group object from database
 * @returns {TPrincipalSearchResult} Transformed group result
 */
const transformGroupToTPrincipalSearchResult = (group) => {
  return {
    id: group._id?.toString(),
    type: 'group',
    name: group.name,
    email: group.email,
    avatar: group.avatar,
    description: group.description,
    source: group.source || 'local',
    memberCount: group.memberIds ? group.memberIds.length : 0,
    idOnTheSource: group.idOnTheSource || group._id?.toString(),
  };
};

/**
 * Search for principals (users and groups) by pattern matching on name/email
 * Returns combined results in TPrincipalSearchResult format without sorting
 * @param {string} searchPattern - The pattern to search for
 * @param {number} [limitPerType=10] - Maximum number of results to return
 * @param {string} [typeFilter] - Optional filter: 'user', 'group', or null for all
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session for transactions
 * @returns {Promise<TPrincipalSearchResult[]>} Array of principals in TPrincipalSearchResult format
 */
const searchPrincipals = async function (
  searchPattern,
  limitPerType = 10,
  typeFilter = null,
  session = null,
) {
  if (!searchPattern || searchPattern.trim().length === 0) {
    return [];
  }

  const trimmedPattern = searchPattern.trim();
  const promises = [];

  if (!typeFilter || typeFilter === 'user') {
    const userFields = 'name email username avatar provider idOnTheSource';
    promises.push(
      searchUsers(trimmedPattern, limitPerType, userFields).then((users) =>
        users.map(transformUserToTPrincipalSearchResult),
      ),
    );
  } else {
    promises.push(Promise.resolve([]));
  }

  if (!typeFilter || typeFilter === 'group') {
    promises.push(
      findGroupsByNamePattern(trimmedPattern, null, limitPerType, session).then((groups) =>
        groups.map(transformGroupToTPrincipalSearchResult),
      ),
    );
  } else {
    promises.push(Promise.resolve([]));
  }

  const [users, groups] = await Promise.all(promises);

  const combined = [...users, ...groups];
  return combined;
};

module.exports = {
  findGroupById,
  findGroupByExternalId,
  findGroupsByNamePattern,
  findGroupsByMemberId,
  createGroup,
  upsertGroupByExternalId,
  addUserToGroup,
  removeUserFromGroup,
  getUserGroups,
  getUserPrincipals,
  syncUserEntraGroups,
  searchPrincipals,
  calculateRelevanceScore,
  sortPrincipalsByRelevance,
};
