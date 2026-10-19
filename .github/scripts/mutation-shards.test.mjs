import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combine } from './mutation-reports.mjs';
import { publicProgress } from './mutation-progress.mjs';
import mutationDependencies from '../../config/jest.mutation-dependencies.cjs';
import { partition, createPlan, selectShard, prepareShard } from './mutation-shards.mjs';

test('related-test discovery retains typed Jest imports without inventing dynamic dependencies', () => {
  const code = `
    jest.requireActual<typeof import('./types')>('./runtime');
    jest.requireMock<{ nested: Array<string> }>(\`./mocked\`);
    jest.requireActual<typeof Module>(variablePath);
    // jest.requireActual<Module>('./comment');
    const text = "jest.requireActual<Module>('./string')";
  `;
  assert.deepEqual(
    [...mutationDependencies.extract(code, 'sample.spec.ts', () => new Set(['./ordinary']))].sort(),
    ['./mocked', './ordinary', './runtime'],
  );
});

test('public progress shows counts but never forwards raw test details', () => {
  assert.equal(
    publicProgress(
      'Mutation testing 42% (elapsed: ~1m, remaining: ~2m) 42/100 tested (3 survived, 1 timed out)',
    ).text,
    '42%: 42/100 tested; 3 survived; 1 timed out.',
  );
  assert.equal(
    publicProgress(
      '\u001b[32m06:12:00 (123) INFO Instrumenter\u001b[39m Instrumented 57 source file(s) with 12000 mutant(s)',
    ).text,
    'Prepared 57 source files; 12000 mutants.',
  );
  assert.equal(
    publicProgress(
      '06:12:00 (123) INFO DryRunExecutor Initial test run succeeded. Ran 300 tests in 10 seconds (net 1 ms, overhead 9999 ms).',
    ).text,
    'Baseline passed: 300 tests.',
  );
  assert.equal(
    publicProgress(
      '06:12:00 (123) INFO DryRunExecutor Starting initial test run (jest test runner with "perTest" coverage analysis).',
    ).phase,
    'baseline tests',
  );
  assert.equal(
    publicProgress(
      '06:12:00 (123) WARN ChildProcessProxy Child process [pid 321] ran out of memory.',
    ).phase,
    'test runner restart',
  );
  assert.equal(
    publicProgress(
      '06:12:00 (123) ERROR DryRunExecutor One or more tests failed in the initial test run:',
    ).phase,
    'baseline failure',
  );
  for (const line of [
    'secret test failure details',
    'Error: token=private',
    'Mutation testing 42% (elapsed: 1m) 42/100 tested (3 survived, 1 timed out) secret',
    '06:12:00 (123) ERROR Stryker private exception',
  ]) {
    assert.equal(publicProgress(line), null);
  }
});

test('native selection retains typed imports and cross-folder tests and lists unrelated suites', () => {
  const plan = createPlan();
  const index = plan.shards.findIndex((files) =>
    files.includes('packages/api/src/middleware/code.ts'),
  );
  const shard = prepareShard(`${index + 1}/${plan.shards.length}`);
  assert.ok(shard.testFiles.includes('packages/api/src/middleware/code.spec.ts'));
  assert.ok(
    shard.testFiles.includes('packages/api/src/mcp/oauth/OAuthReconnectionManager.test.ts'),
  );
  assert.ok(shard.unrelatedTestFiles.includes('packages/api/src/cache/redisClients.tls.spec.ts'));
  assert.ok(!shard.unrelatedTestFiles.includes('packages/api/src/middleware/code.spec.ts'));
  assert.ok(shard.normalTestFileCount > shard.testFiles.length);
});

test('uneven shards cover every input exactly once and keep nearby files together', () => {
  const files = Array.from(
    { length: 19 },
    (_, index) => `src/${String(index).padStart(2, '0')}.ts`,
  );
  const shards = partition(files.toReversed(), 4);
  assert.deepEqual(shards.flat(), files);
  assert.equal(new Set(shards.flat()).size, files.length);
  assert.ok(shards.every((shard) => shard.length >= 4 && shard.length <= 5));
  assert.throws(() => partition(['a', 'a'], 1), /Duplicate/);
  assert.throws(() => partition(['a'], 2), /Shard count/);
});

