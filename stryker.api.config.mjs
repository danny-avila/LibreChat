import initialExperiment from './stryker.config.mjs';
import { apiMutate, apiJestOptions, prepareShard } from './.github/scripts/mutation-shards.mjs';

const shard = process.env.MUTATION_SHARD ? prepareShard(process.env.MUTATION_SHARD) : undefined;
const reportDirectory = shard?.directory ?? 'reports/mutation/api';

export default {
  ...initialExperiment,
  jest: {
    configFile: 'packages/api/jest.config.mjs',
    config: {
      ...apiJestOptions,
      ...(shard && {
        testMatch: shard.testFiles.map((file) => `<rootDir>/${file.slice('packages/api/'.length)}`),
      }),
    },
    // Narrow test files for each mutant, then use per-test coverage within those files.
    enableFindRelatedTests: true,
  },
  mutate: shard?.files ?? apiMutate,
  concurrency: 1,
  testRunnerNodeArgs: ['--max-old-space-size=8192'],
  // A shard with no related tests must report uncovered mutants, not disappear.
  allowEmpty: Boolean(shard),
  // Include cross-workspace fixtures and built dependencies used by the API tests.
  ignorePatterns: [
    '**',
    '!package.json',
    '!config/jest*',
    '!packages/api/**',
    '!packages/data-provider/**',
    '!packages/data-schemas/**',
    '!api/**',
    '!client/src/**',
    '!client/public/mcp-sandbox.html',
    '!e2e/setup/**',
    '**/node_modules/**',
    '**/coverage/**',
    '**/.env*',
    'api/data/**',
    '**/logs/**',
    '**/*.log',
  ],
  dryRunTimeoutMinutes: 30,
  reporters: ['progress', 'html', 'json'],
  incremental: true,
  // Results from the previous all-tests selection must not be reused by this mode.
  incrementalFile: `${reportDirectory}/incremental-related.json`,
  htmlReporter: { fileName: `${reportDirectory}/index.html` },
  jsonReporter: { fileName: `${reportDirectory}/mutation.json` },
};
