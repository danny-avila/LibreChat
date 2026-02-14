/**
 * Jest config for E2E summarization tests.
 * Uses real API keys from the root .env (NOT the mock .env.test).
 * Run: npx jest --config api/test/e2e/jest.e2e.config.js
 */
const path = require('path');

module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  roots: [path.resolve(__dirname)],
  testTimeout: 180_000,
  moduleNameMapper: {
    '~/(.*)': path.resolve(__dirname, '../../$1'),
  },
  // Do NOT use api/test/jestSetup.js — it overrides API keys with 'test'.
  setupFiles: [path.resolve(__dirname, './e2e-setup.js')],
  transformIgnorePatterns: ['/node_modules/(?!(openid-client|oauth4webapi|jose)/).*/'],
  // @librechat/api opens a Redis connection on import; force exit to avoid hanging.
  forceExit: true,
};
