import { globSync } from 'glob';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import apiJest from '../../packages/api/jest.config.mjs';

export const shardCount = 16;
// Match the normal API test:ci selection, including its integration-test boundary.
export const apiJestOptions = {
  testPathIgnorePatterns: [...apiJest.testPathIgnorePatterns, 'integration\\.'],
  dependencyExtractor: '<rootDir>/../../config/jest.mutation-dependencies.cjs',
};
export const apiMutate = [
  'packages/api/src/**/*.{js,jsx,ts,tsx,cjs,mjs,cts,mts}',
  '!packages/api/src/**/*.{spec,test,helper,dev}.{js,jsx,ts,tsx,cjs,mjs,cts,mts}',
  '!packages/api/src/**/*.d.{ts,cts,mts}',
  '!packages/api/src/**/{__tests__,__mocks__,__fixtures__}/**',
];

export function partition(files, count) {
  if (!Number.isInteger(count) || count < 1 || count > files.length) {
    throw new Error('Shard count must be between 1 and the number of source files');
  }
  if (new Set(files).size !== files.length) {
    throw new Error('Duplicate source files in the shard plan');
  }
  // Keep nearby paths together to limit the number of unrelated test suites per job.
  const ordered = [...files].sort();
  return Array.from({ length: count }, (_, index) =>
    ordered.slice(
      Math.floor((index * ordered.length) / count),
      Math.floor(((index + 1) * ordered.length) / count),
    ),
  );
}

export function createPlan(count = shardCount) {
  const files = globSync(
    apiMutate.filter((pattern) => !pattern.startsWith('!')),
    {
      ignore: apiMutate
        .filter((pattern) => pattern.startsWith('!'))
        .map((pattern) => pattern.slice(1)),
      nodir: true,
      posix: true,
    },
  ).sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file).update('\0').update(readFileSync(file)).update('\0');
  }
  return { sourceHash: hash.digest('hex'), files, shards: partition(files, count) };
}

export function selectShard(value, plan = createPlan()) {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? '');
  const index = Number(match?.[1]);
  const total = Number(match?.[2]);
  if (total !== plan.shards.length || index < 1 || index > total || !match) {
    throw new Error(
      `MUTATION_SHARD must be between 1/${plan.shards.length} and ${plan.shards.length}/${plan.shards.length}`,
    );
  }
  const id = `shard-${String(index).padStart(2, '0')}-of-${total}`;
  return {
    id,
    index,
    total,
    commit: process.env.GITHUB_SHA ?? 'local',
    sourceHash: plan.sourceHash,
    sourceFileCount: plan.files.length,
    testSelection: 'jest-findRelatedTests',
    files: plan.shards[index - 1],
    directory: `reports/mutation/api-shards/${id}`,
  };
}

export function prepareShard(value) {
  const plan = createPlan();
  const shard = selectShard(value, plan);
  const config = { ...apiJest, ...apiJestOptions, rootDir: resolve('packages/api') };
  const listTests = (files) => {
    const args = [
      'node_modules/jest/bin/jest.js',
      '--config',
      JSON.stringify(config),
      '--listTests',
      '--json',
      '--runInBand',
    ];
    if (files) {
      args.push('--findRelatedTests', ...files);
    }
    const result = spawnSync(process.execPath, args, {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.status !== 0) {
      throw new Error(
        `Jest test discovery failed: ${result.error ?? result.stderr ?? result.stdout}`,
      );
    }
    return JSON.parse(result.stdout).map((file) =>
      relative(process.cwd(), file).replaceAll('\\', '/'),
    );
  };
  const allTests = listTests();
  const allRelatedTests = listTests(plan.files);
  const related = new Set(allRelatedTests);
  // Record suites outside the API source graph instead of silently claiming they ran.
  const unrelatedTestFiles = allTests.filter((file) => !related.has(file)).sort();
  const testFiles = listTests(shard.files).sort();
  return { ...shard, testFiles, unrelatedTestFiles, normalTestFileCount: allTests.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const command = process.argv[2];
  if (command === 'matrix') {
    const plan = createPlan();
    console.log(
      JSON.stringify({
        shard: plan.shards.map((_, index) => `${index + 1}/${plan.shards.length}`),
      }),
    );
  } else if (command === 'manifest') {
    const shard = prepareShard(process.env.MUTATION_SHARD);
    mkdirSync(shard.directory, { recursive: true });
    writeFileSync(join(shard.directory, 'manifest.json'), `${JSON.stringify(shard, null, 2)}\n`);
    if (process.env.GITHUB_ENV) {
      appendFileSync(
        process.env.GITHUB_ENV,
        `MUTATION_DIRECTORY=${shard.directory}\nMUTATION_ID=${shard.id}\n`,
      );
    }
    console.log(`${shard.id}: ${shard.files.length} of ${shard.sourceFileCount} source files`);
  } else {
    throw new Error('Usage: mutation-shards.mjs matrix|manifest');
  }
}
