# is-weakset <sup>[![Version Badge][2]][1]</sup>

[![github actions][actions-image]][actions-url]
[![coverage][codecov-image]][codecov-url]
[![dependency status][5]][6]
[![dev dependency status][7]][8]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

[![npm badge][11]][1]

Is this value a JS WeakSet? This module works cross-realm/iframe, and despite ES6 @@toStringTag.

## Example

```js
var isWeakSet = require('is-weakset');
assert(!isWeakSet(function () {}));
assert(!isWeakSet(null));
assert(!isWeakSet(function* () { yield 42; return Infinity; });
assert(!isWeakSet(Symbol('foo')));
assert(!isWeakSet(1n));
assert(!isWeakSet(Object(1n)));

assert(!isWeakSet(new Set()));
assert(!isWeakSet(new WeakMap()));
assert(!isWeakSet(new Map()));

assert(isWeakSet(new WeakSet()));

class MyWeakSet extends WeakSet {}
assert(isWeakSet(new MyWeakSet()));
```

## Tests
Simply clone the repo, `npm install`, and run `npm test`

[1]: https://npmjs.org/package/is-weakset
[2]: https://versionbadg.es/inspect-js/is-weakset.svg
[5]: https://david-dm.org/inspect-js/is-weakset.svg
[6]: https://david-dm.org/inspect-js/is-weakset
[7]: https://david-dm.org/inspect-js/is-weakset/dev-status.svg
[8]: https://david-dm.org/inspect-js/is-weakset#info=devDependencies
[11]: https://nodei.co/npm/is-weakset.png?downloads=true&stars=true
[license-image]: https://img.shields.io/npm/l/is-weakset.svg
[license-url]: LICENSE
[downloads-image]: https://img.shields.io/npm/dm/is-weakset.svg
[downloads-url]: https://npm-stat.com/charts.html?package=is-weakset
[codecov-image]: https://codecov.io/gh/inspect-js/is-weakset/branch/main/graphs/badge.svg
[codecov-url]: https://app.codecov.io/gh/inspect-js/is-weakset/
[actions-image]: https://img.shields.io/endpoint?url=https://github-actions-badge-u3jn4tfpocch.runkit.sh/inspect-js/is-weakset
[actions-url]: https://github.com/inspect-js/is-weakset/actions
