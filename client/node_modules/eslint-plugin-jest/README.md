<div align="center">
  <a href="https://eslint.org/">
    <img height="150" src="https://eslint.org/assets/images/logo/eslint-logo-color.svg">
  </a>
  <a href="https://jestjs.io/">
    <img width="150" height="150" vspace="" hspace="25" src="https://jestjs.io/img/jest.png">
  </a>
  <h1>eslint-plugin-jest</h1>
  <p>ESLint plugin for Jest</p>
</div>

[![Actions Status](https://github.com/jest-community/eslint-plugin-jest/actions/workflows/nodejs.yml/badge.svg?branch=main)](https://github.com/jest-community/eslint-plugin-jest/actions)

## Installation

```bash
yarn add --dev eslint eslint-plugin-jest
```

**Note:** If you installed ESLint globally then you must also install
`eslint-plugin-jest` globally.

## Usage

Add `jest` to the plugins section of your `.eslintrc` configuration file. You
can omit the `eslint-plugin-` prefix:

```json
{
  "plugins": ["jest"]
}
```

Then configure the rules you want to use under the rules section.

```json
{
  "rules": {
    "jest/no-disabled-tests": "warn",
    "jest/no-focused-tests": "error",
    "jest/no-identical-title": "error",
    "jest/prefer-to-have-length": "warn",
    "jest/valid-expect": "error"
  }
}
```

You can also tell ESLint about the environment variables provided by Jest by
doing:

```json
{
  "env": {
    "jest/globals": true
  }
}
```

This is included in all configs shared by this plugin, so can be omitted if
extending them.

#### Aliased Jest globals

You can tell this plugin about any global Jests you have aliased using the
`globalAliases` setting:

```json
{
  "settings": {
    "jest": {
      "globalAliases": {
        "describe": ["context"],
        "fdescribe": ["fcontext"],
        "xdescribe": ["xcontext"]
      }
    }
  }
}
```

### Running rules only on test-related files

The rules provided by this plugin assume that the files they are checking are
test-related. This means it's generally not suitable to include them in your
top-level configuration as that applies to all files being linted which can
include source files.

You can use
[overrides](https://eslint.org/docs/user-guide/configuring/configuration-files#how-do-overrides-work)
to have ESLint apply additional rules to specific files:

```json
{
  "extends": ["eslint:recommended"],
  "overrides": [
    {
      "files": ["test/**"],
      "plugins": ["jest"],
      "extends": ["plugin:jest/recommended"],
      "rules": { "jest/prefer-expect-assertions": "off" }
    }
  ],
  "rules": {
    "indent": ["error", 2]
  }
}
```

### Jest `version` setting

The behaviour of some rules (specifically [`no-deprecated-functions`][]) change
depending on the version of Jest being used.

By default, this plugin will attempt to determine to locate Jest using
`require.resolve`, meaning it will start looking in the closest `node_modules`
folder to the file being linted and work its way up.

Since we cache the automatically determined version, if you're linting
sub-folders that have different versions of Jest, you may find that the wrong
version of Jest is considered when linting. You can work around this by
providing the Jest version explicitly in nested ESLint configs:

```json
{
  "settings": {
    "jest": {
      "version": 27
    }
  }
}
```

To avoid hard-coding a number, you can also fetch it from the installed version
of Jest if you use a JavaScript config file such as `.eslintrc.js`:

```js
module.exports = {
  settings: {
    jest: {
      version: require('jest/package.json').version,
    },
  },
};
```

## Shareable configurations

### Recommended

This plugin exports a recommended configuration that enforces good testing
practices.

To enable this configuration use the `extends` property in your `.eslintrc`
config file:

```json
{
  "extends": ["plugin:jest/recommended"]
}
```

### Style

This plugin also exports a configuration named `style`, which adds some
stylistic rules, such as `prefer-to-be-null`, which enforces usage of `toBeNull`
over `toBe(null)`.

To enable this configuration use the `extends` property in your `.eslintrc`
config file:

```json
{
  "extends": ["plugin:jest/style"]
}
```

See
[ESLint documentation](https://eslint.org/docs/user-guide/configuring/configuration-files#extending-configuration-files)
for more information about extending configuration files.

### All

If you want to enable all rules instead of only some you can do so by adding the
`all` configuration to your `.eslintrc` config file:

```json
{
  "extends": ["plugin:jest/all"]
}
```

While the `recommended` and `style` configurations only change in major versions
the `all` configuration may change in any release and is thus unsuited for
installations requiring long-term consistency.

## Rules

<!-- begin auto-generated rules list -->

💼
[Configurations](https://github.com/jest-community/eslint-plugin-jest/blob/main/README.md#shareable-configurations)
enabled in.\
⚠️ [Configurations](https://github.com/jest-community/eslint-plugin-jest/blob/main/README.md#shareable-configurations)
set to warn in.\
✅ Set in the `recommended`
[configuration](https://github.com/jest-community/eslint-plugin-jest/blob/main/README.md#shareable-configurations).\
🎨 Set in the `style` [configuration](https://github.com/jest-community/eslint-plugin-jest/blob/main/README.md#shareable-configurations).\
🔧 Automatically fixable by the
[`--fix` CLI option](https://eslint.org/docs/user-guide/command-line-interface#--fix).\
💡 Manually fixable by [editor suggestions](https://eslint.org/docs/developer-guide/working-with-rules#providing-suggestions).\
❌ Deprecated.

| Name                                                                         | Description                                                               | 💼  | ⚠️  | 🔧  | 💡  | ❌  |
| :--------------------------------------------------------------------------- | :------------------------------------------------------------------------ | :-- | :-- | :-- | :-- | :-- |
| [consistent-test-it](docs/rules/consistent-test-it.md)                       | Enforce `test` and `it` usage conventions                                 |     |     | 🔧  |     |     |
| [expect-expect](docs/rules/expect-expect.md)                                 | Enforce assertion to be made in a test body                               |     | ✅  |     |     |     |
| [max-expects](docs/rules/max-expects.md)                                     | Enforces a maximum number assertion calls in a test body                  |     |     |     |     |     |
| [max-nested-describe](docs/rules/max-nested-describe.md)                     | Enforces a maximum depth to nested describe calls                         |     |     |     |     |     |
| [no-alias-methods](docs/rules/no-alias-methods.md)                           | Disallow alias methods                                                    | ✅  | 🎨  | 🔧  |     |     |
| [no-commented-out-tests](docs/rules/no-commented-out-tests.md)               | Disallow commented out tests                                              |     | ✅  |     |     |     |
| [no-conditional-expect](docs/rules/no-conditional-expect.md)                 | Disallow calling `expect` conditionally                                   | ✅  |     |     |     |     |
| [no-conditional-in-test](docs/rules/no-conditional-in-test.md)               | Disallow conditional logic in tests                                       |     |     |     |     |     |
| [no-confusing-set-timeout](docs/rules/no-confusing-set-timeout.md)           | Disallow confusing usages of jest.setTimeout                              |     |     |     |     |     |
| [no-deprecated-functions](docs/rules/no-deprecated-functions.md)             | Disallow use of deprecated functions                                      | ✅  |     | 🔧  |     |     |
| [no-disabled-tests](docs/rules/no-disabled-tests.md)                         | Disallow disabled tests                                                   |     | ✅  |     |     |     |
| [no-done-callback](docs/rules/no-done-callback.md)                           | Disallow using a callback in asynchronous tests and hooks                 | ✅  |     |     | 💡  |     |
| [no-duplicate-hooks](docs/rules/no-duplicate-hooks.md)                       | Disallow duplicate setup and teardown hooks                               |     |     |     |     |     |
| [no-export](docs/rules/no-export.md)                                         | Disallow using `exports` in files containing tests                        | ✅  |     |     |     |     |
| [no-focused-tests](docs/rules/no-focused-tests.md)                           | Disallow focused tests                                                    | ✅  |     |     | 💡  |     |
| [no-hooks](docs/rules/no-hooks.md)                                           | Disallow setup and teardown hooks                                         |     |     |     |     |     |
| [no-identical-title](docs/rules/no-identical-title.md)                       | Disallow identical titles                                                 | ✅  |     |     |     |     |
| [no-if](docs/rules/no-if.md)                                                 | Disallow conditional logic                                                |     |     |     |     | ❌  |
| [no-interpolation-in-snapshots](docs/rules/no-interpolation-in-snapshots.md) | Disallow string interpolation inside snapshots                            | ✅  |     |     |     |     |
| [no-jasmine-globals](docs/rules/no-jasmine-globals.md)                       | Disallow Jasmine globals                                                  | ✅  |     | 🔧  |     |     |
| [no-large-snapshots](docs/rules/no-large-snapshots.md)                       | Disallow large snapshots                                                  |     |     |     |     |     |
| [no-mocks-import](docs/rules/no-mocks-import.md)                             | Disallow manually importing from `__mocks__`                              | ✅  |     |     |     |     |
| [no-restricted-jest-methods](docs/rules/no-restricted-jest-methods.md)       | Disallow specific `jest.` methods                                         |     |     |     |     |     |
| [no-restricted-matchers](docs/rules/no-restricted-matchers.md)               | Disallow specific matchers & modifiers                                    |     |     |     |     |     |
| [no-standalone-expect](docs/rules/no-standalone-expect.md)                   | Disallow using `expect` outside of `it` or `test` blocks                  | ✅  |     |     |     |     |
| [no-test-prefixes](docs/rules/no-test-prefixes.md)                           | Require using `.only` and `.skip` over `f` and `x`                        | ✅  |     | 🔧  |     |     |
| [no-test-return-statement](docs/rules/no-test-return-statement.md)           | Disallow explicitly returning from tests                                  |     |     |     |     |     |
| [no-untyped-mock-factory](docs/rules/no-untyped-mock-factory.md)             | Disallow using `jest.mock()` factories without an explicit type parameter |     |     | 🔧  |     |     |
| [prefer-called-with](docs/rules/prefer-called-with.md)                       | Suggest using `toBeCalledWith()` or `toHaveBeenCalledWith()`              |     |     |     |     |     |
| [prefer-comparison-matcher](docs/rules/prefer-comparison-matcher.md)         | Suggest using the built-in comparison matchers                            |     |     | 🔧  |     |     |
| [prefer-each](docs/rules/prefer-each.md)                                     | Prefer using `.each` rather than manual loops                             |     |     |     |     |     |
| [prefer-equality-matcher](docs/rules/prefer-equality-matcher.md)             | Suggest using the built-in equality matchers                              |     |     |     | 💡  |     |
| [prefer-expect-assertions](docs/rules/prefer-expect-assertions.md)           | Suggest using `expect.assertions()` OR `expect.hasAssertions()`           |     |     |     | 💡  |     |
| [prefer-expect-resolves](docs/rules/prefer-expect-resolves.md)               | Prefer `await expect(...).resolves` over `expect(await ...)` syntax       |     |     | 🔧  |     |     |
| [prefer-hooks-in-order](docs/rules/prefer-hooks-in-order.md)                 | Prefer having hooks in a consistent order                                 |     |     |     |     |     |
| [prefer-hooks-on-top](docs/rules/prefer-hooks-on-top.md)                     | Suggest having hooks before any test cases                                |     |     |     |     |     |
| [prefer-lowercase-title](docs/rules/prefer-lowercase-title.md)               | Enforce lowercase test names                                              |     |     | 🔧  |     |     |
| [prefer-mock-promise-shorthand](docs/rules/prefer-mock-promise-shorthand.md) | Prefer mock resolved/rejected shorthands for promises                     |     |     | 🔧  |     |     |
| [prefer-snapshot-hint](docs/rules/prefer-snapshot-hint.md)                   | Prefer including a hint with external snapshots                           |     |     |     |     |     |
| [prefer-spy-on](docs/rules/prefer-spy-on.md)                                 | Suggest using `jest.spyOn()`                                              |     |     | 🔧  |     |     |
| [prefer-strict-equal](docs/rules/prefer-strict-equal.md)                     | Suggest using `toStrictEqual()`                                           |     |     |     | 💡  |     |
| [prefer-to-be](docs/rules/prefer-to-be.md)                                   | Suggest using `toBe()` for primitive literals                             | 🎨  |     | 🔧  |     |     |
| [prefer-to-contain](docs/rules/prefer-to-contain.md)                         | Suggest using `toContain()`                                               | 🎨  |     | 🔧  |     |     |
| [prefer-to-have-length](docs/rules/prefer-to-have-length.md)                 | Suggest using `toHaveLength()`                                            | 🎨  |     | 🔧  |     |     |
| [prefer-todo](docs/rules/prefer-todo.md)                                     | Suggest using `test.todo`                                                 |     |     | 🔧  |     |     |
| [require-hook](docs/rules/require-hook.md)                                   | Require setup and teardown code to be within a hook                       |     |     |     |     |     |
| [require-to-throw-message](docs/rules/require-to-throw-message.md)           | Require a message for `toThrow()`                                         |     |     |     |     |     |
| [require-top-level-describe](docs/rules/require-top-level-describe.md)       | Require test cases and hooks to be inside a `describe` block              |     |     |     |     |     |
| [valid-describe-callback](docs/rules/valid-describe-callback.md)             | Enforce valid `describe()` callback                                       | ✅  |     |     |     |     |
| [valid-expect](docs/rules/valid-expect.md)                                   | Enforce valid `expect()` usage                                            | ✅  |     |     |     |     |
| [valid-expect-in-promise](docs/rules/valid-expect-in-promise.md)             | Require promises that have expectations in their chain to be valid        | ✅  |     |     |     |     |
| [valid-title](docs/rules/valid-title.md)                                     | Enforce valid titles                                                      | ✅  |     | 🔧  |     |     |

### Requires Type Checking

| Name                                           | Description                                                  | 💼  | ⚠️  | 🔧  | 💡  | ❌  |
| :--------------------------------------------- | :----------------------------------------------------------- | :-- | :-- | :-- | :-- | :-- |
| [unbound-method](docs/rules/unbound-method.md) | Enforce unbound methods are called with their expected scope |     |     |     |     |     |

<!-- end auto-generated rules list -->

In order to use the rules powered by TypeScript type-checking, you must be using
`@typescript-eslint/parser` & adjust your eslint config as outlined
[here](https://typescript-eslint.io/linting/typed-linting).

Note that unlike the type-checking rules in `@typescript-eslint/eslint-plugin`,
the rules here will fallback to doing nothing if type information is not
available, meaning it's safe to include them in shared configs that could be
used on JavaScript and TypeScript projects.

Also note that `unbound-method` depends on `@typescript-eslint/eslint-plugin`,
as it extends the original `unbound-method` rule from that plugin.

## Credit

- [eslint-plugin-mocha](https://github.com/lo1tuma/eslint-plugin-mocha)
- [eslint-plugin-jasmine](https://github.com/tlvince/eslint-plugin-jasmine)

## Related Projects

### eslint-plugin-jest-extended

This is a sister plugin to `eslint-plugin-jest` that provides support for the
matchers provided by
[`jest-extended`](https://github.com/jest-community/jest-extended).

<https://github.com/jest-community/eslint-plugin-jest-extended>

### eslint-plugin-jest-formatting

This project aims to provide formatting rules (auto-fixable where possible) to
ensure consistency and readability in jest test suites.

<https://github.com/dangreenisrael/eslint-plugin-jest-formatting>

### eslint-plugin-istanbul

A set of rules to enforce good practices for Istanbul, one of the code coverage
tools used by Jest.

<https://github.com/istanbuljs/eslint-plugin-istanbul>

[`no-deprecated-functions`]: docs/rules/no-deprecated-functions.md
