// eslint-disable-next-line
const helpers = require('./helpers');
const { exec } = require('child_process');
const { promisify } = require('util');

const isWindows = process.platform === 'win32';
const execAsync = promisify(exec);

async function main() {
  try {
    if (isWindows) {
      console.red('The backend process has been terminated');
      await execAsync('taskkill /F /IM node.exe /T');
    } else {
      await execAsync('pkill -f api/server/index.js');
      console.orange('The backend process has been terminated');
    }
  } catch (err) {
    console.red('The backend process has been terminated', err.message);
  }
}

main();
