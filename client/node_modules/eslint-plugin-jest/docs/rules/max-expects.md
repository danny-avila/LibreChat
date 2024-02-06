# Enforces a maximum number assertion calls in a test body (`max-expects`)

<!-- end auto-generated rule header -->

As more assertions are made, there is a possible tendency for the test to be
more likely to mix multiple objectives. To avoid this, this rule reports when
the maximum number of assertions is exceeded.

## Rule details

This rule enforces a maximum number of `expect()` calls.

The following patterns are considered warnings (with the default option of
`{ "max": 5 } `):

```js
test('should not pass', () => {
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
});

it('should not pass', () => {
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
});
```

The following patterns are **not** considered warnings (with the default option
of `{ "max": 5 } `):

```js
test('shout pass');

test('shout pass', () => {});

test.skip('shout pass', () => {});

test('should pass', function () {
  expect(true).toBeDefined();
});

test('should pass', () => {
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
});
```

## Options

```json
{
  "jest/max-expects": [
    "error",
    {
      "max": 5
    }
  ]
}
```

### `max`

Enforces a maximum number of `expect()`.

This has a default value of `5`.
