import { spawn, spawnSync } from 'node:child_process';
import chokidar from 'chokidar';
import { PACKAGE_ROOT, SOURCE_DIR } from './bamlFingerprint.mjs';

/**
 * The watch entry for `build:watch` / `build:watch:prod`.
 *
 * `tsdown --watch` alone is not enough: it rebuilds from the GENERATED SDK, so a
 * `.baml` edit would rebuild the same stale bytecode and the dev server would
 * keep answering with the previous protocol. This runs codegen first, then hands
 * off to the bundler watcher and re-runs codegen on every source change.
 *
 * Regenerations are serialized. `baml generate` rewrites the whole output tree,
 * and two overlapping runs would race the bundler onto a half-written directory.
 */

const node = process.execPath;

const generate = () => {
  const result = spawnSync(node, ['scripts/generate-baml.mjs'], {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
  });
  return result.status === 0;
};

if (!generate()) {
  process.stderr.write('watch-baml: initial BAML generation failed\n');
  process.exit(1);
}

const bundler = spawn('npx', ['tsdown', '--watch'], {
  cwd: PACKAGE_ROOT,
  stdio: 'inherit',
  shell: false,
});

let running = false;
let queued = false;

const regenerate = () => {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  process.stdout.write('watch-baml: BAML source changed, regenerating\n');
  generate();
  running = false;
  if (queued) {
    queued = false;
    regenerate();
  }
};

const watcher = chokidar.watch(SOURCE_DIR, { ignoreInitial: true });
watcher.on('all', (_event, changed) => {
  if (changed.endsWith('.baml')) {
    regenerate();
  }
});

const shutdown = () => {
  void watcher.close();
  bundler.kill('SIGTERM');
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
bundler.on('exit', (code) => {
  void watcher.close();
  process.exit(code ?? 0);
});
