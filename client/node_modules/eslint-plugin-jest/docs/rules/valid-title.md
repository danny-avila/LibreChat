# Enforce valid titles (`valid-title`)

💼 This rule is enabled in the ✅ `recommended`
[config](https://github.com/jest-community/eslint-plugin-jest/blob/main/README.md#shareable-configurations).

🔧 This rule is automatically fixable by the
[`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Checks that the title of Jest blocks are valid by ensuring that titles are:

- not empty,
- is a string,
- not prefixed with their block name,
- have no leading or trailing spaces

## Rule details

**emptyTitle**

An empty title is not informative, and serves little purpose.

Examples of **incorrect** code for this rule:

```js
describe('', () => {});
describe('foo', () => {
  it('', () => {});
});
it('', () => {});
test('', () => {});
xdescribe('', () => {});
xit('', () => {});
xtest('', () => {});
```

Examples of **correct** code for this rule:

```js
describe('foo', () => {});
describe('foo', () => {
  it('bar', () => {});
});
test('foo', () => {});
it('foo', () => {});
xdescribe('foo', () => {});
xit('foo', () => {});
xtest('foo', () => {});
```

**titleMustBeString**

Titles for `describe`, `test`, and `it` blocks should always be a string; you
can disable this with the `ignoreTypeOfDescribeName` and `ignoreTypeOfTestName`
options.

Examples of **incorrect** code for this rule:

```js
it(123, () => {});
describe(String(/.+/), () => {});
describe(myFunction, () => {});
xdescribe(myFunction, () => {});
describe(6, function () {});
```

Examples of **correct** code for this rule:

```js
it('is a string', () => {});
test('is a string', () => {});
xtest('is a string', () => {});
describe('is a string', () => {});
describe.skip('is a string', () => {});
fdescribe('is a string', () => {});
```

Examples of **correct** code when `ignoreTypeOfDescribeName` is `true`:

```js
it('is a string', () => {});
test('is a string', () => {});
xtest('is a string', () => {});
describe('is a string', () => {});
describe.skip('is a string', () => {});
fdescribe('is a string', () => {});

describe(String(/.+/), () => {});
describe(myFunction, () => {});
xdescribe(myFunction, () => {});
describe(6, function () {});
```

Examples of **correct** code when `ignoreTypeOfTestName` is `true`:

```js
const myTestName = 'is a string';

it(String(/.+/), () => {});
it(myFunction, () => {});
it(myTestName, () => {});
xit(myFunction, () => {});
it(6, function () {});
```

**duplicatePrefix**

A `describe` / `test` block should not start with `duplicatePrefix`

Examples of **incorrect** code for this rule

```js
test('test foo', () => {});
it('it foo', () => {});

describe('foo', () => {
  test('test bar', () => {});
});

describe('describe foo', () => {
  test('bar', () => {});
});
```

Examples of **correct** code for this rule

```js
test('foo', () => {});
it('foo', () => {});

describe('foo', () => {
  test('bar', () => {});
});
```

**accidentalSpace**

A `describe` / `test` block should not contain accidentalSpace, but can be
turned off via the `ignoreSpaces` option:

Examples of **incorrect** code for this rule

```js
test(' foo', () => {});
it(' foo', () => {});

describe('foo', () => {
  test(' bar', () => {});
});

describe(' foo', () => {
  test('bar', () => {});
});

describe('foo  ', () => {
  test('bar', () => {});
});
```

Examples of **correct** code for this rule

```js
test('foo', () => {});
it('foo', () => {});

describe('foo', () => {
  test('bar', () => {});
});
```

## Options

```ts
interface Options {
  ignoreSpaces?: boolean;
  ignoreTypeOfDescribeName?: boolean;
  disallowedWords?: string[];
  mustNotMatch?: Partial<Record<'describe' | 'test' | 'it', string>> | string;
  mustMatch?: Partial<Record<'describe' | 'test' | 'it', string>> | string;
}
```

#### `ignoreSpaces`

Default: `false`

When enabled, the leading and trailing spaces won't be checked.

#### `ignoreTypeOfDescribeName`

Default: `false`

When enabled, the type of the first argument to `describe` blocks won't be
checked.

#### `disallowedWords`

Default: `[]`

A string array of words that are not allowed to be used in test titles. Matching
is not case-sensitive, and looks for complete words:

Examples of **incorrect** code when using `disallowedWords`:

```js
// with disallowedWords: ['correct', 'all', 'every', 'properly']
describe('the correct way to do things', () => {});
it('has ALL the things', () => {});
xdescribe('every single one of them', () => {});
test(`that the value is set properly`, () => {});
```

Examples of **correct** code when using `disallowedWords`:

```js
// with disallowedWords: ['correct', 'all', 'every', 'properly']
it('correctly sets the value', () => {});
test('that everything is as it should be', () => {});
describe('the proper way to handle things', () => {});
```

#### `mustMatch` & `mustNotMatch`

Defaults: `{}`

Allows enforcing that titles must match or must not match a given Regular
Expression, with an optional message. An object can be provided to apply
different Regular Expressions (with optional messages) to specific Jest test
function groups (`describe`, `test`, and `it`).

Examples of **incorrect** code when using `mustMatch`:

```js
// with mustMatch: '^that'
describe('the correct way to do things', () => {});
fit('this there!', () => {});

// with mustMatch: { test: '^that' }
describe('the tests that will be run', () => {});
test('the stuff works', () => {});
xtest('errors that are thrown have messages', () => {});
```

Examples of **correct** code when using `mustMatch`:

```js
// with mustMatch: '^that'
describe('that thing that needs to be done', () => {});
fit('that this there!', () => {});

// with mustMatch: { test: '^that' }
describe('the tests that will be run', () => {});
test('that the stuff works', () => {});
xtest('that errors that thrown have messages', () => {});
```

Optionally you can provide a custom message to show for a particular matcher by
using a tuple at any level where you can provide a matcher:

```js
const prefixes = ['when', 'with', 'without', 'if', 'unless', 'for'];
const prefixesList = prefixes.join('  - \n');

module.exports = {
  rules: {
    'jest/valid-title': [
      'error',
      {
        mustNotMatch: ['\\.$', 'Titles should not end with a full-stop'],
        mustMatch: {
          describe: [
            new RegExp(`^(?:[A-Z]|\\b(${prefixes.join('|')})\\b`, 'u').source,
            `Describe titles should either start with a capital letter or one of the following prefixes: ${prefixesList}`,
          ],
          test: [/[^A-Z]/u.source],
          it: /[^A-Z]/u.source,
        },
      },
    ],
  },
};
```
