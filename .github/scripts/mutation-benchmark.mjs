import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, relative, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, createWriteStream, existsSync } from 'node:fs';
import { finished } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { publicProgress } from './mutation-progress.mjs';
import apiJest from '../../packages/api/jest.config.mjs';
import config from '../../stryker.api.config.mjs';
import { apiJestOptions, prepareShard } from './mutation-shards.mjs';

if (process.env.MUTATION_SHARD) {
  throw new Error('Unset MUTATION_SHARD before running the controlled benchmark.');
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    profile: { type: 'string', default: 'small' },
    'jest-config': { type: 'string' },
  },
});
if (!['small', 'shard'].includes(values.profile) || positionals.length > 1) {
  throw new Error(
    'Usage: mutation-benchmark.mjs [output] --profile small|shard [--jest-config file]',
  );
}
const shard = values.profile === 'shard' ? prepareShard('2/16') : undefined;
const limitMinutes = shard ? 15 : 5;
// Keep fixed ranges so both modes exercise the same changes, including shared modules.
const mutate = shard
  ? [
      'packages/api/src/agents/compaction.ts:27:0-35:100',
      'packages/api/src/agents/envelope.ts:89:0-93:100',
      'packages/api/src/agents/files/matching.ts:28:0-43:100',
    ]
  : [
      'packages/api/src/middleware/code.ts:10:0-10:90',
      'packages/api/src/skills/sync/path.ts:9:0-9:50',
    ];
const sources = [...new Set(mutate.map((pattern) => pattern.split(':')[0]))];
if (shard && sources.some((file) => !shard.files.includes(file))) {
  throw new Error('The benchmark source ranges no longer belong to shard 2/16.');
}
const jestOverrides = values['jest-config']
  ? JSON.parse(readFileSync(resolve(values['jest-config']), 'utf8'))
  : {};
