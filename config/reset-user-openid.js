const connect = require('./connect');
const mongoose = require('mongoose');
const { CacheKeys } = require('librechat-data-provider');
const { invalidateCachedAuthUserDoc } = require('@librechat/api');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
const getLogStores = require('~/cache/getLogStores');
const { askQuestion, silentExit } = require('./helpers');

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
  await User.updateOne({ _id: user._id }, { $unset: { openidId: '', idOnTheSource: '' } });
  try {
    const authUserCacheStore = getLogStores(CacheKeys.AUTH_USER_DOC);
    if (authUserCacheStore) {
      await invalidateCachedAuthUserDoc(authUserCacheStore, { userId: user._id.toString() });
    }
  } catch (err) {
    console.error('Warning: failed to invalidate auth-user-doc cache:', err);
    console.yellow(
      'The MongoDB fields were cleared, but a cached auth-user document may still be ' +
        'serving the old openidId/idOnTheSource until it expires. If AUTH_USER_CACHE_MODE=on, ' +
        'run `npm run flush-cache` or restart the backend to force re-authentication.',
    );
  }

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
