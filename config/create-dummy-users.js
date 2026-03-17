const path = require('path');
const mongoose = require('mongoose');

const { User } = require('@librechat/data-schemas').createModels(mongoose);

require('module-alias')({
  base: path.resolve(__dirname, '..', 'api'),
});

const { registerUser } = require('~/server/services/AuthService');
const connect = require('./connect');

const silentExit = (code = 0) => process.exit(code);
const createDummyUsers = async (count = 1000) => {
  console.purple(`\n🚀 Creating ${count} dummy users in batches...\n`);

  const users = [];

  let createdCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const BATCH_SIZE = 100;

  // Generate users
  for (let i = 1; i <= count; i++) {
    users.push({
      email: `dummyUser${i}@gmail.com`,
      username: `dummyUser${i}`,
      name: `dummyUser${i}`,
      password: `dummyUser${i}`,
      confirm_password: `dummyUser${i}`,
    });
  }

  try {
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      console.purple(`\n⚡ Processing batch ${i / BATCH_SIZE + 1} (${batch.length} users)...`);

      await Promise.all(
        batch.map(async (user) => {
          try {
            const existingUser = await User.findOne({
              $or: [{ email: user.email }, { username: user.username }],
            });

            if (existingUser) {
              console.orange(`Skipping: ${user.username}`);
              skippedCount++;
              return;
            }

            const result = await registerUser(user, {
              emailVerified: true,
            });

            if (result.status === 200) {
              // console.green(`Created: ${user.username}`);
              createdCount++;
            } else {
              console.red(`Failed: ${user.username} - ${result.message}`);
              failedCount++;
            }
          } catch (err) {
            console.red(`Error: ${user.username} - ${err.message}`);
            failedCount++;
          }
        }),
      );
    }

    console.purple('\n📊 Summary:');
    console.green(`✔ Created: ${createdCount}`);
    console.orange(`⚠ Skipped: ${skippedCount}`);
    console.red(`✖ Failed: ${failedCount}`);
    console.purple('\n✅ Dummy users created successfully!\n');
    silentExit(0);
  } catch (err) {
    console.red(`Bulk creation failed: ${err.message}`);
    silentExit(1);
  }
};
(async () => {
  await connect();
  let count = 1000;

  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith('--count=')) {
      count = parseInt(process.argv[i].split('=')[1], 10);
    }
  }
  await createDummyUsers(count);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }

  if (!err.message.includes('fetch failed')) {
    process.exit(1);
  }
});
