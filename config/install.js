/**
 * Install script: WIP
 */
const fs = require('fs');
const { exit } = require('process');
const { askQuestion } = require('./helpers');

// If we are not in a TTY, lets exit
if (!process.stdin.isTTY) {
  console.log('Note: we are not in a TTY, skipping install script.')
  exit(0);
}

// Save the original console.log function
const originalConsoleWarn = console.warn;
console.warn = () => {};
const loader = require('./loader');
console.warn = originalConsoleWarn;

const rootEnvPath = loader.resolve('.env');

// Skip if the env file exists
if (fs.existsSync(rootEnvPath)) {
  exit(0);
}

// Run the upgrade script if the legacy api/env file exists
// Todo: remove this in a future version
if (fs.existsSync(loader.resolve('api/.env'))) {
  console.warn('Upgrade script has yet to run, lets do that!');
  require('./upgrade');
  exit(0);
}

// Check the example file exists
if (!fs.existsSync(rootEnvPath + '.example')) {
  console.red('It looks like the example env file is missing, please complete setup manually.');
  exit(0);
}

// Copy the example file
fs.copyFileSync(rootEnvPath + '.example', rootEnvPath);

// Update the secure keys!
loader.addSecureEnvVar(rootEnvPath, 'CREDS_KEY', 32);
loader.addSecureEnvVar(rootEnvPath, 'CREDS_IV', 16);
loader.addSecureEnvVar(rootEnvPath, 'JWT_SECRET', 32);
loader.addSecureEnvVar(rootEnvPath, 'MEILI_MASTER_KEY', 32);

// Init env
let env = {};

(async () => {
  // Lets colour the console
  console.purple('=== LibreChat First Install ===');
  console.blue('Note: Leave blank to use the default value.');
  console.log(''); // New line

  // Ask for the app title
  const title = await askQuestion(
    'Enter the app title (default: "LibreChat"): '
  );
  env['APP_TITLE'] = title || 'LibreChat';

  // Ask for OPENAI_API_KEY
  const key = await askQuestion(
    'Enter your OPENAI_API_KEY (default: "user_provided"): '
  );
  env['OPENAI_API_KEY'] = key || 'user_provided';

  // GPT4???
  const gpt4 = await askQuestion(
    'Do you have access to the GPT4 api (y/n)? Default: n'
  );
  if (gpt4 == 'y' || gpt4 == 'yes') {
    env['OPENAI_MODELS'] = "gpt-3.5-turbo,gpt-3.5-turbo-0301,text-davinci-003,gpt-4,gpt-4-0314"
  } else {
    env['OPENAI_MODELS'] = "gpt-3.5-turbo,gpt-3.5-turbo-0301,text-davinci-003"
  }

  // Ask about mongodb
  const mongodb = await askQuestion(
    'What is your mongodb url? (default: mongodb://127.0.0.1:27017/LibreChat)'
  );
  env['MONGO_URI'] = mongodb || 'mongodb://127.0.0.1:27017/LibreChat';
  // Very basic check to make sure they entered a url
  if (!env['MONGO_URI'].includes('://')) {
    console.orange('Warning: Your mongodb url looks incorrect, please double check it in the `.env` file.');
  }

  // Lets ask about open registration
  const openReg = await askQuestion(
    'Do you want to allow user registration (y/n)? Default: y'
  );
  if (openReg === 'n' || openReg === 'no') {
    env['ALLOW_REGISTRATION'] = 'false';
    // Lets tell them about how to create an account:
    console.red('Note: You can create an account by running: `npm run create-user <email> <name> <username>`');
    // sleep for 1 second so they can read this
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Update the env file
  loader.writeEnvFile(rootEnvPath, env);

  // We can ask for more here if we want
  console.log(''); // New line
  console.green('Success! Please read our docs if you need help setting up the rest of the app.');
  console.log(''); // New line
})();
