/**
 * Runs one MCP authority contract against native MongoDB or a supplied Mongo-wire provider.
 *
 * Native reference run:
 *   npx jest --config misc/mcpAuthority/jest.mongo-wire.config.mjs
 *
 * External provider run:
 *   MCP_AUTHORITY_MONGO_WIRE_URI="mongodb://..." \
 *   MCP_AUTHORITY_MONGO_WIRE_PROVIDER="amazon-documentdb" \
 *     npx jest --config misc/mcpAuthority/jest.mongo-wire.config.mjs
 */
export default {
  rootDir: '../..',
  testMatch: ['<rootDir>/misc/mcpAuthority/**/*.mongo-wire.spec.ts'],
  moduleNameMapper: {
    '^@src/(.*)$': '<rootDir>/src/$1',
    '^~/(.*)$': '<rootDir>/src/$1',
  },
  restoreMocks: true,
  testTimeout: 300000,
};
