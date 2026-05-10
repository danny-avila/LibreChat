/**
 * Jest config for FerretDB integration tests.
 * These tests require a running FerretDB instance and are NOT run in CI.
 *
 * Usage:
 *   FERRETDB_URI="mongodb://ferretdb:ferretdb@127.0.0.1:27020/test_db" \
 *     npx jest --config misc/ferretdb/jest.ferretdb.config.mjs --testTimeout=300000 [pattern]
 */
export default {
  rootDir: '../..',
  testMatch: ['<rootDir>/misc/ferretdb/**/*.ferretdb.spec.ts'],
  moduleNameMapper: {
    '^@src/(.*)$': '<rootDir>/src/$1',
    '^~/(.*)$': '<rootDir>/src/$1',
  },
  restoreMocks: true,
  testTimeout: 300000,
};
