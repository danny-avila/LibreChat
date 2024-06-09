const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { sendEmail, checkEmailConfig } = require('~/server/utils');
const { askQuestion, silentExit } = require('./helpers');
const { createInvite } = require('~/models/inviteUser');
const User = require('~/models/User');
const connect = require('./connect');

(async () => {
  await connect();

  // Check if email service is enabled
  if (!checkEmailConfig()) {
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

  const token = await createInvite(email);
  const inviteLink = `${process.env.DOMAIN_CLIENT}/register?token=${token}`;

  // Send the invitation email
  let result;

  const appName = process.env.APP_TITLE || 'LibreChat';

  if (!checkEmailConfig()) {
    console.green('Send this link to the user:', inviteLink);
    silentExit(0);
  }

  try {
    result = await sendEmail({
      email: email,
      subject: `Invite to join ${appName}!`,
      payload: {
        appName: appName,
        inviteLink: inviteLink,
        year: new Date().getFullYear(),
      },
      template: 'inviteUser.handlebars',
    });
  } catch (error) {
    console.error('Error: ' + error.message);
    silentExit(1);
  }

  // Check the result
  if (!result || result.status !== 200) {
    console.error('Error: ' + (result ? result.message : 'No result returned from sendEmail'));
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
