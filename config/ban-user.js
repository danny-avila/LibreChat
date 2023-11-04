const connectDb = require('@librechat/backend/lib/db/connectDb');
const { askQuestion, silentExit } = require('./helpers');
const banViolation = require('../api/cache/banViolation');
const User = require('@librechat/backend/models/User');

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
    type: 'concurrent',
    violation_count: 20,
    user_id: user._id,
    prev_count: 0,
    duration: duration,
  };

  await banViolation(req, res, errorMessage);

  silentExit(0);
})();
