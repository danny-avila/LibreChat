#!/usr/bin/env node
const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const { User, SubscriptionProfile } = createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

const DEFAULT_ENTITLEMENT_ID = process.env.REVENUECAT_ENTITLEMENT_ID || 'codecan_ai_pro';
const DEFAULT_FREE_MESSAGES_PER_MONTH = Number.parseInt(
  process.env.REVENUECAT_FREE_MESSAGES_PER_MONTH || '3',
  10,
);

function getCurrentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

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
  console.purple('Revoke CodeCan AI Pro manually');
  console.purple('-------------------------------');

  let email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.orange('Usage: npm run revoke-pro-subscription <email>');
    email = (await askQuestion('Email:')).trim().toLowerCase();
  }

  if (!email.includes('@')) {
    console.red('Error: Invalid email address.');
    return gracefulExit(1);
  }

  const user = await User.findOne({ email });
  if (!user) {
    console.red(`Error: No user found with email "${email}".`);
    return gracefulExit(1);
  }

  const quotaPeriod = getCurrentPeriod();
  const existingProfile = await SubscriptionProfile.findOne({ userId: user._id }).lean();
  const freeMessagesLimit = Number.isFinite(DEFAULT_FREE_MESSAGES_PER_MONTH)
    ? DEFAULT_FREE_MESSAGES_PER_MONTH
    : 3;

  const subscriptionProfile = await SubscriptionProfile.findOneAndUpdate(
    { userId: user._id },
    {
      $set: {
        userId: user._id,
        appUserId: user._id.toString(),
        entitlementId: DEFAULT_ENTITLEMENT_ID,
        isPro: false,
        currentPlan: null,
        productId: null,
        store: null,
        expiresAt: null,
        managementUrl: null,
        entitlements: {
          [DEFAULT_ENTITLEMENT_ID]: {
            isActive: false,
            productIdentifier: null,
            store: null,
            expiresAt: null,
            purchaseDate: null,
            gracePeriodExpiresAt: null,
            unsubscribeDetectedAt: null,
            billingIssuesDetectedAt: null,
          },
        },
        quota: {
          period: existingProfile?.quota?.period ?? quotaPeriod,
          usedMessages: existingProfile?.quota?.usedMessages ?? 0,
          limit: existingProfile?.quota?.limit ?? freeMessagesLimit,
        },
        manualOverride: {
          enabled: true,
          mode: 'revoke',
          source: 'config/revoke-pro-subscription.js',
          updatedAt: new Date(),
        },
        lastSyncedAt: new Date(),
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  console.green(`Revoked CodeCan AI Pro for ${user.email}`);
  console.gray(`User ID: ${user._id}`);
  console.gray(`Entitlement: ${subscriptionProfile.entitlementId}`);
  console.gray(`isPro: ${subscriptionProfile.isPro}`);

  return gracefulExit(0);
})().catch(async (error) => {
  console.error('There was an uncaught error:');
  console.error(error);
  await gracefulExit(1);
});
