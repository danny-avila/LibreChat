const path = require('path');
const mongoose = require('mongoose');
const { User, Balance } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { silentExit } = require('./helpers');
const connect = require('./connect');
const { getAppConfig } = require('~/server/services/Config');
const { kebabCase } = require('lodash');

(async () => {
  await connect();

  // load app config
  const appConfig = await getAppConfig();

  /**
   * Show the welcome / help menu
   */
  console.purple('-----------------------------');
  console.purple('Show the balance of all users');
  console.purple('-----------------------------');

  let users = await User.find({});
  for (const user of users) {
    let balance = await Balance.findOne({ user: user._id });
    if (balance !== null) {
      // addition per-spec balances
      const perModelSpecsBalance = appConfig.modelSpecs?.list?.reduce((acc, spec) => {
        return acc + balance.perSpecTokenCredits?.get(kebabCase(spec.name)) || 0
      }, 0);
      console.green(`User ${user.name} (${user.email}) has a balance of ${balance.tokenCredits + perModelSpecsBalance}. [General: ${balance.tokenCredits}, Per-spec: ${perModelSpecsBalance}]`);
    } else {
      console.yellow(`User ${user.name} (${user.email}) has no balance`);
    }
  }

  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }

  if (!err.message.includes('fetch failed')) {
    process.exit(1);
  }
});
