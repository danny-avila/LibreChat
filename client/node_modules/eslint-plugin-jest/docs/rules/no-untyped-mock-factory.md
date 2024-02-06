# Disallow using `jest.mock()` factories without an explicit type parameter (`no-untyped-mock-factory`)

🔧 This rule is automatically fixable by the
[`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

By default, `jest.mock` and `jest.doMock` allow any type to be returned by a
mock factory. A generic type parameter can be used to enforce that the factory
returns an object with the same shape as the original module, or some other
strict type. Requiring a type makes it easier to use TypeScript to catch changes
needed in test mocks when the source module changes.

> **Warning**
>
> This rule expects to be run on TypeScript files **only**. If you are using a
> codebase that has a mix of JavaScript and TypeScript tests, you can use
> [overrides](https://eslint.org/docs/latest/user-guide/configuring/configuration-files#how-do-overrides-work)
> to apply this rule to just your TypeScript test files.

## Rule details

This rule triggers a warning if `mock()` or `doMock()` is used without a generic
type parameter or return type.

The following patterns are considered errors:

```ts
jest.mock('../moduleName', () => {
  return jest.fn(() => 42);
});

jest.mock('./module', () => ({
  ...jest.requireActual('./module'),
  foo: jest.fn(),
}));

jest.mock('random-num', () => {
  return jest.fn(() => 42);
});
```

The following patterns are not considered errors:

```ts
// Uses typeof import()
jest.mock<typeof import('../moduleName')>('../moduleName', () => {
  return jest.fn(() => 42);
});

jest.mock<typeof import('./module')>('./module', () => ({
  ...jest.requireActual('./module'),
  foo: jest.fn(),
}));

// Uses custom type
jest.mock<() => number>('random-num', () => {
  return jest.fn(() => 42);
});

// No factory
jest.mock('random-num');

// Virtual mock
jest.mock(
  '../moduleName',
  () => {
    return jest.fn(() => 42);
  },
  { virtual: true },
);
```
