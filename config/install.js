/**
 * Install script: WIP
 */
const fs = require('fs');
const readline = require('readline');
const { exit } = require('process');

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
    rl.question(query, (ans) => {
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

  console.log('Welcome to the ChatGPT Clone install script!');
  console.log('Please answer the following questions to setup your environment.');
  // Ask for the app title
  const title = await askQuestion(
    'Enter the app title (default: "ChatGPT Clone"): '
  );
  env['VITE_APP_TITLE'] = title || 'ChatGPT Clone';

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

  // Update the env file
  loader.writeEnvFile(rootEnvPath, env);

  // We can ask for more here if we want

  console.log('Environment setup complete.');
})();

