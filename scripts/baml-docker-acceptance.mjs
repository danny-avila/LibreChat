import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const CONSUMER = path.join(REPO_ROOT, 'packages/api/scripts/baml-compiled-consumer.mjs');
const TAG = `librechat-baml-acceptance:${process.pid}-${Date.now()}`;
const BUILD_TIMEOUT_MS = 30 * 60_000;

const run = (command, args, timeout = BUILD_TIMEOUT_MS) => {
  process.stdout.write(`\n> ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
    timeout,
  });
  if (result.error != null) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
  }
};

const dockerRun = (mode) =>
  run(
    'docker',
    [
      'run',
      '--rm',
      '--env',
      'BAML_DIST_DIR=/app/packages/api/dist',
      '--volume',
      `${CONSUMER}:/tmp/baml-compiled-consumer.mjs:ro`,
      TAG,
      'node',
      '/tmp/baml-compiled-consumer.mjs',
      '--mode',
      mode,
    ],
    120_000,
  );

try {
  run('docker', [
    'build',
    '--file',
    'Dockerfile.multi',
    '--target',
    'api-build',
    '--tag',
    TAG,
    '.',
  ]);

  run(
    'docker',
    [
      'run',
      '--rm',
      TAG,
      'sh',
      '-ec',
      [
        'test -f /app/packages/api/dist/baml/runtime.mjs',
        'test -f /app/packages/api/dist/baml/worker.mjs',
        'test ! -e /app/baml_ts/dist',
        'test ! -e /app/packages/api/src/baml',
      ].join('\n'),
    ],
    120_000,
  );

  dockerRun('non-baml');
  dockerRun('baml');
  process.stdout.write('\nDocker BAML acceptance passed both compiled consumers.\n');
} finally {
  spawnSync('docker', ['image', 'rm', '--force', TAG], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    timeout: 120_000,
  });
}
