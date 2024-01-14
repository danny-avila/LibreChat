module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  roots: ['<rootDir>'],
  coverageDirectory: 'coverage',
  setupFiles: [
    './test/jestSetup.js',
    './test/__mocks__/KeyvMongo.js',
    './test/__mocks__/logger.js',
    './test/__mocks__/fetchEventSource.js',
  ],
  moduleNameMapper: {
    '~/(.*)': '<rootDir>/$1',
    '~/data/auth.json': '<rootDir>/__mocks__/auth.mock.json',
  },
};
