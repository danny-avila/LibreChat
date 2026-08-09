#!/usr/bin/env node
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
const path = require('path');
const mongoose = require('mongoose');
const dataSchemas = require('@librechat/data-schemas');
const { invalidateCachedAuthUserDoc } = require('@librechat/api');
const { CacheKeys } = require('librechat-data-provider');
const models = dataSchemas.createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { deleteUserData } = require('./delete-user-data');
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');
const { getLogStores } = require('../api/cache');

const { User } = models;

async function gracefulExit(code = 0) {
  try {
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error disconnecting from MongoDB:', err);
  }
  silentExit(code);
}

(async () => {
  await connect();

  console.purple('---------------');
  console.purple('Deleting a user and all related data');
  console.purple('---------------');

  // 1) Get email
  let email = process.argv[2]?.trim();
  if (!email) {
    email = (await askQuestion('Email:')).trim();
  }

  // 2) Find user
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    console.yellow(`No user found with email "${email}"`);
    return gracefulExit(0);
  }

  // 3) Confirm full deletion
  const confirmAll = await askQuestion(
    `Really delete user ${user.email} (${user._id}) and ALL their data? (y/N)`,
  );
  if (confirmAll.toLowerCase() !== 'y') {
    console.yellow('Aborted.');
    return gracefulExit(0);
  }

  // 4) Ask specifically about transactions
  const confirmTx = await askQuestion('Also delete all transaction history for this user? (y/N)');
  const deleteTx = confirmTx.toLowerCase() === 'y';

  const uid = user._id.toString();

  const authorityConsistency = dataSchemas.getMCPAuthorityConsistencyModule(mongoose);
  await deleteUserData({
    models,
    uid,
    userObjectId: user._id,
    deleteTransactions: deleteTx,
    authorityConsistency,
    invalidateAuthUserDoc: (input) =>
      invalidateCachedAuthUserDoc(getLogStores(CacheKeys.AUTH_USER_DOC), input),
  });

  console.green(`✔ Successfully deleted user ${email} and all associated data.`);
  if (!deleteTx) {
    console.yellow('⚠️ Transaction history was retained.');
  }

  return gracefulExit(0);
})().catch(async (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
  }
});
