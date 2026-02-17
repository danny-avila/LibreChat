const mongoose = require('mongoose');
const { createMethods } = require('@librechat/data-schemas');
const {
  escapeRegExp,
  matchModelName,
  findMatchingPattern,
  createTempChatExpirationDate,
} = require('@librechat/api');
const getLogStores = require('~/cache/getLogStores');

const methods = createMethods(mongoose, {
  escapeRegExp,
  matchModelName,
  findMatchingPattern,
  getCache: getLogStores,
  createTempChatExpirationDate,
});

const seedDatabase = async () => {
  await methods.initializeRoles();
  await methods.seedDefaultRoles();
  await methods.ensureDefaultCategories();
};

module.exports = {
  ...methods,
  seedDatabase,
};
