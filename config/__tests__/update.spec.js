const fs = require('fs');
const vm = require('vm');
const path = require('path');

const configDir = path.resolve(__dirname, '..');
const updaterSource = fs.readFileSync(path.join(configDir, 'update.js'), 'utf8');
const helpersSource = fs.readFileSync(path.join(configDir, 'helpers.js'), 'utf8');

function runUpdater(args, { answers = [], failCommand } = {}) {
  const commands = [];
  const messages = [];
  const responses = [...answers];
  const modules = {
    path,
    stream: require('stream'),
    fs: { existsSync: () => false },
    readline: {
      createInterface: () => ({
        question: (_prompt, callback) => {
          if (!responses.length) {
            throw new Error('Unexpected updater prompt');
          }
          callback(responses.shift());
        },
        close: () => {},
      }),
    },
    child_process: {
      execSync: (command) => {
        commands.push(command);
        if (command === failCommand) {
          throw new Error(`Command failed: ${command}`);
        }
        return Buffer.from('');
      },
    },
  };
  const context = {
    __dirname: configDir,
    console: { log: (...values) => messages.push(values.join(' ')) },
    process: {
      argv: ['node', path.join(configDir, 'update.js'), ...args],
      exit: (code) => {
        throw new Error(`Exit ${code}`);
      },
    },
    require: (name) => {
      if (!Object.hasOwn(modules, name)) {
        throw new Error(`Unexpected updater dependency: ${name}`);
      }
      return modules[name];
    },
  };
  const helperModule = { exports: {} };
  // Run the real helpers and updater, with no access to external commands or filesystem writes.
  vm.runInNewContext(helpersSource, { ...context, module: helperModule });
  modules['./helpers'] = helperModule.exports;
  const completion = vm.runInNewContext(updaterSource, context, {
    filename: path.join(configDir, 'update.js'),
  });
  return { commands, messages, completion };
}

describe('Docker updater', () => {
  it.each([
    ['default compose', ['-d', '-g'], 'docker compose'],
    ['sudo', ['-d', '-g', '--sudo'], 'sudo docker compose'],
    ['single compose', ['-s', '-g'], 'docker compose -f ./docs/dev/single-compose.yml'],
    [
      'single compose with sudo',
      ['-s', '-g', '--sudo'],
      'sudo docker compose -f ./docs/dev/single-compose.yml',
    ],
    ['wizard', ['-g'], 'docker compose'],
  ])('pulls registry images and retains local builds: %s', async (_name, args, compose) => {
    const { commands, messages, completion } = runUpdater(args, { answers: ['y', 'y'] });
    await completion;

    const composeCommands = commands.filter((command) => command.startsWith(`${compose} `));
    expect(composeCommands).toEqual([
      `${compose} down`,
      `${compose} pull --ignore-buildable`,
      `${compose} build --no-cache`,
    ]);
    expect(commands.some((command) => command.startsWith('git '))).toBe(false);
    expect(messages.some((message) => message.includes(`${compose} up`))).toBe(true);
    expect(messages.some((message) => message.includes('now up to date!'))).toBe(true);
  });

  it('refreshes images after updating the checkout', async () => {
    const { commands, completion } = runUpdater(['-d']);
    await completion;

    expect(commands.slice(0, 4)).toEqual([
      'docker info',
      'git fetch origin',
      'git checkout main',
      'git pull origin main',
    ]);
    expect(commands).toContain('docker compose pull --ignore-buildable');
    expect(commands.indexOf('docker compose pull --ignore-buildable')).toBeGreaterThan(3);
  });

  it('does not report success or build after a pull failure', async () => {
    const { commands, messages, completion } = runUpdater(['-d', '-g'], {
      failCommand: 'docker compose pull --ignore-buildable',
    });

    await expect(completion).rejects.toThrow('Command failed: docker compose pull');
    expect(commands).not.toContain('docker compose build --no-cache');
    expect(messages.some((message) => message.includes('now up to date!'))).toBe(false);
  });

  it('still refreshes images when the old local image does not exist', async () => {
    const { commands, completion } = runUpdater(['-d', '-g'], {
      failCommand: 'docker rmi librechat:latest',
    });
    await completion;

    expect(commands).toContain('docker compose pull --ignore-buildable');
    expect(commands).toContain('docker compose build --no-cache');
  });

  it('stops before updating when Docker is unavailable', async () => {
    const { commands, completion } = runUpdater(['-d', '-g'], { failCommand: 'docker info' });

    await expect(completion).rejects.toThrow('Exit 1');
    expect(commands).toEqual(['docker info']);
  });

  it.each([
    [[], 'npm run frontend'],
    [['-b'], 'bun b:client'],
  ])('keeps local reinstalls free of Docker commands: %j', async (flags, build) => {
    const { commands, completion } = runUpdater(['-l', '-g', ...flags]);
    await completion;

    expect(commands).toEqual(['npm cache clean --force', 'npm ci', build]);
  });
});
