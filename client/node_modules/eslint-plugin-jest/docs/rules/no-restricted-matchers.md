# Disallow specific matchers & modifiers (`no-restricted-matchers`)

<!-- end auto-generated rule header -->

You may want to ban specific matchers & modifiers from being used.

## Rule details

This rule bans specific matchers & modifiers from being used, and can suggest
alternatives.

## Options

Bans are expressed in the form of a map, with the value being either a string
message to be shown, or `null` if the default rule message should be used.

Bans are checked against the start of the `expect` chain - this means that to
ban a specific matcher entirely you must specify all six permutations, but
allows you to ban modifiers as well.

By default, this map is empty, meaning no matchers or modifiers are banned.

For example:

```json
{
  "jest/no-restricted-matchers": [
    "error",
    {
      "toBeFalsy": null,
      "resolves": "Use `expect(await promise)` instead.",
      "toHaveBeenCalledWith": null,
      "not.toHaveBeenCalledWith": null,
      "resolves.toHaveBeenCalledWith": null,
      "rejects.toHaveBeenCalledWith": null,
      "resolves.not.toHaveBeenCalledWith": null,
      "rejects.not.toHaveBeenCalledWith": null
    }
  ]
}
```

Examples of **incorrect** code for this rule with the above configuration

```js
it('is false', () => {
  // if this has a modifer (i.e. `not.toBeFalsy`), it would be considered fine
  expect(a).toBeFalsy();
});

it('resolves', async () => {
  // all uses of this modifier are disallowed, regardless of matcher
  await expect(myPromise()).resolves.toBe(true);
});

describe('when an error happens', () => {
  it('does not upload the file', async () => {
    // all uses of this matcher are disallowed
    expect(uploadFileMock).not.toHaveBeenCalledWith('file.name');
  });
});
```
