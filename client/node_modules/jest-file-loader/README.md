# jest-file-loader

A jest transform to replicate a similar behaviour to webpack's  `file-loader`

Will result in an export of the imported path relative to the configured jest `rootDir`

## Setup

Add the transform to your jest configuration:

**package.json**
```diff
  "jest": {
+    "transform": {
+      "\\.png$": "jest-file-loader"
+    }
  }
```
*note: if also using babel, you'll have to manually [add an entry for `babel-jest` also](https://github.com/facebook/jest/tree/master/packages/babel-jest#setup)*

## Options

### `esModule`
Type: `Boolean` Default: `false`

By default `jest-file-loader` generates modules that use CommonJS syntax

e.g.:
```js
module.exports = "src/logo.png";
```

You can enable using ES module syntax by setting the `esModule` option to `true`

e.g.:
```js
export default "src/logo.png";
```

**example configuration in package.json**
```diff
  "jest": {
+    "transform": {
+      "\\.png$": ["jest-file-loader", {"esModule": true}]
+    }
  }
```