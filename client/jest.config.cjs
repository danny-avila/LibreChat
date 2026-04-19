/** v0.8.5-rc1 */
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
  coveragePathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/test/setupTests.js'],
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
    '^test/(.*)$': '<rootDir>/test/$1',
    '^~/(.*)$': '<rootDir>/src/$1',
    '^librechat-data-provider/react-query$':
      '<rootDir>/../node_modules/librechat-data-provider/src/react-query',
  },
  maxWorkers: '50%',
  restoreMocks: true,
  testResultsProcessor: 'jest-junit',
  coverageReporters: ['text', 'cobertura', 'lcov'],
  transform: {
    '\\.[jt]sx?$': 'babel-jest',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      'jest-file-loader',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(@zattoo/use-double-click|@dicebear|@react-dnd|react-dnd.*|dnd-core|filenamify|filename-reserved-regex|heic-to|lowlight|highlight\\.js|fault|react-markdown|unified|bail|trough|devlop|is-.*|parse-entities|stringify-entities|character-.*|trim-lines|style-to-object|inline-style-parser|html-url-attributes|escape-string-regexp|longest-streak|zwitch|ccount|markdown-table|comma-separated-tokens|space-separated-tokens|web-namespaces|property-information|remark-.*|rehype-.*|recma-.*|hast.*|mdast-.*|unist-.*|vfile.*|micromark.*|estree-util-.*|decode-named-character-reference)/)/',
  ],
  setupFilesAfterEnv: ['@testing-library/jest-dom/extend-expect', '<rootDir>/test/setupTests.js'],
  clearMocks: true,
};
