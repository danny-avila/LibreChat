const connectDb = require('../api/lib/db/connectDb');
const { askQuestion, silentExit } = require('./helpers');
const User = require('../api/models/User');
const Transaction = require('../api/models/Transaction');

(async () => {
  /**
   * Connect to the database
   * - If it takes a while, we'll warn the user
   */
  // Warn the user if this is taking a while
  let timeout = setTimeout(() => {
    console.orange(
      'This is taking a while... You may need to check your connection if this fails.',
    );
    timeout = setTimeout(() => {
      console.orange('Still going... Might as well assume the connection failed...');
      timeout = setTimeout(() => {
        console.orange('Error incoming in 3... 2... 1...');
      }, 13000);
    }, 10000);
  }, 5000);
  // Attempt to connect to the database
  try {
    console.orange('Warming up the engines...');
    await connectDb();
    clearTimeout(timeout);
  } catch (e) {
    console.error(e);
    silentExit(1);
  }

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
  if (!result.tokenCredits) {
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
