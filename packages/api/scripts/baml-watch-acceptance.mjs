import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FINGERPRINT_FILE,
  GENERATED_DIR,
  PACKAGE_ROOT,
  SOURCE_DIR,
  currentFingerprint,
  parseFingerprint,
} from './bamlFingerprint.mjs';

const TIMEOUT_MS = 120_000;
const ORIGINAL_MARKER = 'openai/gpt-oss-120b';
const CHANGED_MARKER = 'openai/gpt-oss-120b-watch-acceptance';
const sourceFile = path.join(SOURCE_DIR, 'ns_host', 'clients.baml');
const workerFile = path.join(PACKAGE_ROOT, 'dist', 'baml', 'worker.mjs');

const parseScript = () => {
  const args = process.argv.slice(2);
  if (
    args.length !== 2 ||
    args[0] !== '--script' ||
    !['build:watch', 'build:watch:prod'].includes(args[1])
  ) {
    throw new Error(
      'Usage: baml-watch-acceptance.mjs --script build:watch | --script build:watch:prod',
    );
  }
  return args[1];
};

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed\n${result.stdout ?? ''}${result.stderr ?? ''}`,
    );
  }
};

const hashFile = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const waitFor = async (predicate, description, child) => {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`watcher exited with ${child.exitCode} before ${description}`);
    }
    try {
      const value = predicate();
      if (value) {
        return value;
      }
    } catch {
      // A generated tree or dist file can be transiently absent during atomic replacement.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${description}`);
};

const stop = async (child) => {
  if (child.exitCode != null) {
    return;
  }
  const exited = new Promise((resolve) => child.once('exit', resolve));
  if (process.platform === 'win32') {
    child.kill('SIGTERM');
  } else {
    process.kill(-child.pid, 'SIGTERM');
  }
  const bounded = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 10_000)),
  ]);
  if (bounded) {
    return;
  }
  if (process.platform === 'win32') {
    child.kill('SIGKILL');
  } else {
    process.kill(-child.pid, 'SIGKILL');
  }
  await exited;
};

const script = parseScript();
const originalSource = readFileSync(sourceFile, 'utf8');
assert.equal(
  originalSource.split(ORIGINAL_MARKER).length,
  2,
  `controlled fixture ${ORIGINAL_MARKER} must occur exactly once`,
);

const backupRoot = mkdtempSync(path.join(os.tmpdir(), 'baml-watch-acceptance-'));
const generatedBackup = path.join(backupRoot, 'generated');
const fingerprintBackup = path.join(backupRoot, 'baml.generated.sha256');
cpSync(GENERATED_DIR, generatedBackup, { recursive: true });
copyFileSync(FINGERPRINT_FILE, fingerprintBackup);

const restoreGeneratedArtifacts = () => {
  rmSync(GENERATED_DIR, { force: true, recursive: true });
  cpSync(generatedBackup, GENERATED_DIR, { recursive: true });
  copyFileSync(fingerprintBackup, FINGERPRINT_FILE);
  rmSync(backupRoot, { force: true, recursive: true });
};

run('npm', ['run', 'clean']);

const child = spawn('npm', ['run', script], {
  cwd: PACKAGE_ROOT,
  detached: process.platform !== 'win32',
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (chunk) => process.stdout.write(chunk));
child.stderr.on('data', (chunk) => process.stderr.write(chunk));

let sourceRestored = false;
try {
  const initialHash = await waitFor(
    () => {
      run(process.execPath, ['scripts/verify-baml-dist.mjs']);
      return hashFile(workerFile);
    },
    'the initial generated build',
    child,
  );

  const changedSource = originalSource.replace(ORIGINAL_MARKER, CHANGED_MARKER);
  writeFileSync(sourceFile, changedSource);
  const changedSourceHash = currentFingerprint().source;

  const changedHash = await waitFor(
    () => {
      const recorded = parseFingerprint(readFileSync(FINGERPRINT_FILE, 'utf8'));
      const distHash = hashFile(workerFile);
      return recorded.source === changedSourceHash && distHash !== initialHash ? distHash : null;
    },
    'regeneration and a changed worker hash',
    child,
  );
  assert.notEqual(changedHash, initialHash);

  writeFileSync(sourceFile, originalSource);
  sourceRestored = true;
  const originalSourceHash = currentFingerprint().source;
  await waitFor(
    () => {
      const recorded = parseFingerprint(readFileSync(FINGERPRINT_FILE, 'utf8'));
      return recorded.source === originalSourceHash && hashFile(workerFile) === initialHash;
    },
    'fixture restoration and the original worker hash',
    child,
  );

  process.stdout.write(`${script}: initial build, regeneration, rebuild, and restore passed\n`);
} finally {
  if (!sourceRestored) {
    writeFileSync(sourceFile, originalSource);
  }
  try {
    await stop(child);
  } finally {
    restoreGeneratedArtifacts();
  }
}
