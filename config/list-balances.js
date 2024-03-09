const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { silentExit } = require('./helpers');
const Balance = require('~/models/Balance');
const User = require('~/models/User');
const connect = require('./connect');

(async () => {
  await connect();

  /**
   * Show the welcome / help menu
   */
  console.purple('-----------------------------');
  console.purple('Show the balance of all users');
  console.purple('-----------------------------');

  let users = await User.find({});
  for (const user of users) {
    let balance = await Balance.findOne({ user: user._id });
    if (balance !== null) {
      console.green(`User ${user.name} has a balance of ${balance.tokenCredits}`);
    } else {
      console.yellow(`User ${user.name} has no balance`);
    }
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
