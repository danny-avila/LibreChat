const path = require('path');
const mongoose = require('mongoose');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
const { ViolationTypes } = require('librechat-data-provider');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const banViolation = require('~/cache/banViolation');
const connect = require('./connect');

(async () => {
  await connect();

  console.purple('---------------------');
  console.purple('Ban a user account!');
  console.purple('---------------------');

  let email = '';
  let duration = '';

  if (process.argv.length >= 4) {
    // Check if there are enough command-line arguments.
    email = process.argv[2];
    duration = parseInt(process.argv[3]); // Parse the duration as an integer.
  } else {
    console.orange('Usage: npm run ban-user <email> <duration>');
    console.orange('Note: if you do not pass in the arguments, you will be prompted for them.');
    console.purple('--------------------------');
  }

  if (!email) {
    email = await askQuestion('Email:');
  }

  if (!duration) {
    const durationInMinutes = await askQuestion('Duration (in minutes):');
    duration = parseInt(durationInMinutes) * 60000;
  }

  if (isNaN(duration) || duration <= 0) {
    console.red('Error: Invalid duration!');
    silentExit(1);
  }

  if (!email.includes('@')) {
    console.red('Error: Invalid email address!');
    silentExit(1);
  }

  const user = await User.findOne({ email }).lean();
  if (!user) {
    console.red('Error: No user with that email was found!');
    silentExit(1);
  } else {
    console.purple(`Found user: ${user.email}`);
  }

  const req = {};
  const res = {
    clearCookie: () => {},
    status: function () {
      return this;
    },
    json: function () {
      return this;
    },
  };

  const errorMessage = {
    type: ViolationTypes.CONCURRENT,
    violation_count: 20,
    user_id: user._id,
    prev_count: 0,
    duration: duration,
  };

  await banViolation(req, res, errorMessage);

  silentExit(0);
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
