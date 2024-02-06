# Suggest using `toHaveLength()` (`prefer-to-have-length`)

💼 This rule is enabled in the 🎨 `style`
[config](https://github.com/jest-community/eslint-plugin-jest/blob/main/README.md#shareable-configurations).

🔧 This rule is automatically fixable by the
[`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

In order to have a better failure message, `toHaveLength()` should be used upon
asserting expectations on objects length property.

## Rule details

This rule triggers a warning if `toBe()`, `toEqual()` or `toStrictEqual()` is
used to assert objects length property.

```js
expect(files.length).toBe(1);
```

This rule is enabled by default.

The following patterns are considered warnings:

```js
expect(files.length).toBe(1);

expect(files.length).toEqual(1);

expect(files.length).toStrictEqual(1);
```

The following pattern is not warning:

```js
expect(files).toHaveLength(1);
```
