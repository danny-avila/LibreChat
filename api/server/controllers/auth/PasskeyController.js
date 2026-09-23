const bcrypt = require('bcryptjs');
const { CacheKeys } = require('librechat-data-provider');
const { createPasskeyHandlers, resolveMaxPasskeysPerUser } = require('@librechat/api');
const { checkBan } = require('~/server/middleware');
const { getLogStores } = require('~/cache');
const { getAppConfig } = require('~/server/services/Config');
const db = require('~/models');

module.exports = createPasskeyHandlers({
  checkBan,
  compare: bcrypt.compare,
  getChallengeCache: () => getLogStores(CacheKeys.PASSKEY_CHALLENGE),
  /** Resolved per request so a librechat.yaml reload changes the cap without a restart. */
  maxPasskeysPerUser: async () => resolveMaxPasskeysPerUser((await getAppConfig())?.passkeys),
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
