const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const User = require('~/models/User');
const Group = require('~/models/Group');
const connect = require('./connect');

(async () => {
  await connect();

  console.purple('---------------------------------------');
  console.purple('Assign a Group to a User');
  console.purple('---------------------------------------');

  // Read arguments from CLI or prompt the user
  let userEmail = process.argv[2] || (await askQuestion('User email: '));
  let groupName = process.argv[3] || (await askQuestion('Group name to assign: '));

  // Validate email format
  if (!userEmail.includes('@')) {
    console.red('Error: Invalid email address!');
    silentExit(1);
  }

  // Find the group by name
  const group = await Group.findOne({ name: groupName });
  if (!group) {
    console.red('Error: No group with that name was found!');
    silentExit(1);
  }

  // Find the user by email
  const user = await User.findOne({ email: userEmail });
  if (!user) {
    console.red('Error: No user with that email was found!');
    silentExit(1);
  }
  console.purple(`Found user: ${user.email}`);

  // Assign the group to the user if not already assigned
  try {
    if (!user.groups) {
      user.groups = [];
    }
    if (!user.groups.includes(group._id)) {
      user.groups.push(group._id);
      await user.save();
    }
  } catch (error) {
    console.red('Error assigning group to user: ' + error.message);
    silentExit(1);
  }

  console.green(`User ${user.email} successfully assigned to group ${group.name}!`);
  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error:');
  console.error(err);
  process.exit(1);
});