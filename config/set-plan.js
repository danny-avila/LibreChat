const path = require('path');
const mongoose = require('mongoose');
const { PLANS, applyPlanChange } = require('@librechat/api');
const { createModels, createMethods } = require('@librechat/data-schemas');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

(async () => {
  await connect();

  const { User } = createModels(mongoose);
  const methods = createMethods(mongoose);

  /**
   * Show the welcome / help menu
   */
  console.purple('--------------------------');
  console.purple('Set a plan on a user account!');
  console.purple('--------------------------');

  const planCodes = Object.keys(PLANS);

  /**
   * Set up the variables we need and get the arguments if they were passed in
   */
  let email = '';
  let planCode = '';
  if (process.argv.length >= 4) {
    email = process.argv[2];
    planCode = process.argv[3];
  } else {
    console.orange('Usage: npm run set-plan <email> <planCode>');
    console.orange(`planCode must be one of: ${planCodes.join(', ')}`);
    console.orange('Note: if you do not pass in the arguments, you will be prompted for them.');
    console.purple('--------------------------');
  }

  if (!email) {
    email = await askQuestion('Email:');
  }
  if (!email.includes('@')) {
    console.red('Error: Invalid email address!');
    silentExit(1);
  }

  const user = await User.findOne({ email }).lean();
  if (!user) {
    console.red('Error: No user with that email was found!');
    silentExit(1);
  } else {
    console.purple(`Found user: ${user.email}`);
  }

  if (!planCode) {
    planCode = await askQuestion(`Plan code (${planCodes.join(', ')}):`);
  }
  if (!planCodes.includes(planCode)) {
    console.red(`Error: Unknown plan code "${planCode}". Must be one of: ${planCodes.join(', ')}`);
    silentExit(1);
  }

  /**
   * Now that we have all the variables we need, apply the plan change.
   * Always goes through applyPlanChange() — the only sanctioned entry point
   * for changing a user's subscription (see project CLAUDE.md).
   */
  let result;
  try {
    result = await applyPlanChange(
      { user_id: user._id, plan_code: planCode, source: 'cli' },
      {
        getActiveSubscriptionRecord: methods.getActiveSubscriptionRecord,
        expireActiveSubscriptions: methods.expireActiveSubscriptions,
        createSubscription: methods.createSubscription,
        createQuota: methods.createQuota,
      },
    );
  } catch (error) {
    console.red('Error: ' + error.message);
    console.error(error);
    silentExit(1);
  }

  // Done!
  console.green('Plan set successfully!');
  console.purple(
    `Previous plan: ${result.previous_plan ?? '(none)'} → New plan: ${result.subscription.plan_code}`,
  );
  console.purple(
    `Period: ${result.subscription.current_period_start.toISOString()} – ${result.subscription.current_period_end.toISOString()}`,
  );
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
