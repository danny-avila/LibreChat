<div align="center" >
    <img src="https://raw.githubusercontent.com/mattbierner/hamt_plus/master/documentation/hamt-logo.png" alt="H.A.M.T.+" />
</div>

Fork of the [Hamt][hamt] ([hash array mapped trie][hash-array-mapped-trie]) library. This fork adds a few important features in exchange for very slightly degraded performance:

* Transient mutation. This allows efficient mass operations, while retaining the safety of a persistent data structure.
* Supports using a custom key comparision function.
* Supports using a custom hash function.

The Hamt+ Api is a superset of Hamt's Api. Hamt+ supports any key type using the custom hash and key comparision functions.

## Install
Source code is in `hamt.js` and generated from `lib/hamt.js`. The library supports node, AMD, and use as a global.

### Node
``` sh
$ npm install hamt
```

``` javascript
var hamt = require('hamt_plus');

var h = hamt.empty.set('key', 'value');

...
```


### AMD
``` javascript
requirejs.config({
    paths: {
        'hamt': 'path/to/hamt_plus/'
    }
});

require(['hamt'], function(hamt) {
    var h = hamt.empty.set('key', 'value');
    ...
});
```


# Usage
Hamt+ provides a method chaining interface and free functions for updating and querying the map. Both APIs provide identical functionality, but the free functions are designed for binding and composition, while the method chaining API is more legible and more Javascripty.

HAMTs are is persistent, so operations always return a modified copy of the map instead of altering the original.

## Custom Hash Values
Most update and lookup methods have two versions: one that takes a key and uses an internal hash function to compute its hash, and a version that takes a custom computed hash value.


``` javascript
var h = hamt.empty.set('key', 'value');
var h2 = hamt.empty.setHash(5, 'key', 'value');


h.get('key') === 'value'
h2.getHash(5, 'key') === 'value'
```

If using a custom hash, you must only use the `*Hash` variant of functions to interact with the map.


``` javascript
// Because the internally computed hash of `key` is not `5`, a direct
// look will not work.
h2.get('key') === undefined

// You must use `getHash` with the same hash value originally passed in.
h2.getHash(5, 'key') === 'value'
```


## API

#### `hamt.make(config)`
Create a new, empty map.

* `config` – Optional. Holds the custom hash and key compare functions: `{ hash: myHashFunction, keyEq: myKeyCompareFunction }`

```js
const Vec2 = (x, y) => ({ x: x, y: y });

const vecMap = hamt.make({
    hash: (value) => hamt.hash(value.x + ',' + value.y),
    keyEq: (a, b) => a.x === b.x && a.y === b.y
});

vecMap = vecMap.set(Vec2(1, 2), 'value');

vecMap.get(Vec2(1, 2)) === 'value'
```

#### `hamt.empty`
An empty map.

Uses default key compare function and hash functions.

----

#### `hamt.isEmpty(map)`
#### `map.isEmpty()`
Is a map empty?

This is the correct method to check if a map is empty. Direct comparisons to `hamt.empty` will not work.

----

#### `hamt.get(key, map)`
#### `map.get(key)`
Lookup the value for `key` in `map`.

* `key` - String key.
* `map` - Hamt map.

``` javascript
var h = hamt.empty.set('key', 'value');

h.get('key') === 'value'
hamt.get('key', k) === 'value'

h.get('no such key') === undefined
```

----

#### `hamt.getHash(hash, key, map)`
#### `map.getHash(hash, key)`
Same as `get` but uses a custom hash value.

----

#### `hamt.tryGet(alt, key, map)`
#### `map.tryGet(alt, key)`
Same as `get` but returns `alt` if no value for `key` exists.

* `alt` - Value returned if no such key exists in the map.
* `key` - String key.
* `map` - Hamt map.

----

#### `hamt.has(key, map)`
#### `map.has(key)`
Does an entry for `key` exist in `map`?

* `key` - String key.
* `map` - Hamt map.

``` javascript
var h = hamt.empty.set('key', 'value');

h.has('key') === true
h.has('no such key') === false
```

----

#### `hamt.tryGetHash(alt, hash, key, map)`
#### `map.tryGetHash(alt, hash, key)`
Same as `tryGet` but uses a custom hash value.

----

#### `hamt.set(key, value, map)`
#### `map.set(key, value)`
Set the value for `key` in `map`.

* `value` - Value to store. Hamt supports all value types, including: literals, objects, falsy values, null, and undefined. Keep in mind that only the map data structure itself is guaranteed to be immutable. Using immutable values is recommended but not required.
* `key` - String key.
* `map` - Hamt map.

Returns a new map with the value set. Does not alter the original.

``` javascript
var h = hamt.empty
    .set('key', 'value');
    .set('key2', 'value2');

var h2 = h.set('key3', 'value3');

h2.get('key') === 'value'
h2.get('key2') === 'value2'
h2.get('key3') === 'value3'

// original `h` was not modified
h.get('key') === 'value'
h.get('key2') === 'value2'
h.get('key3') === undefined
```

----

#### `hamt.setHash(hash, key, value, map)`
#### `map.setHash(hash, key, value)`
Same as `set` but uses a custom hash value.

----

#### `hamt.modify(f, key, map)`
#### `map.modify(key, f)`
Update the value stored for `key` in `map`.

* `f` - Function mapping the current value to the new value. If no current value exists, the function is invoked with no arguments.
* `key` - String key.
* `map` - Hamt map.

Returns a new map with the modified value. Does not alter the original.

