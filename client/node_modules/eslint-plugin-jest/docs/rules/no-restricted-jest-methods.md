# Disallow specific `jest.` methods (`no-restricted-jest-methods`)

<!-- end auto-generated rule header -->

You may wish to restrict the use of specific `jest` methods.

## Rule details

This rule checks for the usage of specific methods on the `jest` object, which
can be used to disallow certain patterns such as spies and mocks.

## Options

Restrictions are expressed in the form of a map, with the value being either a
string message to be shown, or `null` if a generic default message should be
used.

By default, this map is empty, meaning no `jest` methods are banned.

For example:

```json
{
  "jest/no-restricted-jest-methods": [
    "error",
    {
      "advanceTimersByTime": null,
      "spyOn": "Don't use spies"
    }
  ]
}
```

Examples of **incorrect** code for this rule with the above configuration

```js
jest.useFakeTimers();
it('calls the callback after 1 second via advanceTimersByTime', () => {
  // ...

  jest.advanceTimersByTime(1000);

  // ...
});

test('plays video', () => {
  const spy = jest.spyOn(video, 'play');

  // ...
});
```