test('the live API plan covers the full source selection without tests or declarations', () => {
  const plan = createPlan();
  assert.deepEqual(plan.shards.flat(), plan.files);
  assert.ok(plan.files.length > 0);
  assert.ok(
    plan.files.every(
      (file) =>
        !/\.(spec|test|helper|dev)\.|\.d\.(ts|mts|cts)$|\/(?:__tests__|__mocks__|__fixtures__)\//.test(
          file,
        ),
    ),
  );
  for (let index = 1; index <= plan.shards.length; index++) {
    assert.deepEqual(
      selectShard(`${index}/${plan.shards.length}`, plan).files,
      plan.shards[index - 1],
    );
  }
  for (const value of ['0/16', '17/16', '1/8', 'garbage', '../1/16']) {
    assert.throws(() => selectShard(value, plan), /MUTATION_SHARD/);
  }
});

function fixture(index) {
  const file = `src/${index}.ts`;
  return {
    complete: true,
    manifest: {
      id: `shard-0${index}-of-2`,
      index,
      total: 2,
      commit: 'abc',
      sourceHash: 'source-hash',
      sourceFileCount: 2,
      files: [file],
    },
    report: {
      schemaVersion: '1.0',
      framework: { name: 'StrykerJS', version: '10.0.0' },
      files: {
        [file]: {
          source: 'const x = 1;',
          language: 'typescript',
          mutants: [{ id: '0', status: 'Killed', killedBy: ['0'], coveredBy: ['0'] }],
        },
      },
      testFiles: {
        'src/cross-module.spec.ts': {
          source: 'test source',
          tests: [{ id: '0', name: `test ${index}` }],
        },
      },
    },
  };
}

test('merging namespaces mutant and test IDs while preserving cross-module test links', () => {
  const merged = combine([fixture(1), fixture(2)]);
  assert.equal(merged.complete, true);
  assert.equal(merged.completedShards, 2);
  const testIds = new Set(
    merged.report.testFiles['src/cross-module.spec.ts'].tests.map((test) => test.id),
  );
  assert.equal(testIds.size, 2);
  const mutants = Object.values(merged.report.files).flatMap((file) => file.mutants);
  assert.equal(new Set(mutants.map((mutant) => mutant.id)).size, 2);
  for (const mutant of mutants) {
    assert.ok(mutant.killedBy.every((id) => testIds.has(id)));
    assert.ok(mutant.coveredBy.every((id) => testIds.has(id)));
  }
});

test('missing, failed, or interrupted shards never produce a complete API result', () => {
  assert.equal(combine([fixture(1)]).complete, false);
  const partial = fixture(2);
  partial.complete = false;
  assert.equal(combine([fixture(1), partial]).complete, false);
  partial.report = null;
  assert.equal(combine([fixture(1), partial]).complete, false);
  assert.equal(combine([{ ...fixture(1), report: null, complete: false }]).report, null);
});

test('merging rejects overlapping files, duplicate shards, mixed commits, and missing assignments', () => {
  assert.throws(() => combine([fixture(1), fixture(1)]), /duplicate shard/);
  const mixed = fixture(2);
  mixed.manifest.commit = 'different';
  assert.throws(() => combine([fixture(1), mixed]), /different source/);
  const differentSelection = fixture(2);
  differentSelection.manifest.testSelection = 'jest-findRelatedTests';
  assert.throws(() => combine([fixture(1), differentSelection]), /test selection/);
  const overlap = fixture(2);
  overlap.manifest.files = ['src/1.ts'];
  assert.throws(() => combine([fixture(1), overlap]), /assigned twice/);
  const unexpected = fixture(2);
  unexpected.report.files['src/unassigned.ts'] = unexpected.report.files['src/2.ts'];
  assert.throws(() => combine([fixture(1), unexpected]), /Unexpected/);
  const missing = fixture(2);
  missing.manifest.files = [];
  missing.report = null;
  assert.throws(() => combine([fixture(1), missing]), /do not cover/);
});
