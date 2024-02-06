# Prefer using `.each` rather than manual loops (`prefer-each`)

<!-- end auto-generated rule header -->

Reports where you might be able to use `.each` instead of native loops.

## Rule details

This rule triggers a warning if you use test case functions like `describe`,
`test`, and `it`, in a native loop - generally you should be able to use `.each`
instead which gives better output and makes it easier to run specific cases.

Examples of **incorrect** code for this rule:

```js
for (const number of getNumbers()) {
  it('is greater than five', function () {
    expect(number).toBeGreaterThan(5);
  });
}

for (const [input, expected] of data) {
  beforeEach(() => setupSomething(input));

  test(`results in ${expected}`, () => {
    expect(doSomething()).toBe(expected);
  });
}
```

Examples of **correct** code for this rule:

```js
it.each(getNumbers())(
  'only returns numbers that are greater than seven',
  number => {
    expect(number).toBeGreaterThan(7);
  },
);

describe.each(data)('when input is %s', ([input, expected]) => {
  beforeEach(() => setupSomething(input));

  test(`results in ${expected}`, () => {
    expect(doSomething()).toBe(expected);
  });
});

// we don't warn on loops _in_ test functions because those typically involve
// complex setup that is better done in the test function itself
it('returns numbers that are greater than five', () => {
  for (const number of getNumbers()) {
    expect(number).toBeGreaterThan(5);
  }
});
```
