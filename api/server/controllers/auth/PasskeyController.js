const bcrypt = require('bcryptjs');
const { CacheKeys } = require('librechat-data-provider');
const { createPasskeyHandlers } = require('@librechat/api');
const { checkBan } = require('~/server/middleware');
const { getLogStores } = require('~/cache');
const db = require('~/models');

module.exports = createPasskeyHandlers({
  checkBan,
  compare: bcrypt.compare,
  getChallengeCache: () => getLogStores(CacheKeys.PASSKEY_CHALLENGE),
  getUserById: db.getUserById,
  updateUser: db.updateUser,
  createPasskey: db.createPasskey,
  deletePasskey: db.deletePasskey,
  renamePasskey: db.renamePasskey,
  recordPasskeyUse: db.recordPasskeyUse,
  findPasskeysByUser: db.findPasskeysByUser,
  countPasskeysByUser: db.countPasskeysByUser,
  findPasskeyByCredentialId: db.findPasskeyByCredentialId,
});
