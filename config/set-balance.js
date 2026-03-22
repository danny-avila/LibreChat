const path = require('path');
const mongoose = require('mongoose');
const { getBalanceConfig } = require('@librechat/api');
const { User, Balance } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const loadCustomConfig = require('~/server/services/Config/loadCustomConfig');
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

(async () => {
  await connect();

  /**
   * Show the welcome / help menu
   */
  console.purple('--------------------------');
  console.purple('Set balance to a user account!');
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
    console.orange('Usage: npm run set-balance <email> <amount> [specName]');
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

  // Validate the user
  const user = await User.findOne({ email }).lean();
  if (!user) {
    console.red('Error: No user with that email was found!');
    silentExit(1);
  } else {
    console.purple(`Found user: ${user.email}`);
  }

  const balance = await Balance.findOne({ user: user._id }).lean();
  if (!balance) {
    console.purple('User has no balance!');
  } else {
    console.purple(`Current Global Balance: ${balance.tokenCredits}`);
    const specCredits = balance.perModelSpecTokenCredits ?? {};
    const specEntries = Object.entries(specCredits);
    if (specEntries.length > 0) {
      console.purple('Current Spec Balances:');
      for (const [name, credits] of specEntries) {
        console.purple(`  ${name}: ${credits}`);
      }
    }
  }

  if (!amount) {
    amount = await askQuestion('Amount:');
  }
  // Validate the amount
  if (!amount) {
    console.red('Error: Please specify an amount!');
    silentExit(1);
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

  /**
   * Now that we have all the variables we need, lets set the balance
   */
  let result;
  try {
    if (specName) {
      // Build the new map by merging the existing plain-object value with the new entry.
      // We avoid dot-notation ($set with "perModelSpecTokenCredits.specName") because
      // MongoDB splits on dots, corrupting spec names like "buzz-gpt-4.1".
      // We also avoid relying on Mongoose Map hydration, which returns undefined for
      // old documents that pre-date the field being added to the schema.
      const existing = await Balance.findOne({ user: user._id }).lean();
      const currentMap = existing?.perModelSpecTokenCredits ?? {};
      // currentMap may itself be corrupted nested objects from prior dot-splitting;
      // we only carry forward scalar (number) entries to avoid perpetuating corruption.
      const cleanMap = Object.fromEntries(
        Object.entries(currentMap).filter(([, v]) => typeof v === 'number'),
      );
      cleanMap[specName] = +amount;
      result = await Balance.findOneAndUpdate(
        { user: user._id },
        { $set: { perModelSpecTokenCredits: cleanMap } },
        { upsert: true, new: true },
      ).lean();
    } else {
      result = await Balance.findOneAndUpdate(
        { user: user._id },
        { tokenCredits: +amount },
        { upsert: true, new: true },
      ).lean();
    }
  } catch (error) {
    console.red('Error: ' + error.message);
    console.error(error);
    silentExit(1);
  }

  // Check the result
  if (specName) {
    const newSpecCredits = (result?.perModelSpecTokenCredits ?? {})[specName];
    if (newSpecCredits == null) {
      console.red('Error: Something went wrong while updating the spec balance!');
      console.error(result);
      silentExit(1);
    }
    console.green('Spec balance set successfully!');
    console.purple(`Spec: ${specName}\nNew Spec Balance: ${newSpecCredits}`);
  } else {
    if (result?.tokenCredits == null) {
      console.red('Error: Something went wrong while updating the balance!');
      console.error(result);
      silentExit(1);
    }
    console.green('Balance set successfully!');
    console.purple(`New Balance: ${result.tokenCredits}`);
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
