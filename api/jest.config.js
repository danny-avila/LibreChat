/** @type {import('jest').Config} */
module.exports = {
  displayName: 'default',
  testEnvironment: 'node',
  clearMocks: true,
  roots: ['<rootDir>'],
  coverageDirectory: 'coverage',
  setupFiles: [
    './test/jestSetup.js',
    './test/__mocks__/logger.js',
    './test/__mocks__/fetchEventSource.js',
  ],
  moduleNameMapper: {
    '~/(.*)': '<rootDir>/$1',
    '~/data/auth.json': '<rootDir>/__mocks__/auth.mock.json',
    '^openid-client/passport$': '<rootDir>/test/__mocks__/openid-client-passport.js',
    '^openid-client$': '<rootDir>/test/__mocks__/openid-client.js',
  },
  transformIgnorePatterns: ['/node_modules/(?!(openid-client|oauth4webapi|jose)/).*/'],
};
