module.exports = {
  roots: ['<rootDir>/src'],
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    url: 'http://localhost:3080',
  },
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!<rootDir>/node_modules/',
    '!src/**/*.css.d.ts',
    '!src/**/*.d.ts',
  ],
  coveragePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/test/setupTests.js',
  ],
  //  Todo: Add coverageThreshold once we have enough coverage
  //  Note: eventually we want to have these values set to 80% 
  // coverageThreshold: {
  //   global: {
  //     functions: 9,
  //     lines: 40,
  //     statements: 40,
  //     branches: 12,
  //   },
  // },
  moduleNameMapper: {
    '\\.(css)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      'jest-file-loader',
    'layout-test-utils': '<rootDir>/test/layout-test-utils',
    '^@src/(.*)$': '<rootDir>/src/$1',
    '^modules/(.*)$': '<rootDir>/src/modules/$1',
  },
  restoreMocks: true,
  testResultsProcessor: 'jest-junit',
  coverageReporters: ['text', 'cobertura', 'lcov'],
  transform: {
    '\\.[jt]sx?$': 'babel-jest',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      'jest-file-loader',
  },
  preset: 'ts-jest',
  setupFilesAfterEnv: ['@testing-library/jest-dom/extend-expect', '<rootDir>/test/setupTests.js'],
  clearMocks: true,
};
