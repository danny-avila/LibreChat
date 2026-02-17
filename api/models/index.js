const mongoose = require('mongoose');
const { createMethods } = require('@librechat/data-schemas');
const {
  createTempChatExpirationDate,
  escapeRegExp,
  matchModelName,
  findMatchingPattern,
} = require('@librechat/api');
const { removeAllPermissions } = require('~/server/services/PermissionService');
const getLogStores = require('~/cache/getLogStores');
const { comparePassword } = require('./userMethods');
const { File } = require('~/db/models');

const methods = createMethods(mongoose, {
  createTempChatExpirationDate,
  escapeRegExp,
  matchModelName,
  findMatchingPattern,
  removeAllPermissions,
  getCache: getLogStores,
});

const seedDatabase = async () => {
  await methods.initializeRoles();
  await methods.seedDefaultRoles();
  await methods.ensureDefaultCategories();
};

/**
 * Adapter wrappers for functions whose signatures changed in data-schemas.
 * These translate the legacy (req, ...) calling convention used across the app
 * to the data-schemas ({userId, isTemporary, interfaceConfig}, ...) signature.
 */
function saveMessage(req, params, metadata) {
  return methods.saveMessage(
    {
      userId: req?.user?.id,
      isTemporary: req?.body?.isTemporary,
      interfaceConfig: req?.config?.interfaceConfig,
    },
    params,
    metadata,
  );
}

function updateMessageText(req, params) {
  return methods.updateMessageText(req?.user?.id, params);
}

function updateMessage(req, message, metadata) {
  return methods.updateMessage(req?.user?.id, message, metadata);
}

function deleteMessagesSince(req, params) {
  return methods.deleteMessagesSince(req?.user?.id, params);
}

function saveConvo(req, convo, metadata) {
  return methods.saveConvo(
    {
      userId: req?.user?.id,
      isTemporary: req?.body?.isTemporary,
      interfaceConfig: req?.config?.interfaceConfig,
    },
    convo,
    metadata,
  );
}

module.exports = {
  ...methods,
  saveMessage,
  updateMessageText,
  updateMessage,
  deleteMessagesSince,
  saveConvo,
  seedDatabase,
  comparePassword,
  Files: File,
};
