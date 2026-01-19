const { execSync } = require('child_process');
const { isDockerRunning, silentExit } = require('./helpers');

async function validateDockerRunning() {
  if (!isDockerRunning()) {
    console.red(
      'Error: Docker is not running. You will need to start Docker Desktop or if using linux/mac, run `sudo systemctl start docker`',
    );
    silentExit(1);
  }
}

function getCurrentBranch() {
  return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
}

const shouldRebase = process.argv.includes('--rebase');

(async () => {
  console.green(
    'Starting deployed update script, this may take a minute or two depending on your system and network.',
  );

  await validateDockerRunning();
  console.purple('Fetching the latest repo...');
  execSync('git fetch origin', { stdio: 'inherit' });

  if (!shouldRebase) {
    execSync('git checkout main', { stdio: 'inherit' });
    console.purple('Pulling the latest code from main...');
    execSync('git pull origin main', { stdio: 'inherit' });
  } else if (shouldRebase) {
    const currentBranch = getCurrentBranch();
    console.purple(`Rebasing ${currentBranch} onto main...`);
    execSync('git rebase origin/main', { stdio: 'inherit' });
  }

  console.purple('Removing previously made Docker container...');
  const downCommand = 'sudo docker compose -f ./deploy-compose.yml down';
  console.orange(downCommand);
  execSync(downCommand, { stdio: 'inherit' });

  console.purple('Removing all tags for VestAI `deployed` images...');
  const repositories = ['ghcr.io/doktransfers/vestai-dev-api', 'vestai-client'];
  repositories.forEach((repo) => {
    const tags = execSync(`sudo docker images ${repo} -q`, { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    tags.forEach((tag) => {
      const removeImageCommand = `sudo docker rmi ${tag}`;
      console.orange(removeImageCommand);
      execSync(removeImageCommand, { stdio: 'inherit' });
    });
  });

  console.purple('Pulling latest VestAI images...');
  const pullCommand = 'sudo docker compose -f ./deploy-compose.yml pull api';
  console.orange(pullCommand);
  execSync(pullCommand, { stdio: 'inherit' });

  let startCommand = 'sudo docker compose -f ./deploy-compose.yml up -d';
  console.green('Your VestAI app is now up to date! Start the app with the following command:');
  console.purple(startCommand);
  console.orange(
    "Note: it's also recommended to clear your browser cookies and localStorage for VestAI to assure a fully clean installation.",
  );
  console.orange("Also: Don't worry, your data is safe :)");
})();
