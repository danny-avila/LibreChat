module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  experimentalVmModules: true,
  roots: ['<rootDir>'],
  coverageDirectory: 'coverage',
  maxWorkers: '50%',
  workerIdleMemoryLimit: process.env.CI ? '1GB' : undefined,
  testTimeout: 30000, // 30 seconds timeout for all tests
  setupFiles: ['./test/jestSetup.js', './test/__mocks__/logger.js'],
  moduleNameMapper: {
    '~/(.*)': '<rootDir>/$1',
    '~/data/auth.json': '<rootDir>/__mocks__/auth.mock.json',
    '^openid-client/passport$': '<rootDir>/test/__mocks__/openid-client-passport.js',
    '^openid-client$': '<rootDir>/test/__mocks__/openid-client.js',
    '^ai-tokenizer/encoding/(.*)$': '<rootDir>/../node_modules/ai-tokenizer/dist/encoding/$1.cjs',
  },
  transformIgnorePatterns: ['/node_modules/(?!(openid-client|oauth4webapi|jose)/).*/'],
};
