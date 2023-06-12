/**
 * Install script: WIP
 */
const fs = require('fs');
const readline = require('readline');
const { exit } = require('process');
require('./color-console');

// Save the original console.log function
const originalConsoleWarn = console.warn;
console.warn = () => {};
const loader = require('./loader');
console.warn = originalConsoleWarn;

const rootEnvPath = loader.resolve('.env');

if (fs.existsSync(rootEnvPath)) {
  console.info('Note: it looks like we\'ve already run the first install, skipping env changes.');
  // lets close this script without causing an error
  exit(0);
}

if (fs.existsSync(loader.resolve('api/.env'))) {
  console.warn('Upgrade script has yet to run, lets do that!');
  require('./upgrade');
  exit(0);
}

// Copy the example file
fs.copyFileSync(rootEnvPath + '.example', rootEnvPath);

// Lets update the secure keys!
loader.addSecureEnvVar(rootEnvPath, 'CREDS_KEY', 32);
loader.addSecureEnvVar(rootEnvPath, 'CREDS_IV', 16);
loader.addSecureEnvVar(rootEnvPath, 'JWT_SECRET', 32);
loader.addSecureEnvVar(rootEnvPath, 'MEILI_MASTER_KEY', 32);

// Init env
let env = {};

// Function to ask for user input
const askQuestion = (query) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question("\x1b[34m" + query + "\n> " + "\x1b[0m", (ans) => {
      rl.close();
      resolve(ans);
    })
  );
};


(async () => {
  // If the terminal accepts questions, lets ask for the env vars
  if (!process.stdin.isTTY) {
    // We could use this to pass in env vars but its untested
    /*if (process.argv.length > 2) {
      console.log('Using passed in env vars');
      process.argv.slice(2).forEach((arg) => {
        const [key, value] = arg.split('=');
        env[key] = value;
      });

      // Write the env file
      loader.writeEnvFile(rootEnvPath, env);
      console.log('Env file written successfully!');
      exit(0);
    }*/
    console.log('This terminal does not accept user input, skipping env setup.');
    exit(0);
  }

  // Lets colour the console
  console.purple('=== LibreChat First Install ===');
  console.cyan('Note: Leave blank to use the default value.');
  console.log(''); // New line

  // Ask for the app title
  const title = await askQuestion(
    'Enter the app title (default: "LibreChat"): '
  );
  env['VITE_APP_TITLE'] = title || 'LibreChat';

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

  // Update the env file
  loader.writeEnvFile(rootEnvPath, env);

  // We can ask for more here if we want
  console.log(''); // New line
  console.green('Success! Please read our docs if you need help setting up the rest of the app.');
  console.log(''); // New line
})();

