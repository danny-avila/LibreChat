const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { deleteNodeModules } = require('./helpers');

// Set the directories
const rootDir = path.resolve(__dirname, '..');
const directories = [
  rootDir,
  path.resolve(rootDir, 'packages', 'data-provider'),
  path.resolve(rootDir, 'packages', 'mcp'),
  path.resolve(rootDir, 'client'),
  path.resolve(rootDir, 'api'),
];

// Delete package-lock.json if it exists
const packageLockPath = path.resolve(rootDir, 'package-lock.json');
if (fs.existsSync(packageLockPath)) {
  console.purple('Deleting package-lock.json...');
  fs.unlinkSync(packageLockPath);
}

(async () => {
  // Delete all node_modules
  directories.forEach(deleteNodeModules);

  // Run npm cache clean --force
  console.purple('Cleaning npm cache...');
  execSync('npm cache clean --force', { stdio: 'inherit' });

  // Install dependencies
  console.purple('Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });
})();
