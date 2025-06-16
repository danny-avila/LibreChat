/** @type {import('jest').Config} */
module.exports = {
  // Define separate Jest projects
  projects: [
    // Default config for most tests
    {
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
      // testMatch: ['<rootDir>/**/*.spec.js', '<rootDir>/**/*.spec.ts'],
      testPathIgnorePatterns: [
        '<rootDir>/strategies/openidStrategy.spec.js',
        '<rootDir>/strategies/samlStrategy.spec.js',
        '<rootDir>/strategies/appleStrategy.test.js',
      ],
    },

    // Special config just for openidStrategy.spec.js
    {
      displayName: 'openid-strategy',
      testEnvironment: 'node',
      clearMocks: true,
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
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: {
              esModuleInterop: true,
              allowSyntheticDefaultImports: true,
            },
          },
        ],
      },
      testMatch: [
        '<rootDir>/strategies/openidStrategy.spec.js',
        '<rootDir>/strategies/samlStrategy.spec.js',
        '<rootDir>/strategies/appleStrategy.test.js',
      ],
    },
  ],
};
