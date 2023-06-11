module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  coverageDirectory: 'coverage',
  testMatch: ['<rootDir>/api/**/*.test.js'],
  testPathIgnorePatterns: ['<rootDir>/client/'],
  setupFiles: ['./e2e/jestSetup.js']
};
