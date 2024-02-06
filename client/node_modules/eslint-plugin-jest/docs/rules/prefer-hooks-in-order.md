# Prefer having hooks in a consistent order (`prefer-hooks-in-order`)

<!-- end auto-generated rule header -->

While hooks can be setup in any order, they're always called by `jest` in this
specific order:

1. `beforeAll`
1. `beforeEach`
1. `afterEach`
1. `afterAll`

This rule aims to make that more obvious by enforcing grouped hooks be setup in
that order within tests.

## Rule details

Examples of **incorrect** code for this rule

```js
/* eslint jest/prefer-hooks-in-order: "error" */

describe('foo', () => {
  beforeEach(() => {
    seedMyDatabase();
  });

  beforeAll(() => {
    createMyDatabase();
  });

  it('accepts this input', () => {
    // ...
  });

  it('returns that value', () => {
    // ...
  });

  describe('when the database has specific values', () => {
    const specificValue = '...';

    beforeEach(() => {
      seedMyDatabase(specificValue);
    });

    it('accepts that input', () => {
      // ...
    });

    it('throws an error', () => {
      // ...
    });

    afterEach(() => {
      clearLogger();
    });
    beforeEach(() => {
      mockLogger();
    });

    it('logs a message', () => {
      // ...
    });
  });

  afterAll(() => {
    removeMyDatabase();
  });
});
```

Examples of **correct** code for this rule

```js
/* eslint jest/prefer-hooks-in-order: "error" */

describe('foo', () => {
  beforeAll(() => {
    createMyDatabase();
  });

  beforeEach(() => {
    seedMyDatabase();
  });

  it('accepts this input', () => {
    // ...
  });

  it('returns that value', () => {
    // ...
  });

  describe('when the database has specific values', () => {
    const specificValue = '...';

    beforeEach(() => {
      seedMyDatabase(specificValue);
    });

    it('accepts that input', () => {
      // ...
    });

    it('throws an error', () => {
      // ...
    });

    beforeEach(() => {
      mockLogger();
    });

    afterEach(() => {
      clearLogger();
    });

    it('logs a message', () => {
      // ...
    });
  });

  afterAll(() => {
    removeMyDatabase();
  });
});
```

## Also See

- [`prefer-hooks-on-top`](prefer-hooks-on-top.md)

## Further Reading

- [Order of Execution](https://jestjs.io/docs/setup-teardown#order-of-execution)
