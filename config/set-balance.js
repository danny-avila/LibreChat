const path = require('path');
const mongoose = require('mongoose');
const { getBalanceConfig } = require('@librechat/api');
const { User, Balance } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { getAppConfig } = require('~/server/services/Config');
const { askQuestion, silentExit } = require('./helpers');
const { kebabCase } = require('lodash');
const connect = require('./connect');
(async () => {
  await connect();;

  /**
   * Show the welcome / help menu
   */
  console.purple('--------------------------');
  console.purple('Set balance to a user account!');
  console.purple('--------------------------');

  /**
   * Set up the variables we need and get the arguments if they were passed in
   */
  let email = process.argv[2];
  let amount = process.argv[3];
  let spec = process.argv[4];

  const appConfig = await getAppConfig();
  const balanceConfig = getBalanceConfig(appConfig);
  if (!balanceConfig?.enabled) {
    console.red('Error: Balance is not enabled. Use librechat.yaml to enable it');
    silentExit(1);
  }

  if (!process.argv[2]) {
    console.orange(`Usage: npm run set-balance <email*> <amount> <spec>`);
    console.orange('Note: if you do not pass in the arguments, you will be prompted for them.');
    console.purple('--------------------------');
  }

  /**
   * If we don't have the right number of arguments, lets prompt the user for them
   */
  if (!email) {
    email = await askQuestion('Email:');
  }
  // Validate the email
  if (!email.includes('@')) {
    console.red('Error: Invalid email address!');
    silentExit(1);
  }

  // Validate the user
  const user = await User.findOne({ email }).lean();
  if (!user) {
    console.red('Error: No user with that email was found!');
    silentExit(1);
  } else {
    console.purple(`Found user: ${user.email}`);
  }

  let balance = await Balance.findOne({ user: user._id }).lean();
  if (!balance) {
    console.purple('User has no balance!');
  } else {
    console.purple(`Current balance: ${balance.tokenCredits}`);
    for (let modelSpec of appConfig.modelSpecs?.list || []) {
      if (!modelSpec.balance?.enabled) {
        continue;
      }
      const specKey = kebabCase(modelSpec.name);
      const specBalance = balance.perSpecTokenCredits?.[specKey] || 0;
      console.purple(`- ${modelSpec.label ?? modelSpec.name}: ${specBalance}`);
    }
  }

  // Get the amount if not provided
  if (!amount) {
    amount = await askQuestion('amount:');
  }
  // Validate the amount
  if (!amount) {
    console.red('Error: Please specify an amount!');
    silentExit(1);
  }

  // Asking the model you want to set balance for
  if (!spec) {
    spec = await askQuestion('Model spec name (null):');
  }
  // check if the spec exists
  if (spec) {
    const specKey = kebabCase(spec);
    const specExists = (appConfig.modelSpecs?.list || []).find(
      (modelSpec) => kebabCase(modelSpec.name) === specKey,
    );
    if (!specExists) {
      console.red(`Error: Spec "${spec}" does not exist in the config!`);
      silentExit(1);
    }
  }

  /**
   * Now that we have all the variables we need, lets set the balance
   */
  let result;
  try {
    if (spec) {
      result = await Balance.findOneAndUpdate(
        { user: user._id },
        { $set: { [`perSpecTokenCredits.${kebabCase(spec)}`]: amount } },
        { upsert: true, new: true },
      ).lean();
    } else {
      result = await Balance.findOneAndUpdate(
        { user: user._id },
        { tokenCredits: amount },
        { upsert: true, new: true },
      ).lean();
    }
  } catch (error) {
    console.red('Error: ' + error.message);
    console.error(error);
    silentExit(1);
  }

  // Check the result
  if (result?.tokenCredits == null) {
    console.red('Error: Something went wrong while updating the balance!');
    console.error(result);
    silentExit(1);
  }

  // Print out the new balance
  if (spec) {
    console.purple(`New Balance for spsec ${spec}: ${amount}`);
  } else {
    console.purple(`New Balance: ${result.tokenCredits}`);
  }

  // Done!
  console.green('Balance set successfully!');
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
