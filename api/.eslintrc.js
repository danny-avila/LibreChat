module.exports = {
  env: {
    es2021: true,
    node: true
  },
  extends: ['eslint:recommended'],
  overrides: [],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    indent: ['error', 2, { SwitchCase: 1 }],
    'max-len': [
      'error',
      {
        code: 150,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreComments: true
      }
    ],
    'linebreak-style': 0,
    'arrow-parens': [2, 'always', { requireForBlockBody: true }],
    // 'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
    'no-console': 'off',
    'import/extensions': 'off',
    'no-use-before-define': [
      'error',
      {
        functions: false
      }
    ],
    'no-promise-executor-return': 'off',
    'no-param-reassign': 'off',
    'no-continue': 'off',
    'no-restricted-syntax': 'off'
  }
};
