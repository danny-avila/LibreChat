const mongoose = require('mongoose');
const { createMethods } = require('@librechat/data-schemas');
const { matchModelName, findMatchingPattern } = require('@librechat/api');
const getLogStores = require('~/cache/getLogStores');

const methods = createMethods(mongoose, {
  matchModelName,
  findMatchingPattern,
  getCache: getLogStores,
});

const {
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
} = require('./Group');

const seedDatabase = async () => {
  await methods.initializeRoles();
  await methods.seedDefaultRoles();
  await methods.ensureDefaultCategories();
  await methods.seedSystemGrants();
};

module.exports = {
  ...methods,
  seedDatabase,

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
