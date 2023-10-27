const connectDb = require('@librechat/backend/lib/db/connectDb');
const { askQuestion, silentExit } = require('./helpers');
const banViolation = require('../api/cache/banViolation');
const User = require('@librechat/backend/models/User');

(async () => {
  try {
    console.orange('Connecting to the database...');
    await connectDb();
  } catch (e) {
    console.error(e);
    silentExit(1);
  }

  console.purple('---------------------');
  console.purple('Ban a user account!');
  console.purple('---------------------');

  let email = '';

  if (process.argv.length >= 3) {
    email = process.argv[2];
  } else {
    console.orange('Usage: npm run ban-user <email>');
    console.orange('Note: if you do not pass in the arguments, you will be prompted for them.');
    console.purple('--------------------------');
  }

  if (!email) {
    email = await askQuestion('Email:');
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

  const req = {}; // Create a request object
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
    type: 'concurrent',
    violation_count: 20,
    user_id: user._id,
    prev_count: 0,
    duration: 1000 * 60 * 60 * 24 * 7,
  };

  await banViolation(req, res, errorMessage);

  silentExit(0);
})();
