# Disallow conditional logic in tests (`no-conditional-in-test`)

<!-- end auto-generated rule header -->

Conditional logic in tests is usually an indication that a test is attempting to
cover too much, and not testing the logic it intends to. Each branch of code
executing within a conditional statement will usually be better served by a test
devoted to it.

## Rule details

This rule reports on any use of a conditional statement such as `if`, `switch`,
and ternary expressions.

Examples of **incorrect** code for this rule:

```js
it('foo', () => {
  if (true) {
    doTheThing();
  }
});

it('bar', () => {
  switch (mode) {
    case 'none':
      generateNone();
    case 'single':
      generateOne();
    case 'multiple':
      generateMany();
  }

  expect(fixtures.length).toBeGreaterThan(-1);
});

it('baz', async () => {
  const promiseValue = () => {
    return something instanceof Promise
      ? something
      : Promise.resolve(something);
  };

  await expect(promiseValue()).resolves.toBe(1);
});
```

Examples of **correct** code for this rule:

```js
describe('my tests', () => {
  if (true) {
    it('foo', () => {
      doTheThing();
    });
  }
});

beforeEach(() => {
  switch (mode) {
    case 'none':
      generateNone();
    case 'single':
      generateOne();
    case 'multiple':
      generateMany();
  }
});

it('bar', () => {
  expect(fixtures.length).toBeGreaterThan(-1);
});

const promiseValue = something => {
  return something instanceof Promise ? something : Promise.resolve(something);
};

it('baz', async () => {
  await expect(promiseValue()).resolves.toBe(1);
});
```