const directory = resolve(
  positionals[0] ?? `reports/mutation/benchmark-${new Date().toISOString().replaceAll(':', '-')}`,
);
if (existsSync(directory)) {
  throw new Error(`Use a new output directory to avoid mixing results: ${directory}`);
}
mkdirSync(directory, { recursive: true });
const jestConfig = { ...apiJest, ...apiJestOptions, rootDir: resolve('packages/api') };
const relatedTests = {};
for (const source of sources) {
  const selection = spawnSync(
    process.execPath,
    [
      'node_modules/jest/bin/jest.js',
      '--config',
      JSON.stringify(jestConfig),
      '--listTests',
      '--json',
      '--runInBand',
      '--findRelatedTests',
      source,
    ],
    { encoding: 'utf8' },
  );
  if (selection.status !== 0) throw new Error(selection.stderr);
  relatedTests[source] = JSON.parse(selection.stdout).map((file) => relative(process.cwd(), file));
}
const testFiles = shard?.testFiles ?? [...new Set(Object.values(relatedTests).flat())].sort();
if (shard) writeFileSync(join(directory, 'manifest.json'), JSON.stringify(shard, null, 2));
const sourceHash = createHash('sha256');
for (const file of [...sources, ...testFiles].sort()) {
  sourceHash.update(file).update('\0').update(readFileSync(file)).update('\0');
}
const state = {
  started: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  commit: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
  workingTree: spawnSync('git', ['status', '--short'], { encoding: 'utf8' }).stdout.trim(),
  sourceHash: sourceHash.digest('hex'),
  profile: values.profile,
  shard: shard?.id,
  limitMinutes,
  jestOverrides,
  mutate,
  testFiles,
  relatedTests,
  modes: [],
  parity: null,
  reliable: null,
  observationGaps: [],
};
state.configHash = createHash('sha256')
  .update(JSON.stringify({ config, jestOverrides }))
  .update(readFileSync('config/jest.mutation-dependencies.cjs'))
  .update(readFileSync('package-lock.json'))
  .digest('hex');
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
function render() {
  for (const mode of state.modes) {
    const logPath = join(directory, mode.name, 'run.log');
    if (!existsSync(logPath)) continue;
    const lines = readFileSync(logPath, 'utf8').split(/\r?\n/);
    const progress = lines.map(publicProgress).filter(Boolean).at(-1);
    if (progress) mode.progress = progress.text;
  }
  writeFileSync(join(directory, 'benchmark.json'), `${JSON.stringify(state, null, 2)}\n`);
  const rows = state.modes
    .map(
      (mode) =>
        `<tr><td>${escapeHtml(mode.name)}</td><td>${escapeHtml(mode.status)}${mode.runnerCrashes ? ` (${mode.runnerCrashes} runner crashes)` : ''}<br>${escapeHtml(mode.progress ?? 'Preparing')}</td><td>${((mode.durationMs ?? Date.now() - mode.startedMs) / 1000).toFixed(1)} s</td><td>${mode.mutants ?? '—'}</td><td><a href="${mode.name}/run.log">Log</a>${existsSync(join(directory, mode.name, 'index.html')) ? ` · <a href="${mode.name}/index.html">Mutation report</a>` : ''}</td></tr>`,
    )
    .join('');
  writeFileSync(
    join(directory, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${state.finished ? '' : '<meta http-equiv="refresh" content="10">'}<title>Related-test filtering benchmark</title><style>body{font:16px/1.5 system-ui;max-width:1000px;margin:40px auto;padding:0 24px;color:#17212e}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #dce3eb}code{overflow-wrap:anywhere}.notice{padding:16px;background:#fff4d6}a{color:#1258a2}</style></head><body><h1>Related-test filtering benchmark</h1>${state.observationGaps.length ? '<p class="notice">A long monitoring gap occurred. Check for host sleep or suspension. Wall-time ratios are unreliable.</p>' : ''}<p class="notice">${shard ? `Shard ${shard.index}/${shard.total}: three source ranges with the full shard test pool.` : 'Two small source ranges.'} Both modes use the same test pool and mutants. This is a speed and result-parity check, not a full API score. Each mode has a ${limitMinutes}-minute limit. Native filtering runs first; the second mode may benefit from warm caches.</p><table><tr><th>Mode</th><th>Status</th><th>Wall time</th><th>Mutants</th><th>Evidence</th></tr>${rows}</table><p>Matching mutant results: <strong>${state.parity === null ? 'Not established' : state.parity ? 'Yes' : 'No'}</strong></p><p>Clean runtime without crashes or mutant execution errors: <strong>${state.reliable === null ? 'Not established' : state.reliable ? 'Yes' : 'No'}</strong>.</p>${state.speedup ? `<p>Control time / native time: <strong>${state.speedup.toFixed(2)}×</strong> for this sample only. Values above 1 mean native was faster.</p>` : ''}<p>Shared test pool: ${testFiles.length} files. Native selection: ${Object.entries(
      relatedTests,
    )
      .map(([file, tests]) => `${escapeHtml(file)} → ${tests.length} files`)
      .join(
        '; ',
      )}.</p><p><a href="benchmark.json">Exact configuration, timings, and comparison</a></p></body></html>`,
  );
}
render();
let lastObservation = Date.now();
const ticker = setInterval(() => {
  const now = Date.now();
  if (now - lastObservation > 60000) {
    state.observationGaps.push({ from: lastObservation, to: now });
  }
  lastObservation = now;
  render();
}, 10000);
const heartbeat = setInterval(() => {
  const mode = state.modes.at(-1);
  if (mode?.status === 'running') {
    console.log(
      `${mode.name}: ${Math.round((Date.now() - mode.startedMs) / 1000)}s; ${mode.progress ?? 'preparing'}`,
    );
  }
}, 30000);

async function runMode(name, enableFindRelatedTests) {
  const folder = join(directory, name);
  mkdirSync(folder);
  const options = {
    ...config,
    mutate,
    jest: {
      ...config.jest,
      config: {
        ...config.jest.config,
        ...jestOverrides,
        testMatch: testFiles.map((file) => `<rootDir>/${file.slice('packages/api/'.length)}`),
      },
      enableFindRelatedTests,
    },
    concurrency: 1,
    // Each mode starts in a new folder. Save partial results without reusing prior runs.
    incremental: true,
    incrementalFile: join(folder, 'incremental.json'),
    tempDirName: join(folder, 'sandbox'),
    htmlReporter: { fileName: join(folder, 'index.html') },
    jsonReporter: { fileName: join(folder, 'mutation.json') },
  };
  const configFile = join(folder, 'stryker.json');
  writeFileSync(configFile, JSON.stringify(options, null, 2));
  const mode = { name, status: 'running', startedMs: Date.now() };
  state.modes.push(mode);
  render();
  console.log(`${name}: started, ${testFiles.length} baseline test files`);
  const log = createWriteStream(join(folder, 'run.log'), { mode: 0o600 });
  const child = spawn(
    process.execPath,
    [
      '--max-old-space-size=4096',
      'node_modules/@stryker-mutator/core/bin/stryker.js',
      'run',
      configFile,
    ],
    {
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        SCARF_ANALYTICS: 'false',
        JEST_JUNIT_OUTPUT_DIR: folder,
      },
    },
  );
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  let killed;
  let timedOut = false;
  const stop = (signal) => {
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  const timeout = setTimeout(() => {
    timedOut = true;
    stop('SIGINT');
    killed = setTimeout(() => stop('SIGKILL'), 30000);
  }, limitMinutes * 60000);
  const outcome = await new Promise((done, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => done({ code, signal }));
  });
  clearTimeout(timeout);
  clearTimeout(killed);
  log.end();
  await finished(log);
  Object.assign(mode, {
    ...outcome,
    durationMs: Date.now() - mode.startedMs,
    status: timedOut ? 'time limit reached' : outcome.code === 0 ? 'complete' : 'failed',
  });
  mode.runnerCrashes = (
    readFileSync(join(folder, 'run.log'), 'utf8').match(
      /WARN ChildProcessProxy.*exited unexpectedly/g,
    ) ?? []
  ).length;
  writeFileSync(join(folder, 'exit-code.txt'), String(outcome.code ?? 1));
  const reportFile = join(folder, 'mutation.json');
  if (mode.status === 'complete' && existsSync(reportFile)) {
    const report = JSON.parse(readFileSync(reportFile, 'utf8'));
    mode.results = Object.entries(report.files)
      .flatMap(([file, result]) =>
        result.mutants.map((mutant) => ({
          file,
          location: mutant.location,
          mutatorName: mutant.mutatorName,
          replacement: mutant.replacement,
          status: mutant.status,
        })),
      )
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    mode.mutants = mode.results.length;
  }
  console.log(`${name}: ${mode.status} in ${(mode.durationMs / 1000).toFixed(1)}s`);
  render();
}

try {
  await runMode('native', true);
  if (state.modes[0].status === 'complete') {
    await runMode('all-shard-tests', false);
    const [native, all] = state.modes;
    if (all.status === 'complete') {
      state.parity =
        native.mutants > 0 && JSON.stringify(native.results) === JSON.stringify(all.results);
      state.reliable =
        state.observationGaps.length === 0 &&
        state.modes.every((mode) => mode.runnerCrashes === 0) &&
        state.modes.every((mode) =>
          mode.results.every(
            (mutant) => !['RuntimeError', 'CompileError', 'Pending'].includes(mutant.status),
          ),
        );
      if (state.reliable && state.parity) state.speedup = all.durationMs / native.durationMs;
    }
  }
  process.exitCode = state.parity === true && state.reliable === true ? 0 : 1;
} finally {
  state.finished = new Date().toISOString();
  clearInterval(ticker);
  clearInterval(heartbeat);
  render();
  console.log(`Report: ${join(directory, 'index.html')}`);
}
