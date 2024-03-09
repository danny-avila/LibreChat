const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const User = require('~/models/User');
const connect = require('./connect');

(async () => {
  await connect();

  /**
   * Show the welcome / help menu
   */
  console.purple('---------------');
  console.purple('Deleting a user');
  console.purple('---------------');

  let email = '';
  if (process.argv.length >= 3) {
    email = process.argv[2];
  } else {
    email = await askQuestion('Email:');
  }
  let user = await User.findOne({ email: email });
  if (user !== null) {
    if ((await askQuestion(`Delete user ${user}?`)) === 'y') {
      user = await User.findOneAndDelete({ _id: user._id });
      if (user !== null) {
        console.yellow(`Deleted user ${user}`);
      } else {
        console.yellow(`Couldn't delete user with email ${email}`);
      }
    }
  } else {
    console.yellow(`Didn't find user with email ${email}`);
  }

  silentExit(0);
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
