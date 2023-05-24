/**
 * Upgrade script for vX.X.X to vX.X.X
 */
const fs = require('fs');
const path = require('path');

const rootEnvPath = path.resolve(process.cwd(), '.env');
const apiEnvPath = path.resolve(process.cwd(), 'api', '.env');
const clientEnvPath = path.resolve(process.cwd(), 'client', '.env');

const devEnvPath = path.resolve(process.cwd(), '.env.dev');
const prodEnvPath = path.resolve(process.cwd(), '.env.prod');

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const env = {};

  lines.forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      env[key.trim()] = value.trim();
    }
  });

  return env;
}

function refactorPairedEnvVar(clientEnv, varDev, varProd, varName) {
  if (clientEnv[varDev] === clientEnv[varProd]) {
    fs.appendFileSync(rootEnvPath, `\n${varName}=${clientEnv[varDev]}`);
  } else {
    fs.appendFileSync(devEnvPath, `${varName}=${clientEnv[varDev]}\n`);
    fs.appendFileSync(prodEnvPath, `${varName}=${clientEnv[varProd]}\n`);
  }
}

function refactorSingleEnvVar(clientEnv, oldVarName, newVarName) {
  fs.appendFileSync(rootEnvPath, `\n${newVarName}=${clientEnv[oldVarName]}`);
}

if (!fs.existsSync(rootEnvPath)) {
  if (fs.existsSync(apiEnvPath)) {
    fs.copyFileSync(apiEnvPath, rootEnvPath);
    fs.unlinkSync(apiEnvPath);
  }

  if (fs.existsSync(clientEnvPath)) {
    const clientEnv = parseEnvFile(clientEnvPath);

    // Refactor paired environment variables
    refactorPairedEnvVar(clientEnv, 'VITE_SERVER_URL_DEV', 'VITE_SERVER_URL_PROD', 'DOMAIN_SERVER');

    // Refactor single environment variables??? should we clean stuff up in general?
    // refactorSingleEnvVar(clientEnv, 'OLD_VAR_NAME', 'NEW_VAR_NAME');

    fs.unlinkSync(clientEnvPath);
  }
}

// Ensure .env.dev and .env.prod files end with a newline
if (fs.existsSync(devEnvPath)) {
  fs.appendFileSync(devEnvPath, '\n');
}
if (fs.existsSync(prodEnvPath)) {
  fs.appendFileSync(prodEnvPath, '\n');
}
