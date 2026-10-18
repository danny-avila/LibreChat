const path = require('path');
const mongoose = require('mongoose');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { findPlatformOperator, transferPlatformOperator } = require('~/models');
const { applyOrganizationsMode, inLoginContext } = require('./organizations');
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

(async () => {
  await connect();
  const organizationsMode = await applyOrganizationsMode();

  console.purple('--------------------------');
  console.purple('Set the platform operator');
  console.purple('--------------------------');

  if (!organizationsMode) {
    console.red(
      'Error: The platform operator exists only when organizations are enabled in librechat.yaml.',
    );
    return silentExit(1);
  }

  const current = await findPlatformOperator();
  console.orange(`Current operator: ${current?.email ?? 'none'}`);

  let email = process.argv[2]?.trim();
  if (!email) {
    console.orange('Usage: npm run set-operator -- <email>');
    email = (await askQuestion('Email of the account to make the operator:')).trim();
  }

  const account = await inLoginContext(() => User.findOne({ email: email.toLowerCase() }).lean());
  if (!account) {
    console.red(`Error: No account found with email "${email}".`);
    return silentExit(1);
  }
  if (current && current._id.toString() === account._id.toString()) {
    console.green(`${account.email} is already the platform operator.`);
    return silentExit(0);
  }

  const confirm = await askQuestion(
    `Make ${account.email} the platform operator${
      current ? `, replacing ${current.email}` : ''
    }? (y/N)`,
  );
  if (confirm.toLowerCase() !== 'y') {
    console.yellow('Aborted.');
    return silentExit(0);
  }

  if (!(await transferPlatformOperator(account._id))) {
    console.red('Error: The account disappeared before the role could be handed over.');
    return silentExit(1);
  }
  console.green(`${account.email} is now the platform operator.`);
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
