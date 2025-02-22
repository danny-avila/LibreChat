const Group = require('./group');
const User = require('./User');

/**
 * Retrieve a group by ID and convert the found group document to a plain object.
 *
 * @param {string} groupId - The ID of the group to find and return as a plain object.
 * @param {string|string[]} [fieldsToSelect] - The fields to include or exclude in the returned document.
 * @returns {Promise<Object|null>} A plain object representing the group document, or `null` if no group is found.
 */
const getGroupById = (groupId, fieldsToSelect = null) => {
  const query = Group.findById(groupId);
  if (fieldsToSelect) {
    query.select(fieldsToSelect);
  }
  return query.lean();
};

/**
 * Search for a single group or multiple groups based on partial data and return them as plain objects.
 *
 * @param {Partial<Object>} searchCriteria - The partial data to use for searching groups.
 * @param {string|string[]} [fieldsToSelect] - The fields to include or exclude in the returned documents.
 * @returns {Promise<Object[]>} An array of plain objects representing the group documents.
 */
const findGroup = (searchCriteria, fieldsToSelect = null) => {
  const query = Group.find(searchCriteria);
  if (fieldsToSelect) {
    query.select(fieldsToSelect);
  }
  return query.lean();
};

/**
 * Update a group with new data without overwriting existing properties.
 *
 * @param {string} groupId - The ID of the group to update.
 * @param {Object} updateData - An object containing the properties to update.
 * @returns {Promise<Object|null>} The updated group document as a plain object, or `null` if no group is found.
 */
const updateGroup = (groupId, updateData) => {
  return Group.findByIdAndUpdate(
    groupId,
    { $set: updateData },
    { new: true, runValidators: true },
  ).lean();
};

/**
 * Create a new group.
 *
 * @param {Object} data - The group data to be created.
 * @returns {Promise<Object>} The created group document.
 */
const createGroup = async (data) => {
  return await Group.create(data);
};

/**
 * Count the number of group documents in the collection based on the provided filter.
 *
 * @param {Object} [filter={}] - The filter to apply when counting the documents.
 * @returns {Promise<number>} The count of documents that match the filter.
 */
const countGroups = (filter = {}) => {
  return Group.countDocuments(filter);
};

/**
 * Delete a group by its unique ID only if no user is assigned to it.
 *
 * @param {string} groupId - The ID of the group to delete.
 * @returns {Promise<{ deletedCount: number, message: string }>} An object indicating the number of deleted documents.
 */
const deleteGroupById = async (groupId) => {
  // Check if any users reference the group
  const userCount = await User.countDocuments({ groups: groupId });
  if (userCount > 0) {
    return { deletedCount: 0, message: `Cannot delete group; it is assigned to ${userCount} user(s).` };
  }

  try {
    const result = await Group.deleteOne({ _id: groupId });
    if (result.deletedCount === 0) {
      return { deletedCount: 0, message: 'No group found with that ID.' };
    }
    return { deletedCount: result.deletedCount, message: 'Group was deleted successfully.' };
  } catch (error) {
    throw new Error('Error deleting group: ' + error.message);
  }
};

/**
 * Override deletion of a group by its unique ID.
 * This function first removes the group ObjectId from all users' groups arrays,
 * then proceeds to delete the group document.
 *
 * @param {string} groupId - The ID of the group to delete.
 * @returns {Promise<{ deletedCount: number, message: string }>} An object indicating the deletion result.
 */
const overrideDeleteGroupById = async (groupId) => {
  // Remove group references from all users
  await User.updateMany(
    { groups: groupId },
    { $pull: { groups: groupId } },
  );

  try {
    const result = await Group.deleteOne({ _id: groupId });
    if (result.deletedCount === 0) {
      return { deletedCount: 0, message: 'No group found with that ID.' };
    }
    return { deletedCount: result.deletedCount, message: 'Group was deleted successfully (override).' };
  } catch (error) {
    throw new Error('Error deleting group: ' + error.message);
  }
};

module.exports = {
  getGroupById,
  findGroup,
  updateGroup,
  createGroup,
  countGroups,
  deleteGroupById,
  overrideDeleteGroupById,
};