# is-weakmap <sup>[![Version Badge][2]][1]</sup>

[![Build Status][3]][4]
[![dependency status][5]][6]
[![dev dependency status][7]][8]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

[![npm badge][11]][1]

Is this value a JS WeakMap? This module works cross-realm/iframe, and despite ES6 @@toStringTag.

## Example

```js
var isWeakMap = require('is-weakmap');
assert(!isWeakMap(function () {}));
assert(!isWeakMap(null));
assert(!isWeakMap(function* () { yield 42; return Infinity; });
assert(!isWeakMap(Symbol('foo')));
assert(!isWeakMap(1n));
assert(!isWeakMap(Object(1n)));

assert(!isWeakMap(new Set()));
assert(!isWeakMap(new WeakSet()));
assert(!isWeakMap(new Map()));

assert(isWeakMap(new WeakMap()));

class MyWeakMap extends WeakMap {}
assert(isWeakMap(new MyWeakMap()));
```

## Tests
Simply clone the repo, `npm install`, and run `npm test`

[1]: https://npmjs.org/package/is-weakmap
[2]: http://versionbadg.es/inspect-js/is-weakmap.svg
[3]: https://travis-ci.org/inspect-js/is-weakmap.svg
[4]: https://travis-ci.org/inspect-js/is-weakmap
[5]: https://david-dm.org/inspect-js/is-weakmap.svg
[6]: https://david-dm.org/inspect-js/is-weakmap
[7]: https://david-dm.org/inspect-js/is-weakmap/dev-status.svg
[8]: https://david-dm.org/inspect-js/is-weakmap#info=devDependencies
[11]: https://nodei.co/npm/is-weakmap.png?downloads=true&stars=true
[license-image]: http://img.shields.io/npm/l/is-weakmap.svg
[license-url]: LICENSE
[downloads-image]: http://img.shields.io/npm/dm/is-weakmap.svg
[downloads-url]: http://npm-stat.com/charts.html?package=is-weakmap
