/**
 * Upgrade script
 */
const dotenv = require('dotenv');
const fs = require('fs');
const { exit } = require('process');

// Suppress default warnings
const originalConsoleWarn = console.warn;
console.warn = () => {};
const loader = require('./loader');
console.warn = originalConsoleWarn;

// Old Paths
const apiEnvPath = loader.resolve('api/.env');
const clientEnvPath = loader.resolve('client/.env');

// Load into env
dotenv.config({
  path: loader.resolve(apiEnvPath),
});
dotenv.config({
  path: loader.resolve(clientEnvPath),
});
// JS was doing spooky actions at a distance, lets prevent that
const initEnv = JSON.parse(JSON.stringify(process.env));

// New Paths
const rootEnvPath = loader.resolve('.env');
const devEnvPath = loader.resolve('.env.dev');
const prodEnvPath = loader.resolve('.env.prod');

if (fs.existsSync(rootEnvPath)) {
  console.error('Root env file already exists! Aborting');
  exit(1);
}

// Validate old configs
if (!fs.existsSync(apiEnvPath)) {
  console.error('Api env doesn\'t exit! Did you mean to run install?');
  exit(1);
}
if (!fs.existsSync(clientEnvPath)) {
  console.error('Client env doesn\'t exit! But api/.env does. Manual upgrade required');
  exit(1);
}

/**
 * Refactor the ENV if it has a prod_/dev_ version
 *
 * @param {*} varDev 
 * @param {*} varProd 
 * @param {*} varName 
 */
function refactorPairedEnvVar(varDev, varProd, varName) {
  // Lets validate if either of these are undefined, if so lets use the non-unefined one
  if (initEnv[varDev] === undefined && initEnv[varProd] === undefined) {
    console.error(`Both ${varDev} and ${varProd} are undefined! Manual intervention required!`);
  } else if (initEnv[varDev] === undefined) {
    fs.appendFileSync(rootEnvPath, `\n${varName}=${initEnv[varProd]}`);
  } else if (initEnv[varProd] === undefined) {
    fs.appendFileSync(rootEnvPath, `\n${varName}=${initEnv[varDev]}`);
  } else if (initEnv[varDev] === initEnv[varProd]) {
    fs.appendFileSync(rootEnvPath, `\n${varName}=${initEnv[varDev]}`);
  } else {
    fs.appendFileSync(rootEnvPath, `${varName}=${initEnv[varProd]}\n`);
    fs.appendFileSync(devEnvPath, `${varName}=${initEnv[varDev]}\n`);
  }
}

/**
 * Upgrade the env files!
 * 1. /api/.env will merge into /.env
 * 2. /client/.env will merge into /.env
 * 3. Any prod_/dev_ keys will be split up into .env.dev / .env.prod files (if they are different)
 */
if (fs.existsSync(apiEnvPath)) {
  fs.copyFileSync(apiEnvPath, rootEnvPath);
  fs.copyFileSync(apiEnvPath, rootEnvPath + '.api.bak');
  fs.unlinkSync(apiEnvPath);
}

// Clean up Domain variables
fs.appendFileSync(rootEnvPath, '\n\n##########################\n# Domain Variables:\n# Note: DOMAIN_ vars are passed to vite\n##########################\n');
refactorPairedEnvVar('CLIENT_URL_DEV', 'CLIENT_URL_PROD', 'DOMAIN_CLIENT');
refactorPairedEnvVar('SERVER_URL_DEV', 'SERVER_URL_PROD', 'DOMAIN_SERVER');

// Remove the old vars
const removeEnvs = {
  'NODE_ENV': 'remove',
  'OPENAI_KEY': 'remove',
  'CLIENT_URL_DEV': 'remove',
  'CLIENT_URL_PROD': 'remove',
  'SERVER_URL_DEV': 'remove',
  'SERVER_URL_PROD': 'remove',
  'JWT_SECRET_DEV': 'remove', // Lets regen
  'JWT_SECRET_PROD': 'remove', // Lets regen
  // Comments to remove:
  '#JWT:': 'remove',
  '# Add a secure secret for production if deploying to live domain.': 'remove',
  '# Site URLs:': 'remove',
  '# Don\'t forget to set Node env to development in the Server configuration section above': 'remove',
  '# if you want to run in dev mode': 'remove',
  '# Change these values to domain if deploying:': 'remove',
  '# Set Node env to development if running in dev mode.': 'remove'
}
loader.writeEnvFile(rootEnvPath, removeEnvs)

/**
 * Lets make things more secure!
 * 1. Add CREDS_KEY
 * 2. Add CREDS_IV
 * 3. Add JWT_SECRET
 */
fs.appendFileSync(rootEnvPath, '\n\n##########################\n# Secure Keys:\n##########################\n');
loader.addSecureEnvVar(rootEnvPath, 'CREDS_KEY', 32);
loader.addSecureEnvVar(rootEnvPath, 'CREDS_IV', 16);
loader.addSecureEnvVar(rootEnvPath, 'JWT_SECRET', 32);

// Lets update the openai key name, not the best spot in the env file but who cares ¯\_(ツ)_/¯
loader.writeEnvFile(rootEnvPath, {'OPENAI_API_KEY': initEnv['OPENAI_KEY']})

// TODO: we need to copy over the value of: VITE_SHOW_GOOGLE_LOGIN_OPTION & VITE_APP_TITLE
fs.appendFileSync(rootEnvPath, '\n\n##########################\n# Frontend Vite Variables:\n##########################\n');
const frontend = {
  'VITE_APP_TITLE': initEnv['VITE_APP_TITLE'] || '"LibreChat"',
  'VITE_SHOW_GOOGLE_LOGIN_OPTION': initEnv['VITE_SHOW_GOOGLE_LOGIN_OPTION'] || 'false',
  'ALLOW_REGISTRATION': 'true'
}
loader.writeEnvFile(rootEnvPath, frontend)

// Ensure .env.dev and .env.prod files end with a newline
if (fs.existsSync(devEnvPath)) {
  fs.appendFileSync(devEnvPath, '\n');
}
if (fs.existsSync(prodEnvPath)) {
  fs.appendFileSync(prodEnvPath, '\n');
}
// Remove client file
fs.copyFileSync(clientEnvPath, rootEnvPath + '.client.bak');
fs.unlinkSync(clientEnvPath);

console.log('Upgrade complete.');
