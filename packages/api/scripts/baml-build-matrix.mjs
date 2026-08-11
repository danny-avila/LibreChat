import { spawnSync } from 'node:child_process';
import path from 'node:path';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '../..');
const TIMEOUT_MS = 10 * 60_000;

if (process.version !== 'v24.16.0') {
  throw new Error(`The BAML build matrix requires Node v24.16.0, found ${process.version}.`);
}

const run = (command, args, cwd) => {
  process.stdout.write(`\n> ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
    timeout: TIMEOUT_MS,
  });
  if (result.error != null) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
  }
};

const legs = [
  { name: 'npm build', command: 'npm', args: ['run', 'build'], cwd: PACKAGE_ROOT },
  { name: 'npm build:dev', command: 'npm', args: ['run', 'build:dev'], cwd: PACKAGE_ROOT },
  { name: 'Bun b:build', command: 'bun', args: ['run', 'b:build'], cwd: PACKAGE_ROOT },
  { name: 'Bun b:build:dev', command: 'bun', args: ['run', 'b:build:dev'], cwd: PACKAGE_ROOT },
  { name: 'root build:api', command: 'npm', args: ['run', 'build:api'], cwd: REPO_ROOT },
  {
    name: 'filtered Turbo',
    command: 'npx',
    args: ['turbo', 'run', 'build', '--filter=@librechat/api', '--force'],
    cwd: REPO_ROOT,
  },
];

// The compiled API's public entry resolves these workspace packages at boot.
run('npm', ['run', 'build:data-provider'], REPO_ROOT);
run('npm', ['run', 'build:data-schemas'], REPO_ROOT);

for (const leg of legs) {
  process.stdout.write(`\n=== ${leg.name} ===\n`);
  run('npm', ['run', 'clean'], PACKAGE_ROOT);
  run(leg.command, leg.args, leg.cwd);
  run(process.execPath, ['scripts/verify-baml-dist.mjs'], PACKAGE_ROOT);
  run(process.execPath, ['scripts/baml-compiled-consumer.mjs', '--mode', 'non-baml'], PACKAGE_ROOT);
  run(process.execPath, ['scripts/baml-compiled-consumer.mjs', '--mode', 'baml'], PACKAGE_ROOT);
}

process.stdout.write(`\nBAML build matrix passed ${legs.length}/${legs.length} legs.\n`);
