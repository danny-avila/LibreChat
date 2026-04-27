#!/usr/bin/env node
const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const { User, SubscriptionProfile } = createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');
const {
  getRevenueCatConfig,
  getSubscriptionProfile,
} = require('~/server/services/Billing/RevenueCatService');

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

  console.purple('-------------------------------------');
  console.purple('Clear manual subscription override');
  console.purple('-------------------------------------');

  let email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.orange('Usage: npm run clear-subscription-override <email>');
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

  const existingProfile = await SubscriptionProfile.findOne({ userId: user._id }).lean();
  if (!existingProfile) {
    console.yellow(`No SubscriptionProfile found for ${user.email}`);
    return gracefulExit(0);
  }

  await SubscriptionProfile.updateOne(
    { userId: user._id },
    {
      $set: {
        manualOverride: {
          enabled: false,
          mode: null,
          source: null,
          updatedAt: new Date(),
        },
      },
    },
  );

  const config = getRevenueCatConfig();

  if (config.secretApiKey) {
    const syncedProfile = await getSubscriptionProfile({
      userId: user._id,
      appUserId: user._id.toString(),
      forceRefresh: true,
    });

    console.green(`Cleared manual override for ${user.email}`);
    console.gray('RevenueCat sync completed.');
    console.gray(`isPro: ${syncedProfile.isPro}`);
    console.gray(`currentPlan: ${syncedProfile.currentPlan ?? 'none'}`);
    return gracefulExit(0);
  }

  const updatedProfile = await SubscriptionProfile.findOne({ userId: user._id }).lean();
  console.green(`Cleared manual override for ${user.email}`);
  console.yellow('RevenueCat secret key is not configured, so no sync was performed.');
  console.gray(`Cached isPro remains: ${updatedProfile?.isPro}`);
  console.gray(`Cached plan remains: ${updatedProfile?.currentPlan ?? 'none'}`);
  return gracefulExit(0);
})().catch(async (error) => {
  console.error('There was an uncaught error:');
  console.error(error);
  await gracefulExit(1);
});
