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

  // Read arguments from CLI or prompt the user
  let groupName = process.argv[2] || (await askQuestion('Group name: '));
  let groupDescription =
    process.argv[3] || (await askQuestion('Group description (optional): '));
  let allowedEndpointsInput =
    process.argv[4] ||
    (await askQuestion(
      'Allowed endpoints (comma separated, e.g., "assistants,agents", or enter "*" for all): ',
    ));
  let allowedModelsInput =
    process.argv[5] ||
    (await askQuestion(
      'Allowed models (comma separated, e.g., "gpt-4,chatgpt-4o-latest", or enter "*" for all): ',
    ));

  // Process the comma-separated inputs into arrays
  const allowedEndpoints = allowedEndpointsInput
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s);
  const allowedModels = allowedModelsInput
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s);

  // Create the group document
  let group;
  try {
    group = await Group.create({
      name: groupName,
      description: groupDescription,
      allowedEndpoints,
      allowedModels,
    });
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