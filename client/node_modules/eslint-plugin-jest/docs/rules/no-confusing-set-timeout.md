# Disallow confusing usages of jest.setTimeout (`no-confusing-set-timeout`)

<!-- end auto-generated rule header -->

While `jest.setTimeout` can be called multiple times anywhere within a single
test file only the last call before any test functions run will have an effect.

## Rule details

this rule checks for several confusing usages of `jest.setTimeout` that looks
like it applies to specific tests within the same file, such as:

- being called anywhere other than in global scope
- being called multiple times
- being called after other Jest functions like hooks, `describe`, `test`, or
  `it`

Examples of **incorrect** code for this rule:

```js
describe('test foo', () => {
  jest.setTimeout(1000);
  it('test-description', () => {
    // test logic;
  });
});

describe('test bar', () => {
  it('test-description', () => {
    jest.setTimeout(1000);
    // test logic;
  });
});

test('foo-bar', () => {
  jest.setTimeout(1000);
});

describe('unit test', () => {
  beforeEach(() => {
    jest.setTimeout(1000);
  });
});
```

Examples of **correct** code for this rule:

```js
jest.setTimeout(500);
test('test test', () => {
  // do some stuff
});
```

```js
jest.setTimeout(1000);
describe('test bar bar', () => {
  it('test-description', () => {
    // test logic;
  });
});
```
