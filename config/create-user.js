const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { registerUser } = require('~/server/services/AuthService');
const { askQuestion, silentExit, connectWithTimeout } = require('./helpers');
const User = require('~/models/User');

(async () => {
  await connectWithTimeout();

  /**
   * Show the welcome / help menu
   */
  console.purple('--------------------------');
  console.purple('Create a new user account!');
  console.purple('--------------------------');
  // If we don't have enough arguments, show the help menu
  if (process.argv.length < 5) {
    console.orange('Usage: npm run create-user <email> <name> <username>');
    console.orange('Note: if you do not pass in the arguments, you will be prompted for them.');
    console.orange(
      'If you really need to pass in the password, you can do so as the 4th argument (not recommended for security).',
    );
    console.purple('--------------------------');
  }

  /**
   * Set up the variables we need and get the arguments if they were passed in
   */
  let email = '';
  let password = '';
  let name = '';
  let username = '';
  // If we have the right number of arguments, lets use them
  if (process.argv.length >= 4) {
    email = process.argv[2];
    name = process.argv[3];

    if (process.argv.length >= 5) {
      username = process.argv[4];
    }
    if (process.argv.length >= 6) {
      console.red('Warning: password passed in as argument, this is not secure!');
      password = process.argv[5];
    }
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

  const defaultName = email.split('@')[0];
  if (!name) {
    name = await askQuestion('Name: (default is: ' + defaultName + ')');
    if (!name) {
      name = defaultName;
    }
  }
  if (!username) {
    username = await askQuestion('Username: (default is: ' + defaultName + ')');
    if (!username) {
      username = defaultName;
    }
  }
  if (!password) {
    password = await askQuestion('Password: (leave blank, to generate one)');
    if (!password) {
      // Make it a random password, length 18
      password = Math.random().toString(36).slice(-18);
      console.orange('Your password is: ' + password);
    }
  }

  // Validate the user doesn't already exist
  const userExists = await User.findOne({ $or: [{ email }, { username }] });
  if (userExists) {
    console.red('Error: A user with that email or username already exists!');
    silentExit(1);
  }

  /**
   * Now that we have all the variables we need, lets create the user
   */
  const user = { email, password, name, username, confirm_password: password };
  let result;
  try {
    result = await registerUser(user);
  } catch (error) {
    console.red('Error: ' + error.message);
    silentExit(1);
  }

  // Check the result
  if (result.status !== 200) {
    console.red('Error: ' + result.message);
    silentExit(1);
  }

  // Done!
  const userCreated = await User.findOne({ $or: [{ email }, { username }] });
  if (userCreated) {
    console.green('User created successfully!');
    silentExit(0);
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
