module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    commonjs: true,
    es6: true
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    "plugin:jest/recommended",
    'prettier'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  plugins: ['react', 'react-hooks', '@typescript-eslint'],
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': 'allow-with-description' }],
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
    'no-trailing-spaces': 'error',
    // "arrow-parens": [2, "as-needed", { requireForBlockBody: true }],
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
    'no-restricted-syntax': 'off',
    'react/prop-types': ['off'],
    'react/display-name': ['off']
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        'no-unused-vars': 'off', // off because it conflicts with '@typescript-eslint/no-unused-vars'
        'react/display-name': 'off',
        '@typescript-eslint/no-unused-vars': 'warn'
      }
    },
    {
      files: ['rollup.config.js', '.eslintrc.js', 'jest.config.js'],
      env: {
        node: true,
      }
    },
    {
      files: [
        '**/*.test.js',
        '**/*.test.jsx',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.js',
        '**/*.spec.jsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        'setupTests.js'
      ],
      env: {
        jest: true,
        node: true
      },
      rules: {
        'react/display-name': 'off',
        'react/prop-types': 'off',
        'react/no-unescaped-entities': 'off'
      }
    },
    {
      files: '**/*.+(ts)',
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './client/tsconfig.json'
      },
      plugins: ['@typescript-eslint/eslint-plugin', 'jest'],
      extends: [
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended'
      ]
    }
  ],
  settings: {
    react: {
      createClass: 'createReactClass', // Regex for Component Factory to use,
      // default to "createReactClass"
      pragma: 'React', // Pragma to use, default to "React"
      fragment: 'Fragment', // Fragment to use (may be a property of <pragma>), default to "Fragment"
      version: 'detect' // React version. "detect" automatically picks the version you have installed.
    }
  }
};
