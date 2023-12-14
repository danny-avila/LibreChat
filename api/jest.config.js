module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  roots: ['<rootDir>'],
  coverageDirectory: 'coverage',
  setupFiles: [
    './test/jestSetup.js',
    './test/__mocks__/KeyvMongo.js',
    './test/__mocks__/logger.js',
  ],
  moduleNameMapper: {
    '~/(.*)': '<rootDir>/$1',
  },
};
