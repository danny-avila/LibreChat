const path = require('path');

const babelPresetEnv = require.resolve('@babel/preset-env', {
  paths: [path.resolve(__dirname, '..')],
});

const esModules = [
  'openid-client',
  'oauth4webapi',
  'jose',
  'uuid',
  '@mistralai[\\\\/]mistralai',
  '@langchain[\\\\/]langgraph',
  '@langchain[\\\\/]langgraph-checkpoint',
].join('|');

module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  roots: ['<rootDir>'],
  coverageDirectory: 'coverage',
  maxWorkers,
  testTimeout: 30000, // 30 seconds timeout for all tests
  setupFiles: ['./test/jestSetup.js', './test/__mocks__/logger.js'],
  moduleNameMapper: {
    '~/(.*)': '<rootDir>/$1',
    '~/data/auth.json': '<rootDir>/__mocks__/auth.mock.json',
    '^openid-client/passport$': '<rootDir>/test/__mocks__/openid-client-passport.js',
    '^openid-client$': '<rootDir>/test/__mocks__/openid-client.js',
  },
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        presets: [[babelPresetEnv, { targets: { node: 'current' } }]],
      },
    ],
  },
  transformIgnorePatterns: [`[/\\\\]node_modules[/\\\\](?!(${esModules})([/\\\\]|$))`],
};
