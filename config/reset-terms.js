const path = require('path');
const mongoose = require('mongoose');
const { CacheKeys } = require('librechat-data-provider');
const { createModels, getMCPAuthorityConsistencyModule } = require('@librechat/data-schemas');
const { User } = createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const getLogStores = require('~/cache/getLogStores');
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');
const resetTermsAcceptance = require('./reset-terms-operation');

(async () => {
  await connect();

  console.purple('--------------------------');
  console.purple('Reset terms acceptance');
  console.purple('--------------------------');

  console.yellow('This will reset the terms acceptance for all users.');
  const confirm = await askQuestion('Are you sure you want to proceed? (y/n): ');

  if (confirm.toLowerCase() !== 'y') {
    console.yellow('Operation cancelled.');
    silentExit(0);
  }

  try {
    const authority = getMCPAuthorityConsistencyModule(mongoose);
    const result = await resetTermsAcceptance({
      userModel: User,
      authority,
      authUserCache: getLogStores(CacheKeys.AUTH_USER_DOC),
    });
    console.green(`Updated ${result.modifiedCount} user(s).`);
  } catch (error) {
    console.red('Error resetting terms acceptance:', error);
    silentExit(1);
  }

  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }

  if (err.message.includes('fetch failed')) {
    return;
  } else {
    process.exit(1);
  }
});
