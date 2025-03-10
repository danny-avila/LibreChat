import { fileURLToPath } from 'node:url';
import path from 'node:path';
import typescriptEslintEslintPlugin from '@typescript-eslint/eslint-plugin';
import { fixupConfigRules, fixupPluginRules } from '@eslint/compat';
// import perfectionist from 'eslint-plugin-perfectionist';
import reactHooks from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import { FlatCompat } from '@eslint/eslintrc';
import jsxA11Y from 'eslint-plugin-jsx-a11y';
import i18next from 'eslint-plugin-i18next';
import react from 'eslint-plugin-react';
import jest from 'eslint-plugin-jest';
import globals from 'globals';
import js from '@eslint/js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: [
      'client/vite.config.ts',
      'client/dist/**/*',
      'client/public/**/*',
      'client/coverage/**/*',
      'e2e/playwright-report/**/*',
      'packages/mcp/types/**/*',
      'packages/mcp/dist/**/*',
      'packages/mcp/test_bundle/**/*',
      'api/demo/**/*',
      'packages/data-provider/types/**/*',
      'packages/data-provider/dist/**/*',
      'packages/data-provider/test_bundle/**/*',
      'data-node/**/*',
      'meili_data/**/*',
      '**/node_modules/**/*',
    ],
  },
  ...fixupConfigRules(
    compat.extends(
      'eslint:recommended',
      'plugin:react/recommended',
      'plugin:react-hooks/recommended',
      'plugin:jest/recommended',
      'prettier',
      'plugin:jsx-a11y/recommended',
    ),
  ),
  {
    plugins: {
      react: fixupPluginRules(react),
      'react-hooks': fixupPluginRules(reactHooks),
      '@typescript-eslint': typescriptEslintEslintPlugin,
      import: importPlugin,
      'jsx-a11y': fixupPluginRules(jsxA11Y),
      'import/parsers': tsParser,
      i18next,
      // perfectionist,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.commonjs,
      },
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },

    settings: {
      react: {
        createClass: 'createReactClass',
        pragma: 'React',
        fragment: 'Fragment',
        version: 'detect',
      },
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
      },
      'import/resolver': {
        typescript: {
          project: ['./client/tsconfig.json'],
        },
        node: {
          project: ['./client/tsconfig.json'],
        },
      },
    },

    rules: {
      'react/react-in-jsx-scope': 'off',

      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': false,
        },
      ],
      // Disable a11y features to be enabled later on.
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/alt-text': 'off',
      'jsx-a11y/img-redundant-alt': 'off',
      'jsx-a11y/no-noninteractive-tabindex': 'off',
      // common rules
      'no-nested-ternary': 'warn',
      'no-constant-binary-expression': 'warn',
      // Also disable the core no-unused-vars rule globally.
      'no-unused-vars': 'warn',

      indent: ['error', 2, { SwitchCase: 1 }],
      'max-len': [
        'error',
        {
          code: 120,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreComments: true,
        },
      ],
      'linebreak-style': 0,
      curly: ['error', 'all'],
      semi: ['error', 'always'],
      'object-curly-spacing': ['error', 'always'],
      'no-multiple-empty-lines': [
        'error',
        {
          max: 1,
        },
      ],
      'no-trailing-spaces': 'error',
      'comma-dangle': ['error', 'always-multiline'],
      'no-console': 'off',
      'import/no-cycle': 'error',
      'import/no-self-import': 'error',
      'import/extensions': 'off',
      'no-promise-executor-return': 'off',
      'no-param-reassign': 'off',
      'no-continue': 'off',
      'no-restricted-syntax': 'off',
      'react/prop-types': 'off',
      'react/display-name': 'off',
      quotes: ['error', 'single'],
      'key-spacing': ['error', { beforeColon: false, afterColon: true }],

      // 'perfectionist/sort-imports': [
      //   'error',
      //   {
      //     type: 'line-length',
      //     order: 'desc',
      //     newlinesBetween: 'never',
      //     customGroups: {
      //       value: {
      //         react: ['^react$'],
      //         // react: ['^react$', '^fs', '^zod', '^path'],
      //         local: ['^(\\.{1,2}|~)/', '^librechat-data-provider'],
      //       },
      //     },
      //     groups: [
      //       'react',
      //       'builtin',
      //       'external',
      //       ['builtin-type', 'external-type'],
      //       ['internal-type'],
      //       'local',
      //       ['parent', 'sibling', 'index'],
      //       'object',
      //       'unknown',
      //     ],
      //   },
      // ],

      // 'perfectionist/sort-named-imports': [
      //   'error',
      //   {
      //     type: 'line-length',
      //     order: 'asc',
      //     ignoreAlias: false,
      //     ignoreCase: true,
      //     specialCharacters: 'keep',
      //     groupKind: 'mixed',
      //     partitionByNewLine: false,
      //     partitionByComment: false,
      //   },
      // ],
    },
  },
  {
    files: ['api/**/*.js', 'config/**/*.js'],
    rules: {
      // API
      // TODO: maybe later to error.
      'no-unused-const': 'off',
      'no-unused-vars': 'off',
      'no-async-promise-executor': 'off',
    },
  },
  {
    files: ['client/src/**/*.tsx', 'client/src/**/*.ts', 'client/src/**/*.jsx', 'client/src/**/*.js'],
    rules: {
      // Client a11y
      // TODO: maybe later to error.
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
      'jsx-a11y/label-has-associated-control': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/interactive-supports-focus': 'off',
      'jsx-a11y/no-noninteractive-tabindex': 'off',
      'jsx-a11y/img-redundant-alt': 'off',
    },
  },
  {
    files: ['**/rollup.config.js', '**/.eslintrc.js', '**/jest.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
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
      '**/setupTests.js',
    ],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      // TEST
      'react/display-name': 'off',
      'react/prop-types': 'off',
      'jest/no-commented-out-tests': 'off',
      'react/no-unescaped-entities': 'off',
      'jest/no-conditional-expect': 'off',
      'jest/no-disabled-tests': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  ...compat
    .extends(
      'plugin:@typescript-eslint/eslint-recommended',
      'plugin:@typescript-eslint/recommended',
    )
    .map((config) => ({
      ...config,
      files: ['**/*.ts', '**/*.tsx'],
    })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['packages/**/*'],
    plugins: {
      '@typescript-eslint': typescriptEslintEslintPlugin,
      jest: fixupPluginRules(jest),
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 5,
      sourceType: 'script',
      parserOptions: {
        project: './client/tsconfig.json',
      },
    },
    rules: {
      // i18n
      'i18next/no-literal-string': [
        'error', {
          mode: 'jsx-text-only',
          'should-validate-template': true,
        }],
      //
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      // React
      'react/no-unknown-property': 'warn',
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
      // General
      'no-constant-binary-expression': 'off',
      'import/no-cycle': 'off',
      'no-nested-ternary': 'off',
    },
  },
  {
    // **Data-provider specific configuration block**
    files: ['./packages/data-provider/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        project: './packages/data-provider/tsconfig.json',
      },
    },
  },
  {
    files: ['./api/demo/**/*.ts'],
  },
  {
    files: ['./packages/mcp/**/*.ts'],
  },
  {
    files: ['./config/translations/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 5,
      sourceType: 'script',
      parserOptions: {
        project: './config/translations/tsconfig.json',
      },
    },
  },
  {
    files: ['./packages/data-provider/specs/**/*.ts'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      parserOptions: {
        project: './packages/data-provider/tsconfig.spec.json',
      },
    },
  },
  {
    files: ['./api/demo/specs/**/*.ts'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      parserOptions: {
        project: './packages/data-provider/tsconfig.spec.json',
      },
    },
  },
  {
    files: ['./packages/mcp/specs/**/*.ts'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      parserOptions: {
        project: './packages/mcp/tsconfig.spec.json',
      },
    },
  },
  {
    // **New Data-schemas configuration block**
    files: ['./packages/data-schemas/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        project: './packages/data-schemas/tsconfig.json',
      },
    },
  },
];