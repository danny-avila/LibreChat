#!/usr/bin/env node
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
const path = require('path');
const mongoose = require('mongoose');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

async function gracefulExit(code = 0) {
  try {
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error disconnecting from MongoDB:', err);
  }
  silentExit(code);
}

(async () => {
  await connect();

  console.purple('---------------');
  console.purple("Deleting a user's openidId field");
  console.purple('---------------');

  // 1) Parse args:
  //   --yes / -y     skip the confirmation prompt (non-interactive mode)
  //   --id <userId>  target a user unambiguously by _id, bypassing email lookup
  // Whatever remains is treated as the email (positional or interactive prompt).
  const rawArgs = process.argv.slice(2);
  const autoConfirm = rawArgs.some((arg) => arg === '--yes' || arg === '-y');

  let userId;
  const idFlagIndex = rawArgs.findIndex((arg) => arg === '--id');
  if (idFlagIndex !== -1) {
    userId = rawArgs[idFlagIndex + 1]?.trim();
    if (!userId) {
      console.red('The --id flag requires a value, e.g. --id 64f1c2...');
      return gracefulExit(1);
    }
  }

  const positionalArgs = rawArgs.filter((arg, index) => {
    if (arg === '--yes' || arg === '-y' || arg === '--id') {
      return false;
    }
    if (idFlagIndex !== -1 && index === idFlagIndex + 1) {
      return false;
    }
    return true;
  });

  let user;

  if (userId) {
    // Unambiguous lookup — sidesteps the email-collision problem entirely.
    // Use this when the same email exists across multiple tenants.
    user = await User.findById(userId);
    if (!user) {
      console.yellow(`No user found with id "${userId}"`);
      return gracefulExit(0);
    }
  } else {
    let email = positionalArgs[0]?.trim();
    if (!email) {
      email = (await askQuestion('Email:')).trim();
    }
    email = email.toLowerCase();

    // 2) Find ALL users matching the email, not just the first one. The
    // schema's real uniqueness guarantee is the compound { email, tenantId }
    // index, so the same email can legitimately belong to more than one
    // user in a multi-tenant deployment. Never act on an unscoped match.
    const matches = await User.find({ email });

    if (matches.length === 0) {
      console.yellow(`No user found with email "${email}"`);
      return gracefulExit(0);
    }

    if (matches.length > 1) {
      console.red(
        `Found ${matches.length} users with email "${email}". Refusing to guess which one to update.`,
      );
      console.yellow('Matching users:');
      matches.forEach((match) => {
        const tenantInfo = match.tenantId ? `  tenantId: ${match.tenantId}` : '';
        console.yellow(`  _id: ${match._id}${tenantInfo}`);
      });
      console.yellow('Re-run this script with --id <userId> to target a specific user, e.g.:');
      console.yellow(`  npm run reset-user-openid -- --id ${matches[0]._id} --yes`);
      return gracefulExit(1);
    }

    [user] = matches;
  }

  if (!user.openidId && !user.idOnTheSource) {
    console.yellow(`User ${user.email} (${user._id}) has no openidId or idOnTheSource set.`);
    return gracefulExit(0);
  }

  // 3) Confirm deletion (skip prompt if --yes/-y was passed)
  if (!autoConfirm) {
    const fieldsSummary = [
      user.openidId ? `openidId ("${user.openidId}")` : null,
      user.idOnTheSource ? `idOnTheSource ("${user.idOnTheSource}")` : null,
    ]
      .filter(Boolean)
      .join(' and ');

    const confirm = await askQuestion(
      `Really delete the ${fieldsSummary} for user ${user.email} (${user._id})? (y/N)`,
    );
    if (confirm.toLowerCase() !== 'y') {
      console.yellow('Aborted.');
      return gracefulExit(0);
    }
  }

  // 4) Unset openidId AND idOnTheSource together. Leaving idOnTheSource in
  // place would let findOpenIDUser (packages/api/src/auth/openid.ts) match
  // the user again on the next login via the old provider's `oid` claim,
  // and the OIDC login flow (api/strategies/openidStrategy.js) would then
  // silently write openidId back onto the user — undoing this reset.
  await User.updateOne({ _id: user._id }, { $unset: { openidId: '', idOnTheSource: '' } });

  console.green(
    `✔ Successfully cleared openidId and idOnTheSource for user ${user.email} (${user._id}).`,
  );

  return gracefulExit(0);
})().catch(async (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
  }
});
