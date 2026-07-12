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
  console.purple('Deleting a user\'s openidId field');
  console.purple('---------------');

  // 1) Parse args: pull out the --yes/-y flag, whatever position it's in,
  // and treat the first remaining argument as the email.
  const rawArgs = process.argv.slice(2);
  const autoConfirm = rawArgs.some((arg) => arg === '--yes' || arg === '-y');
  const positionalArgs = rawArgs.filter((arg) => arg !== '--yes' && arg !== '-y');

  let email = positionalArgs[0]?.trim();
  if (!email) {
    email = (await askQuestion('Email:')).trim();
  }

  // 2) Find user
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    console.yellow(`No user found with email "${email}"`);
    return gracefulExit(0);
  }

  if (!user.openidId) {
    console.yellow(`User ${user.email} (${user._id}) has no openidId set.`);
    return gracefulExit(0);
  }

  // 3) Confirm deletion (skip prompt if --yes/-y was passed)
  if (!autoConfirm) {
    const confirm = await askQuestion(
      `Really delete the openidId ("${user.openidId}") for user ${user.email} (${user._id})? (y/N)`,
    );
    if (confirm.toLowerCase() !== 'y') {
      console.yellow('Aborted.');
      return gracefulExit(0);
    }
  }

  // 4) Unset only the openidId field
  await User.updateOne({ _id: user._id }, { $unset: { openidId: '' } });

  console.green(`✔ Successfully deleted openidId for user ${email}.`);

  return gracefulExit(0);
})().catch(async (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
  }
});
