/**
 * Helper functions
 * This allows us to give the console some colour when running in a terminal
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const askQuestion = (query) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question('\x1b[36m' + query + '\n> ' + '\x1b[0m', (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
};

const askMultiLineQuestion = (query) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.cyan(query);

  return new Promise((resolve) => {
    let lines = [];
    rl.on('line', (line) => {
      if (line.trim() === '.') {
        rl.close();
        resolve(lines.join('\n'));
      } else {
        lines.push(line);
      }
    });
  });
};

function isDockerRunning() {
  try {
    execSync('docker info');
    return true;
  } catch (e) {
    return false;
  }
}

function deleteNodeModules(dir) {
  const nodeModulesPath = path.join(dir, 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    console.purple(`Deleting node_modules in ${dir}`);
    fs.rmSync(nodeModulesPath, { recursive: true });
  }
}

const silentExit = (code = 0) => {
  console.log = () => {};
  process.exit(code);
};

// Set the console colours
console.orange = (msg) => console.log('\x1b[33m%s\x1b[0m', msg);
console.green = (msg) => console.log('\x1b[32m%s\x1b[0m', msg);
console.red = (msg) => console.log('\x1b[31m%s\x1b[0m', msg);
console.blue = (msg) => console.log('\x1b[34m%s\x1b[0m', msg);
console.purple = (msg) => console.log('\x1b[35m%s\x1b[0m', msg);
console.cyan = (msg) => console.log('\x1b[36m%s\x1b[0m', msg);
console.yellow = (msg) => console.log('\x1b[33m%s\x1b[0m', msg);
console.white = (msg) => console.log('\x1b[37m%s\x1b[0m', msg);
console.gray = (msg) => console.log('\x1b[90m%s\x1b[0m', msg);

module.exports = {
  askQuestion,
  askMultiLineQuestion,
  silentExit,
  isDockerRunning,
  deleteNodeModules,
};
