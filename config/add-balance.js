const path = require('path');
const mongoose = require('mongoose');
const { getBalanceConfig } = require('@librechat/api');
const { User, Balance } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { createTransaction } = require('~/models/Transaction');
const { getAppConfig } = require('~/server/services/Config');
const { askQuestion, silentExit } = require('./helpers');
const { kebabCase } = require('lodash');
const connect = require('./connect');

(async () => {
  await connect();

  /**
   * Show the welcome / help menu
   */
  console.purple('--------------------------');
  console.purple('Add balance to a user account!');
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
      if (!modelSpec.balance) {
        continue;
      }
      const specKey = kebabCase(modelSpec.name);
      const specBalance = balance.perSpecTokenCredits?.[specKey] || 0;
      console.purple(`- ${modelSpec.label ?? modelSpec.name}: ${specBalance}`);
    }
  }

  // Get the amount if not provided
  if (!amount) {
    amount = await askQuestion('amount: (default is 1000 tokens if empty or 0)');
  }
  // Validate the amount
  if (!amount) {
    amount = 1000;
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
   * Now that we have all the variables we need, lets create the transaction and update the balance
   */
  let result;
  try {
    result = await createTransaction(
      {
        user: user._id,
        tokenType: 'credits',
        context: 'admin',
        spec,
        rawAmount: +amount,
        balance: balanceConfig,
      },
      appConfig,
    );
  } catch (error) {
    console.red('Error: ' + error.message);
    console.error(error);
    silentExit(1);
  }

  // Check the result
  if (!result?.balance) {
    console.red('Error: Something went wrong while updating the balance!');
    console.error(result);
    silentExit(1);
  }

  if (spec) {
    console.purple(`Adding ${amount} to spec ${spec}`);
    console.purple(`New Balance for spec ${spec}: ${result.balance}`);
  } else {
    console.purple(`Adding ${amount} to general balance`);
    console.purple(`New Balance: ${result.balance}`);
  }
  
  // Done!
  console.green('Transaction created successfully!');
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
