#!/usr/bin/env node
// scripts/migrate-add-stripe-fields.js
const mongoose = require('mongoose');
const { createUserModel } = require('../packages/data-schemas/src/models/user');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/LibreChat';

async function migrate() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const User = createUserModel(mongoose);

  const result = await User.updateMany(
    {},
    {
      $set: {
        stripeCustomerId: null,
        stripeSubscriptionId: null,
          subscriptionStatus: 'none',
          subscriptionPlan: null,
          stripeProductId: null,
      },
    }
  );

  console.log(`Updated ${result.nModified || result.modifiedCount} users.`);
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});