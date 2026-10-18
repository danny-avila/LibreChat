import initialExperiment from './stryker.config.mjs';
import apiJest from './packages/api/jest.config.mjs';

export default {
  ...initialExperiment,
  jest: {
    configFile: 'packages/api/jest.config.mjs',
    config: {
      // Match the normal API test:ci command; service integration tests run separately.
      testPathIgnorePatterns: [...apiJest.testPathIgnorePatterns, 'integration\\.'],
    },
    enableFindRelatedTests: false,
  },
  mutate: [
    'packages/api/src/**/*.{js,jsx,ts,tsx,cjs,mjs,cts,mts}',
    '!packages/api/src/**/*.{spec,test,helper,dev}.{js,jsx,ts,tsx,cjs,mjs,cts,mts}',
    '!packages/api/src/**/*.d.{ts,cts,mts}',
    '!packages/api/src/**/{__tests__,__mocks__,__fixtures__}/**',
  ],
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
  incrementalFile: 'reports/mutation/api/incremental.json',
  htmlReporter: { fileName: 'reports/mutation/api/index.html' },
  jsonReporter: { fileName: 'reports/mutation/api/mutation.json' },
};
