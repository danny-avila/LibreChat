module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  roots: ['<rootDir>'],
  coverageDirectory: 'coverage',
  // testMatch: ['<rootDir>/api/**/*.test.js'],
  testPathIgnorePatterns: ['<rootDir>/client/'],
};
