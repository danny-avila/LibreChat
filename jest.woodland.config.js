module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  roots: ['<rootDir>'],
  testTimeout: 30000,
  moduleNameMapper: {
    '^~/(.*)$': '<rootDir>/api/$1',
    '^~/data/auth.json$': '<rootDir>/api/__mocks__/auth.mock.json',
    '^openid-client/passport$': '<rootDir>/api/test/__mocks__/openid-client-passport.js',
    '^openid-client$': '<rootDir>/api/test/__mocks__/openid-client.js',
  },
  transformIgnorePatterns: ['/node_modules/(?!(openid-client|oauth4webapi|jose)/).*/'],
};