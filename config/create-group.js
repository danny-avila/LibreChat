const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const Group = require('~/models/Group');
const connect = require('./connect');

(async () => {
  await connect();

  console.purple('---------------------------------------');
  console.purple('Create a New Group');
  console.purple('---------------------------------------');

  // Prompt for basic group info.
  const groupName = process.argv[2] || (await askQuestion('Group name: '));
  const groupDescription =
    process.argv[3] || (await askQuestion('Group description (optional): '));

  // Ask for the group type (local or openid; defaults to local)
  let groupType =
    process.argv[4] ||
    (await askQuestion('Group type (local/openid, default is local): '));
  groupType = groupType.trim().toLowerCase() || 'local';

  let groupData;
  if (groupType === 'openid') {
    // For OpenID groups, prompt for an external ID.
    const externalId =
      process.argv[5] ||
      (await askQuestion('External ID for OpenID group: '));
    groupData = {
      name: groupName,
      description: groupDescription,
      provider: 'openid',
      externalId: externalId.trim(),
    };
  } else {
    // For local groups, we only need name and description.
    groupData = {
      name: groupName,
      description: groupDescription,
      provider: 'local',
    };
  }

  // Create the group document
  let group;
  try {
    group = await Group.create(groupData);
  } catch (error) {
    console.red('Error creating group: ' + error.message);
    silentExit(1);
  }
  console.green(`Group created successfully with id: ${group._id}`);
  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error:');
  console.error(err);
  process.exit(1);
});