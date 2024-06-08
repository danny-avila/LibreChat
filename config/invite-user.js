const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { registerUser } = require('~/server/services/AuthService');
const { askQuestion, silentExit } = require('./helpers');
const User = require('~/models/User');
const connect = require('./connect');
const { sendEmail, checkEmailConfig } = require('~/server/utils');

(async () => {
  await connect();

  // Check if email service is enabled
  if (!checkEmailConfig.isEnabled()) {
    console.red('Error: Email service is not enabled!');
    silentExit(1);
  }

  // Get the email of the user to be invited
  let email = '';
  if (process.argv.length >= 3) {
    email = process.argv[2];
  }
  if (!email) {
    email = await askQuestion('Email:');
  }
  // Validate the email
  if (!email.includes('@')) {
    console.red('Error: Invalid email address!');
    silentExit(1);
  }

  // Check if the user already exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    console.red('Error: A user with that email already exists!');
    silentExit(1);
  }

  // Create an invitation and send an email
  const invitation = { email };
  let result;
  try {
    result = await registerUser(invitation);
    await sendEmail(email, 'You are invited!', 'Please click the link to join us.');
  } catch (error) {
    console.red('Error: ' + error.message);
    silentExit(1);
  }

  // Check the result
  if (result.status !== 200) {
    console.red('Error: ' + result.message);
    silentExit(1);
  }

  // Done! (I hope)
  console.green('Invitation sent successfully!');
  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error:');
  console.error(err);
  process.exit(1);
});
