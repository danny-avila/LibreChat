# Disallow focused tests (`no-focused-tests`)

💼 This rule is enabled in the ✅ `recommended`
[config](https://github.com/jest-community/eslint-plugin-jest/blob/main/README.md#shareable-configurations).

💡 This rule is manually fixable by
[editor suggestions](https://eslint.org/docs/developer-guide/working-with-rules#providing-suggestions).

<!-- end auto-generated rule header -->

<!-- prettier-ignore -->
Jest has a feature that allows you to focus tests by appending `.only` or
prepending `f` to a test-suite or a test-case. This feature is really helpful to
debug a failing test, so you don’t have to execute all of your tests. After you
have fixed your test and before committing the changes you have to remove
`.only` to ensure all tests are executed on your build system.

This rule reminds you to remove `.only` from your tests by raising a warning
whenever you are using the exclusivity feature.

## Rule details

This rule looks for every `describe.only`, `it.only`, `test.only`, `fdescribe`,
and `fit` occurrences within the source code. Of course there are some
edge-cases which can’t be detected by this rule e.g.:

```js
const describeOnly = describe.only;
describeOnly.apply(describe);
```

The following patterns are considered warnings:

```js
describe.only('foo', () => {});
it.only('foo', () => {});
describe['only']('bar', () => {});
it['only']('bar', () => {});
test.only('foo', () => {});
test['only']('bar', () => {});
fdescribe('foo', () => {});
fit('foo', () => {});
fit.each`
  table
`();
```

These patterns would not be considered warnings:

```js
describe('foo', () => {});
it('foo', () => {});
describe.skip('bar', () => {});
it.skip('bar', () => {});
test('foo', () => {});
test.skip('bar', () => {});
it.each()();
it.each`
  table
`();
test.each()();
test.each`
  table
`();
```
