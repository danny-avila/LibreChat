#!/usr/bin/env node
const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const { User, SubscriptionProfile } = createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

async function gracefulExit(code = 0) {
  try {
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error);
  }

  silentExit(code);
}

(async () => {
  await connect();

  console.purple('-------------------------------');
  console.purple('Show subscription details');
  console.purple('-------------------------------');

  let email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.orange('Usage: npm run show-subscription <email>');
    email = (await askQuestion('Email:')).trim().toLowerCase();
  }

  if (!email.includes('@')) {
    console.red('Error: Invalid email address.');
    return gracefulExit(1);
  }

  const user = await User.findOne({ email }).lean();
  if (!user) {
    console.red(`Error: No user found with email "${email}".`);
    return gracefulExit(1);
  }

  const subscriptionProfile = await SubscriptionProfile.findOne({ userId: user._id }).lean();

  if (!subscriptionProfile) {
    console.yellow(`No SubscriptionProfile found for ${user.email}`);
    console.gray(`User ID: ${user._id}`);
    return gracefulExit(0);
  }

  const output = {
    user: {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      name: user.name,
    },
    subscription: {
      entitlementId: subscriptionProfile.entitlementId,
      isPro: subscriptionProfile.isPro,
      currentPlan: subscriptionProfile.currentPlan,
      productId: subscriptionProfile.productId,
      store: subscriptionProfile.store,
      expiresAt: subscriptionProfile.expiresAt,
      managementUrl: subscriptionProfile.managementUrl,
      quota: subscriptionProfile.quota,
      manualOverride: subscriptionProfile.manualOverride,
      lastSyncedAt: subscriptionProfile.lastSyncedAt,
      entitlements:
        subscriptionProfile.entitlements instanceof Map
          ? Object.fromEntries(subscriptionProfile.entitlements)
          : subscriptionProfile.entitlements,
    },
  };

  console.log(JSON.stringify(output, null, 2));
  return gracefulExit(0);
})().catch(async (error) => {
  console.error('There was an uncaught error:');
  console.error(error);
  await gracefulExit(1);
});
