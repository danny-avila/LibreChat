const path = require('path');
const mongoose = require('mongoose');
const { getBalanceConfig } = require('@librechat/api');
const { User, Balance } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { createTransaction } = require('~/models/Transaction');
const loadCustomConfig = require('~/server/services/Config/loadCustomConfig');
const { askQuestion, silentExit } = require('./helpers');
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
  let email = '';
  let amount = '';
  let specName = '';
  // If we have the right number of arguments, lets use them
  if (process.argv.length >= 3) {
    email = process.argv[2];
    amount = process.argv[3];
    specName = process.argv[4] ?? '';
  } else {
    console.orange('Usage: npm run add-balance <email> <amount> [specName]');
    console.orange('Note: if you do not pass in the arguments, you will be prompted for them.');
    console.purple('--------------------------');
  }

  const balanceConfig = getBalanceConfig();
  if (!balanceConfig?.enabled) {
    console.red('Error: Balance is not enabled. Use librechat.yaml to enable it');
    silentExit(1);
  }

  // Load available modelSpecs from config (best-effort; non-fatal if yaml is absent)
  const customConfig = await loadCustomConfig(false);
  const availableSpecs = (customConfig?.modelSpecs?.list ?? []).map((s) => ({
    name: s.name,
    label: s.label,
  }));

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

  if (!amount) {
    amount = await askQuestion('Amount: (default is 1000 tokens if empty or 0)');
  }
  // Validate the amount
  if (!amount) {
    amount = 1000;
  }

  // Prompt for specName if not provided via argv
  if (specName === '') {
    if (availableSpecs.length > 0) {
      console.purple('Available specs (use the name, not the label):');
      for (const s of availableSpecs) {
        console.purple(`  name: ${s.name}  (label: ${s.label})`);
      }
    } else {
      console.purple('No modelSpecs found in config.');
    }
    specName = await askQuestion('Spec name (leave blank for global balance):');
  }

  // Validate specName if provided
  if (specName && availableSpecs.length > 0 && !availableSpecs.some((s) => s.name === specName)) {
    console.red(`Error: "${specName}" was not found in modelSpecs config.`);
    console.red(`Valid names: ${availableSpecs.map((s) => s.name).join(', ')}`);
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

  /**
   * Now that we have all the variables we need, lets create the transaction and update the balance
   */
  let result;
  try {
    result = await createTransaction({
      user: user._id,
      tokenType: 'credits',
      context: 'admin',
      rawAmount: +amount,
      balance: balanceConfig,
      ...(specName ? { specName } : {}),
    });
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

  // Done!
  console.green('Transaction created successfully!');
  if (specName) {
    console.purple(`Spec: ${specName}\nAmount: ${amount}\nNew Spec Balance: ${result.balance}`);
  } else {
    console.purple(`Amount: ${amount}\nNew Balance: ${result.balance}`);
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
