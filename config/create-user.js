const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { registerUser } = require('~/server/services/AuthService');
const { askQuestion, silentExit } = require('./helpers');
const User = require('~/models/User');
const connect = require('./connect');
const yargs = require('yargs');

const argv = yargs
  .option('email', {
    describe: "User's email address",
    type: 'string',
  })
  .option('name', {
    describe: "User's name",
    type: 'string',
  })
  .option('username', {
    describe: "User's username",
    type: 'string',
  })
  .option('password', {
    describe: "User's password",
    type: 'string',
  })
  .option('email-verified', {
    describe: 'Set email as verified',
    type: 'boolean',
    default: true,
  })
  .usage('Usage: $0 [options]')
  .example('$0 --email user@example.com --name "John Doe" --username johndoe --password mypassword')
  .help()
  .alias('help', 'h')
  .epilogue('For more information, check the documentation.').argv;

(async () => {
  await connect();

  console.purple('--------------------------');
  console.purple('Create a new user account!');
  console.purple('--------------------------');

  let { email, name, username, password } = argv;
  let emailVerified = argv['email-verified'];

  // Handle positional arguments for backwards compatibility
  if (!email && argv._[0]) email = argv._[0];
  if (!name && argv._[1]) name = argv._[1];
  if (!username && argv._[2]) username = argv._[2];
  if (!password && argv._[3]) password = argv._[3];

  if (!email) {
    email = await askQuestion('Email:');
  }
  if (!email.includes('@')) {
    console.red('Error: Invalid email address!');
    silentExit(1);
  }

  const defaultName = email.split('@')[0];
  if (!name) {
    name = await askQuestion(`Name: (default is: ${defaultName})`);
    if (!name) {
      name = defaultName;
    }
  }
  if (!username) {
    username = await askQuestion(`Username: (default is: ${defaultName})`);
    if (!username) {
      username = defaultName;
    }
  }
  if (!password) {
    password = await askQuestion('Password: (leave blank to generate one)');
    if (!password) {
      password = Math.random().toString(36).slice(-18);
      console.orange('Your generated password is: ' + password);
    }
  } else {
    console.orange('Warning: Password provided via command line argument. This is not secure!');
  } // Only prompt for emailVerified if it wasn't set via CLI
  if (emailVerified === undefined) {
    const emailVerifiedInput = await askQuestion(`Email verified? (Y/n, default is Y):

If \`y\`, the user's email will be considered verified.
      
If \`n\`, and email service is configured, the user will be sent a verification email.

If \`n\`, and email service is not configured, you must have the \`ALLOW_UNVERIFIED_EMAIL_LOGIN\` .env variable set to true,
or the user will need to attempt logging in to have a verification link sent to them.`);

    if (emailVerifiedInput.toLowerCase() === 'n') {
      emailVerified = false;
    } else {
      emailVerified = true;
    }
  }

  const userExists = await User.findOne({ $or: [{ email }, { username }] });
  if (userExists) {
    console.red('Error: A user with that email or username already exists!');
    if (userExists.email === email) {
      console.red(`The email '${email}' is already in use.`);
    }
    if (userExists.username === username) {
      console.red(`The username '${username}' is already taken.`);
    }
    console.orange('Please try again with a different email and/or username.');
    silentExit(1);
  }

  const user = { email, password, name, username, confirm_password: password };
  let result;
  try {
    result = await registerUser(user, { emailVerified });
  } catch (error) {
    console.red('Error: ' + error.message);
    silentExit(1);
  }

  if (result.status !== 200) {
    console.red('Error: ' + result.message);
    silentExit(1);
  }

  const userCreated = await User.findOne({ $or: [{ email }, { username }] });
  if (userCreated) {
    console.green('User created successfully!');
    console.green(`Email verified: ${userCreated.emailVerified}`);
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
