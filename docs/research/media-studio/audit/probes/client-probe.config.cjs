const path = require('node:path');

const client = path.resolve(__dirname, '../../../../../client');
const base = require(path.join(client, 'jest.config.cjs'));

module.exports = {
  ...base,
  rootDir: client,
  roots: [__dirname],
  testMatch: ['**/client-transitions.spec.tsx'],
  collectCoverage: false,
  testResultsProcessor: undefined,
  transform: {
    ...base.transform,
    '\\.[jt]sx?$': ['babel-jest', {
      configFile: path.join(client, 'babel.config.cjs'),
      plugins: [['babel-plugin-root-import', {
        root: client,
        rootPathPrefix: '~/',
        rootPathSuffix: './src',
      }]],
    }],
  },
};
