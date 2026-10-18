/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'jest',
  jest: {
    configFile: 'packages/data-provider/jest.config.js',
    config: {
      testMatch: ['<rootDir>/src/{balance,codeEnvRef,reasoning,toolTiming}.spec.ts'],
    },
    enableFindRelatedTests: true,
  },
  // This experiment measures four complete modules against their own unit suites.
  mutate: [
    'packages/data-provider/src/balance.ts',
    'packages/data-provider/src/codeEnvRef.ts',
    'packages/data-provider/src/reasoning.ts',
    'packages/data-provider/src/toolTiming.ts',
  ],
  // Copy only this workspace and its test configuration into the sandbox.
  ignorePatterns: [
    '**',
    '!package.json',
    '!config/jest.workers.cjs',
    '!packages/data-provider/package.json',
    '!packages/data-provider/jest.config.js',
    '!packages/data-provider/babel.config.js',
    '!packages/data-provider/src/**/*',
    '!packages/data-provider/specs/**/*',
  ],
  coverageAnalysis: 'perTest',
  concurrency: 2,
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  // This experiment reports gaps without adding a CI quality gate.
  thresholds: { break: 0 },
};
