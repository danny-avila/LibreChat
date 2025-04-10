const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { SystemRoles } = require('librechat-data-provider');
const User = require('~/models/User');
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

/**
 * Script to promote a user to administrator status
 * Usage: npm run promote-admin <email>
 */
(async () => {
  await connect();

  console.purple('---------------------------');
  console.purple('Promote user to admin role!');
  console.purple('---------------------------');

  let email = '';

  // Parse command line arguments
  if (process.argv.length >= 3) {
    email = process.argv[2];
  }

  if (!email) {
    email = await askQuestion('Email of the user to promote:');
  }

  if (!email.includes('@')) {
    console.red('Error: Invalid email address!');
    silentExit(1);
  }

  // Find the user by email
  const user = await User.findOne({ email });
  if (!user) {
    console.red(`Error: No user found with email ${email}`);
    silentExit(1);
  }

  // Check if the user is already an admin
  if (user.role === SystemRoles.ADMIN) {
    console.orange(`User ${email} is already an administrator.`);
    silentExit(0);
  }

  // Confirm the promotion
  const confirmation = await askQuestion(
    `Are you sure you want to promote ${email} to administrator? (y/N): `,
  );

  if (confirmation.toLowerCase() !== 'y') {
    console.orange('Operation cancelled.');
    silentExit(0);
  }

  try {
    // Update the user's role to admin
    const updatedUser = await User.findOneAndUpdate(
      { email },
      { $set: { role: SystemRoles.ADMIN } },
      { new: true },
    );

    if (updatedUser && updatedUser.role === SystemRoles.ADMIN) {
      console.green(`User ${email} has been successfully promoted to administrator!`);
      silentExit(0);
    } else {
      console.red('Error: Failed to update user role!');
      silentExit(1);
    }
  } catch (error) {
    console.red(`Error: ${error.message}`);
    silentExit(1);
  }
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