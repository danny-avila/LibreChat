const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit, connectWithTimeout } = require('./helpers');
const Transaction = require('~/models/Transaction');
const User = require('~/models/User');

(async () => {
  await connectWithTimeout();

  /**
   * Show the welcome / help menu
   */
  console.purple('--------------------------');
  console.purple('Add balance to a user account!');
  console.purple('--------------------------');
  /**
   * Set up the variables we need and get the arguments if they were passed in
   */
  let email = '';
  let amount = '';
  // If we have the right number of arguments, lets use them
  if (process.argv.length >= 3) {
    email = process.argv[2];
    amount = process.argv[3];
  } else {
    console.orange('Usage: npm run add-balance <email> <amount>');
    console.orange('Note: if you do not pass in the arguments, you will be prompted for them.');
    console.purple('--------------------------');
    // console.purple(`[DEBUG] Args Length: ${process.argv.length}`);
  }

  if (!process.env.CHECK_BALANCE) {
    console.red(
      'Error: CHECK_BALANCE environment variable is not set! Configure it to use it: `CHECK_BALANCE=true`',
    );
    silentExit(1);
  }

  /**
   * If we don't have the right number of arguments, lets prompt the user for them
   */
  if (!email) {
    email = await askQuestion('Email:');
  }
  // Validate the email
  if (!email.includes('@')) {
    console.red('Error: Invalid email address!');
    silentExit(1);
  }

  if (!amount) {
    amount = await askQuestion('amount: (default is 1000 tokens if empty or 0)');
  }
  // Validate the amount
  if (!amount) {
    amount = 1000;
  }

  // Validate the user
  const user = await User.findOne({ email }).lean();
  if (!user) {
    console.red('Error: No user with that email was found!');
    silentExit(1);
  } else {
    console.purple(`Found user: ${user.email}`);
  }

  /**
   * Now that we have all the variables we need, lets create the transaction and update the balance
   */
  let result;
  try {
    result = await Transaction.create({
      user: user._id,
      tokenType: 'credits',
      context: 'admin',
      rawAmount: +amount,
    });
  } catch (error) {
    console.red('Error: ' + error.message);
    console.error(error);
    silentExit(1);
  }

  // Check the result
  if (!result?.tokenCredits) {
    console.red('Error: Something went wrong while updating the balance!');
    console.error(result);
    silentExit(1);
  }

  // Done!
  console.green('Transaction created successfully!');
  console.purple(`Amount: ${amount}
New Balance: ${result.tokenCredits}`);
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
