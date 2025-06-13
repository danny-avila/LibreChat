// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { deleteNodeModules } = require('./helpers');

// Set the directories
const rootDir = path.resolve(__dirname, '..');
const directories = [
  rootDir,
  path.resolve(rootDir, 'packages', 'data-provider'),
  path.resolve(rootDir, 'packages', 'data-schemas'),
  path.resolve(rootDir, 'packages', 'api'),
  path.resolve(rootDir, 'client'),
  path.resolve(rootDir, 'api'),
];

// Delete pnpm-lock.yaml if it exists
const packageLockPath = path.resolve(rootDir, 'pnpm-lock.yaml');
if (fs.existsSync(packageLockPath)) {
  console.purple('Deleting pnpm-lock.yaml...');
  fs.unlinkSync(packageLockPath);
}

(async () => {
  // Delete all node_modules
  directories.forEach(deleteNodeModules);

  // Run pnpm store prune
  console.purple('Cleaning pnpm store...');
  execSync('pnpm store prune', { stdio: 'inherit' });

  // Install dependencies
  console.purple('Installing dependencies...');
  execSync('pnpm install', { stdio: 'inherit' });
})();