``` javascript
var h = hamt.empty
    .set('i', 2);

var h2 = h.modify('i', x => x * x);

h2.get('i') === 4
h.get('i') === 2
h2.count() === 1
h.count() === 1

// Operate on value that does not exist
var h3 = h.modify('new', x => {
    if (x === undefined) {
        return 10;
    }
    return -x;
});

h3.get('new') === 10
h3.count() === 2
```

----

#### `hamt.modifyHash(f, hash, key, map)`
#### `map.modifyHash(hash, key, f)`
Same as `modify` but uses a custom hash value.

----

#### `hamt.remove(key, map)`
#### `map.remove(key)`
#### `map.delete(key)`
Remove `key` from `map`.

* `key` - String key.
* `map` - Hamt map.

Returns a new map with the value removed. Does not alter the original.

``` javascript
var h = hamt.empty
    .set('a', 1)
    .set('b', 2)
    .set('c', 3);

var h2 = h.remove('b');

h2.count() === 2;
h2.get('a') === 1
h2.get('b') === undefined
h2.get('c') === 3
```

----

#### `hamt.removeHash(hash, key, map)`
#### `map.removeHash(hash, key)`
#### `map.deleteHash(hash, key)`
Same as `remove` but uses a custom hash value.

----

#### `hamt.count(map)`
#### `map.count()`
#### `map.size`
Get number of elements in `map`.

* `map` - Hamt map.


``` javascript
hamt.empty.count() === 0;
hamt.empty.set('a', 3).count() === 1;
hamt.empty.set('a', 3).set('b', 3).count() === 2;
```

----

#### `hamt.fold(f, z, map)`
#### `map.fold(f, z)`
Fold over the map, accumulating result value.

* `f` - Function invoked with accumulated value, current value, and current key.
* `z` - Initial value.
* `map` - Hamt map.

Order is not guaranteed.

``` javascript
var max = hamt.fold.bind(null,
    (acc, value, key) => Math.max(acc, value),
    0);

max(hamt.empty.set('key', 3).set('key', 4)) === 4;
```

----

#### `hamt.entries(map)`
#### `map.entries()`
Get an Javascript iterator to all key value pairs in `map`.

* `map` - Hamt map.

Order is not guaranteed.

``` javascript
Array.from(hamt.empty.entries()) === [];
Array.from(hamt.empty.set('a', 3).entries()) === [['a', 3]];
Array.from(hamt.empty.set('a', 3).set('b', 3).entries()) === [['a', 3], ['b', 3]];
```

You can also iterated directly over a map with ES6:

```javascript
const h = hamt.empty.set('a', 3).set('b', 3);

for (let [key, value] of h)
    ...

Array.from(h) === [['a', 3], ['b', 3]];
```

----

#### `hamt.key(map)`
#### `map.keys()`
Get an Javascript iterator to all keys in `map`.

* `map` - Hamt map.

Order is not guaranteed.

``` javascript
Array.from(hamt.empty.keys()) === [];
Array.from(hamt.empty.set('a', 3).keys()) === ['a'];
Array.from(hamt.empty.set('a', 3).set('b', 3).keys()) === ['a', 'b'];
```

----

#### `hamt.values(map)`
#### `map.values()`
Get an Javascript iterator to all values in `map`.

* `map` - Hamt map.

Order is not guaranteed. Duplicate entries may exist.

``` javascript
Array.from(hamt.empty.values()) === [];
Array.from(hamt.empty.set('a', 3).values()) === [3];
Array.from(hamt.empty.set('a', 3).values('b', 3).values()) === [3, 3];
```

----

#### `hamt.forEach(f, map)`
#### `map.forEach(f)`
Invoke function `f` for each value in the map.

* `f` - Function invoked with `(value, key, map)`.
* `map` - Hamt map.

Order is not guaranteed.

----

#### `hamt.beginMutation(map)`
#### `map.beginMutation()`
Start the mutation of `map`. The number of calls to `beginMutation` is counted, but mutation itself is binary: the map is either mutable or immutable. Mutation cannot leak before the first call to `beginMutation` or after the matching call to `endMutation.`

----

#### `hamt.endMutation(map)`
#### `map.endMutation()`
End the mutation of `map`.

----

#### `hamt.mutate(f, map)`
#### `map.mutate(f)`
Mutate `map` within the context of function `f`.

```js
const insert = ['a', 'b', 'c'];

const h = hamt.mutate(h =>
    // any operations within this block may mutate `h` internally.
    insert.forEach((x, i) => {
        h.set(x, i);
    }),
    hamt.empty);

h.count() === 3;
h.get('b') === 2;
```

## Development
Any contributions to Hamt+ are welcome. Feel free to open an [issues](https://github.com/mattbierner/hamt_plus/issues) if you run into problems or have a suggested improvement.

To develop Hamt, fork the repo and install the development node packages:

```bash
cd hamt_plus
$ npm install
```

The source is written in ES6 and lives in `lib/hamt.js`. Gulp and Bable are used to translate the ES6 code to an ES5 distribution found in `hamt.js`. To start the compiler:

```bash
$ gulp default
```

Tests are written in Mocha and found in `tests/*`. To run the tests:

```js
$ mocha tests
```

[hamt]: https://github.com/mattbierner/hamt
[benchmarks]: http://github.com/mattbierner/js-hashtrie-benchmark
[pdata]: https://github.com/exclipy/pdata
[hash-array-mapped-trie]: http://en.wikipedia.org/wiki/Hash_array_mapped_trie
[persistent]: http://en.wikipedia.org/wiki/Persistent_data_structure
