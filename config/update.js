const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { askQuestion, isDockerRunning, silentExit } = require('./helpers');

(async () => {
  const localUpdate = process.argv.includes('-l');
  let dockerUpdate = process.argv.includes('-d');

  if (!localUpdate) {
    dockerUpdate =
      dockerUpdate ||
      (await askQuestion('Are you using Docker? (y/n): ')).toLowerCase().startsWith('y');
  }

  if (dockerUpdate && !isDockerRunning()) {
    console.red(
      'Error: Docker is not running. You will need to start Docker Desktop or if using linux/mac, run `sudo systemctl start docker`',
    );
    silentExit(1);
  }
  // Set the directories
  const rootDir = path.resolve(__dirname, '..');
  const directories = [
    rootDir,
    path.resolve(rootDir, 'packages', 'data-provider'),
    path.resolve(rootDir, 'client'),
    path.resolve(rootDir, 'api'),
  ];

  // Function to delete node_modules
  function deleteNodeModules(dir) {
    const nodeModulesPath = path.join(dir, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      console.purple(`Deleting node_modules in ${dir}`);
      execSync(`rd /s /q "${nodeModulesPath}"`, { stdio: 'inherit', shell: 'cmd.exe' });
    }
  }

  // Fetch latest repo
  console.purple('Fetching the latest repo...');
  execSync('git fetch origin', { stdio: 'inherit' });

  // Switch to main branch
  console.purple('Switching to main branch...');
  execSync('git checkout main', { stdio: 'inherit' });

  // Git pull origin main
  console.purple('Pulling the latest code from main...');
  execSync('git pull origin main', { stdio: 'inherit' });

  if (dockerUpdate) {
    console.purple('Removing previously made Docker container...');
    execSync('docker-compose down --volumes', { stdio: 'inherit' });
    console.purple('Pruning all LibreChat Docker images...');
    try {
      execSync('docker rmi librechat:latest', { stdio: 'inherit' });
    } catch (e) {
      console.purple('Failed to remove Docker image librechat:latest. It might not exist.');
    }
    console.purple('Removing all unused dangling Docker images...');
    execSync('docker image prune -f', { stdio: 'inherit' });
    console.purple('Building new LibreChat image...');
    execSync('docker-compose build', { stdio: 'inherit' });
  } else {
    // Delete all node_modules
    directories.forEach(deleteNodeModules);

    // Run npm cache clean --force
    console.purple('Cleaning npm cache...');
    execSync('npm cache clean --force', { stdio: 'inherit' });

    // Install dependencies
    console.purple('Installing dependencies...');
    execSync('npm ci', { stdio: 'inherit' });

    // Build client-side code
    console.purple('Building frontend...');
    execSync('npm run frontend', { stdio: 'inherit' });
  }

  console.green(
    `Your LibreChat app is now up to date! Start with ${
      dockerUpdate ? '`docker-compose up`' : '`npm run backend`'
    }`,
  );
  console.orange(
    'Note: it\'s also recommended to clear your browser cookies and localStorage for LibreChat to assure a fully clean installation.',
  );
})();
