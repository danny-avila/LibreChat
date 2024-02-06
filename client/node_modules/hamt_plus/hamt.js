'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

/**
    @fileOverview Hash Array Mapped Trie.

    Code based on: https://github.com/exclipy/pdata
*/
var hamt = {}; // export

/* Configuration
 ******************************************************************************/
var SIZE = 5;

var BUCKET_SIZE = Math.pow(2, SIZE);

var MASK = BUCKET_SIZE - 1;

var MAX_INDEX_NODE = BUCKET_SIZE / 2;

var MIN_ARRAY_NODE = BUCKET_SIZE / 4;

/*
 ******************************************************************************/
var nothing = {};

var constant = function constant(x) {
    return function () {
        return x;
    };
};

/**
    Get 32 bit hash of string.

    Based on:
    http://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript-jquery
*/
var hash = hamt.hash = function (str) {
    var type = typeof str === 'undefined' ? 'undefined' : _typeof(str);
    if (type === 'number') return str;
    if (type !== 'string') str += '';

    var hash = 0;
    for (var i = 0, len = str.length; i < len; ++i) {
        var c = str.charCodeAt(i);
        hash = (hash << 5) - hash + c | 0;
    }
    return hash;
};

/* Bit Ops
 ******************************************************************************/
/**
    Hamming weight.

    Taken from: http://jsperf.com/hamming-weight
*/
var popcount = function popcount(x) {
    x -= x >> 1 & 0x55555555;
    x = (x & 0x33333333) + (x >> 2 & 0x33333333);
    x = x + (x >> 4) & 0x0f0f0f0f;
    x += x >> 8;
    x += x >> 16;
    return x & 0x7f;
};

var hashFragment = function hashFragment(shift, h) {
    return h >>> shift & MASK;
};

var toBitmap = function toBitmap(x) {
    return 1 << x;
};

var fromBitmap = function fromBitmap(bitmap, bit) {
    return popcount(bitmap & bit - 1);
};

/* Array Ops
 ******************************************************************************/
/**
    Set a value in an array.

    @param mutate Should the input array be mutated?
    @param at Index to change.
    @param v New value
    @param arr Array.
*/
var arrayUpdate = function arrayUpdate(mutate, at, v, arr) {
    var out = arr;
    if (!mutate) {
        var len = arr.length;
        out = new Array(len);
        for (var i = 0; i < len; ++i) {
            out[i] = arr[i];
        }
    }
    out[at] = v;
    return out;
};

/**
    Remove a value from an array.

    @param mutate Should the input array be mutated?
    @param at Index to remove.
    @param arr Array.
*/
var arraySpliceOut = function arraySpliceOut(mutate, at, arr) {
    var newLen = arr.length - 1;
    var i = 0;
    var g = 0;
    var out = arr;
    if (mutate) {
        i = g = at;
    } else {
        out = new Array(newLen);
        while (i < at) {
            out[g++] = arr[i++];
        }
    }
    ++i;
    while (i <= newLen) {
        out[g++] = arr[i++];
    }if (mutate) {
        out.length = newLen;
    }
    return out;
};

/**
    Insert a value into an array.

    @param mutate Should the input array be mutated?
    @param at Index to insert at.
    @param v Value to insert,
    @param arr Array.
*/
var arraySpliceIn = function arraySpliceIn(mutate, at, v, arr) {
    var len = arr.length;
    if (mutate) {
        var _i = len;
        while (_i >= at) {
            arr[_i--] = arr[_i];
        }arr[at] = v;
        return arr;
    }
    var i = 0,
        g = 0;
    var out = new Array(len + 1);
    while (i < at) {
        out[g++] = arr[i++];
    }out[at] = v;
    while (i < len) {
        out[++g] = arr[i++];
    }return out;
};

/* Node Structures
 ******************************************************************************/
var LEAF = 1;
var COLLISION = 2;
var INDEX = 3;
var ARRAY = 4;

/**
    Empty node.
*/
var empty = {
    __hamt_isEmpty: true
};

var isEmptyNode = function isEmptyNode(x) {
    return x === empty || x && x.__hamt_isEmpty;
};

/**
    Leaf holding a value.

    @member edit Edit of the node.
    @member hash Hash of key.
    @member key Key.
    @member value Value stored.
*/
var Leaf = function Leaf(edit, hash, key, value) {
    return {
        type: LEAF,
        edit: edit,
        hash: hash,
        key: key,
        value: value,
        _modify: Leaf__modify
    };
};

/**
    Leaf holding multiple values with the same hash but different keys.

    @member edit Edit of the node.
    @member hash Hash of key.
    @member children Array of collision children node.
*/
var Collision = function Collision(edit, hash, children) {
    return {
        type: COLLISION,
        edit: edit,
        hash: hash,
        children: children,
        _modify: Collision__modify
    };
};

/**
    Internal node with a sparse set of children.

    Uses a bitmap and array to pack children.

  @member edit Edit of the node.
    @member mask Bitmap that encode the positions of children in the array.
    @member children Array of child nodes.
*/
var IndexedNode = function IndexedNode(edit, mask, children) {
    return {
        type: INDEX,
        edit: edit,
        mask: mask,
        children: children,
        _modify: IndexedNode__modify
    };
};

/**
    Internal node with many children.

    @member edit Edit of the node.
    @member size Number of children.
    @member children Array of child nodes.
*/
var ArrayNode = function ArrayNode(edit, size, children) {
    return {
        type: ARRAY,
        edit: edit,
        size: size,
        children: children,
        _modify: ArrayNode__modify
    };
};

/**
    Is `node` a leaf node?
*/
var isLeaf = function isLeaf(node) {
    return node === empty || node.type === LEAF || node.type === COLLISION;
};

/* Internal node operations.
 ******************************************************************************/
/**
    Expand an indexed node into an array node.

  @param edit Current edit.
    @param frag Index of added child.
    @param child Added child.
    @param mask Index node mask before child added.
    @param subNodes Index node children before child added.
*/
var expand = function expand(edit, frag, child, bitmap, subNodes) {
    var arr = [];
    var bit = bitmap;
    var count = 0;
    for (var i = 0; bit; ++i) {
        if (bit & 1) arr[i] = subNodes[count++];
        bit >>>= 1;
    }
    arr[frag] = child;
    return ArrayNode(edit, count + 1, arr);
};

/**
    Collapse an array node into a indexed node.

  @param edit Current edit.
    @param count Number of elements in new array.
    @param removed Index of removed element.
    @param elements Array node children before remove.
*/
var pack = function pack(edit, count, removed, elements) {
    var children = new Array(count - 1);
    var g = 0;
    var bitmap = 0;
    for (var i = 0, len = elements.length; i < len; ++i) {
        if (i !== removed) {
            var elem = elements[i];
            if (elem && !isEmptyNode(elem)) {
                children[g++] = elem;
                bitmap |= 1 << i;
            }
        }
    }
    return IndexedNode(edit, bitmap, children);
};

/**
    Merge two leaf nodes.

    @param shift Current shift.
    @param h1 Node 1 hash.
    @param n1 Node 1.
    @param h2 Node 2 hash.
    @param n2 Node 2.
*/
var mergeLeaves = function mergeLeaves(edit, shift, h1, n1, h2, n2) {
    if (h1 === h2) return Collision(edit, h1, [n2, n1]);

    var subH1 = hashFragment(shift, h1);
    var subH2 = hashFragment(shift, h2);
    return IndexedNode(edit, toBitmap(subH1) | toBitmap(subH2), subH1 === subH2 ? [mergeLeaves(edit, shift + SIZE, h1, n1, h2, n2)] : subH1 < subH2 ? [n1, n2] : [n2, n1]);
};

/**
    Update an entry in a collision list.

    @param mutate Should mutation be used?
    @param edit Current edit.
    @param keyEq Key compare function.
    @param hash Hash of collision.
    @param list Collision list.
    @param f Update function.
    @param k Key to update.
    @param size Size ref.
*/
var updateCollisionList = function updateCollisionList(mutate, edit, keyEq, h, list, f, k, size) {
    var len = list.length;
    for (var i = 0; i < len; ++i) {
        var child = list[i];
        if (keyEq(k, child.key)) {
            var value = child.value;
            var _newValue = f(value);
            if (_newValue === value) return list;

            if (_newValue === nothing) {
                --size.value;
                return arraySpliceOut(mutate, i, list);
            }
            return arrayUpdate(mutate, i, Leaf(edit, h, k, _newValue), list);
        }
    }

    var newValue = f();
    if (newValue === nothing) return list;
    ++size.value;
    return arrayUpdate(mutate, len, Leaf(edit, h, k, newValue), list);
};

var canEditNode = function canEditNode(edit, node) {
    return edit === node.edit;
};

/* Editing
 ******************************************************************************/
var Leaf__modify = function Leaf__modify(edit, keyEq, shift, f, h, k, size) {
    if (keyEq(k, this.key)) {
        var _v = f(this.value);
        if (_v === this.value) return this;else if (_v === nothing) {
            --size.value;
            return empty;
        }
        if (canEditNode(edit, this)) {
            this.value = _v;
            return this;
        }
        return Leaf(edit, h, k, _v);
    }
    var v = f();
    if (v === nothing) return this;
    ++size.value;
    return mergeLeaves(edit, shift, this.hash, this, h, Leaf(edit, h, k, v));
};

var Collision__modify = function Collision__modify(edit, keyEq, shift, f, h, k, size) {
    if (h === this.hash) {
        var canEdit = canEditNode(edit, this);
        var list = updateCollisionList(canEdit, edit, keyEq, this.hash, this.children, f, k, size);
        if (list === this.children) return this;

        return list.length > 1 ? Collision(edit, this.hash, list) : list[0]; // collapse single element collision list
    }
    var v = f();
    if (v === nothing) return this;
    ++size.value;
    return mergeLeaves(edit, shift, this.hash, this, h, Leaf(edit, h, k, v));
};

var IndexedNode__modify = function IndexedNode__modify(edit, keyEq, shift, f, h, k, size) {
    var mask = this.mask;
    var children = this.children;
    var frag = hashFragment(shift, h);
    var bit = toBitmap(frag);
    var indx = fromBitmap(mask, bit);
    var exists = mask & bit;
    var current = exists ? children[indx] : empty;
    var child = current._modify(edit, keyEq, shift + SIZE, f, h, k, size);

    if (current === child) return this;

    var canEdit = canEditNode(edit, this);
    var bitmap = mask;
    var newChildren = void 0;
    if (exists && isEmptyNode(child)) {
        // remove
        bitmap &= ~bit;
        if (!bitmap) return empty;
        if (children.length <= 2 && isLeaf(children[indx ^ 1])) return children[indx ^ 1]; // collapse

        newChildren = arraySpliceOut(canEdit, indx, children);
    } else if (!exists && !isEmptyNode(child)) {
        // add
        if (children.length >= MAX_INDEX_NODE) return expand(edit, frag, child, mask, children);

        bitmap |= bit;
        newChildren = arraySpliceIn(canEdit, indx, child, children);
    } else {
        // modify
        newChildren = arrayUpdate(canEdit, indx, child, children);
    }

    if (canEdit) {
        this.mask = bitmap;
        this.children = newChildren;
        return this;
    }
    return IndexedNode(edit, bitmap, newChildren);
};

var ArrayNode__modify = function ArrayNode__modify(edit, keyEq, shift, f, h, k, size) {
    var count = this.size;
    var children = this.children;
    var frag = hashFragment(shift, h);
    var child = children[frag];
    var newChild = (child || empty)._modify(edit, keyEq, shift + SIZE, f, h, k, size);

    if (child === newChild) return this;

    var canEdit = canEditNode(edit, this);
    var newChildren = void 0;
    if (isEmptyNode(child) && !isEmptyNode(newChild)) {
        // add
        ++count;
        newChildren = arrayUpdate(canEdit, frag, newChild, children);
    } else if (!isEmptyNode(child) && isEmptyNode(newChild)) {
        // remove
        --count;
        if (count <= MIN_ARRAY_NODE) return pack(edit, count, frag, children);
        newChildren = arrayUpdate(canEdit, frag, empty, children);
    } else {
        // modify
        newChildren = arrayUpdate(canEdit, frag, newChild, children);
    }

    if (canEdit) {
        this.size = count;
        this.children = newChildren;
        return this;
    }
    return ArrayNode(edit, count, newChildren);
};

empty._modify = function (edit, keyEq, shift, f, h, k, size) {
    var v = f();
    if (v === nothing) return empty;
    ++size.value;
    return Leaf(edit, h, k, v);
};

/*
 ******************************************************************************/
function Map(editable, edit, config, root, size) {
    this._editable = editable;
    this._edit = edit;
    this._config = config;
    this._root = root;
    this._size = size;
};

Map.prototype.setTree = function (newRoot, newSize) {
    if (this._editable) {
        this._root = newRoot;
        this._size = newSize;
        return this;
    }
    return newRoot === this._root ? this : new Map(this._editable, this._edit, this._config, newRoot, newSize);
};

/* Queries
 ******************************************************************************/
/**
    Lookup the value for `key` in `map` using a custom `hash`.

    Returns the value or `alt` if none.
*/
var tryGetHash = hamt.tryGetHash = function (alt, hash, key, map) {
    var node = map._root;
    var shift = 0;
    var keyEq = map._config.keyEq;
    while (true) {
        switch (node.type) {
            case LEAF:
                {
                    return keyEq(key, node.key) ? node.value : alt;
                }
            case COLLISION:
                {
                    if (hash === node.hash) {
                        var children = node.children;
                        for (var i = 0, len = children.length; i < len; ++i) {
                            var child = children[i];
                            if (keyEq(key, child.key)) return child.value;
                        }
                    }
                    return alt;
                }
            case INDEX:
                {
                    var frag = hashFragment(shift, hash);
                    var bit = toBitmap(frag);
                    if (node.mask & bit) {
                        node = node.children[fromBitmap(node.mask, bit)];
                        shift += SIZE;
                        break;
                    }
                    return alt;
                }
            case ARRAY:
                {
                    node = node.children[hashFragment(shift, hash)];
                    if (node) {
                        shift += SIZE;
                        break;
                    }
                    return alt;
                }
            default:
                return alt;
        }
    }
};

Map.prototype.tryGetHash = function (alt, hash, key) {
    return tryGetHash(alt, hash, key, this);
};

/**
    Lookup the value for `key` in `map` using internal hash function.

    @see `tryGetHash`
*/
var tryGet = hamt.tryGet = function (alt, key, map) {
    return tryGetHash(alt, map._config.hash(key), key, map);
};

Map.prototype.tryGet = function (alt, key) {
    return tryGet(alt, key, this);
};

/**
    Lookup the value for `key` in `map` using a custom `hash`.

    Returns the value or `undefined` if none.
*/
var getHash = hamt.getHash = function (hash, key, map) {
    return tryGetHash(undefined, hash, key, map);
};

Map.prototype.getHash = function (hash, key) {
    return getHash(hash, key, this);
};

/**
    Lookup the value for `key` in `map` using internal hash function.

    @see `get`
*/
var get = hamt.get = function (key, map) {
    return tryGetHash(undefined, map._config.hash(key), key, map);
};

Map.prototype.get = function (key, alt) {
    return tryGet(alt, key, this);
};

/**
    Does an entry exist for `key` in `map`? Uses custom `hash`.
*/
var hasHash = hamt.has = function (hash, key, map) {
    return tryGetHash(nothing, hash, key, map) !== nothing;
};

Map.prototype.hasHash = function (hash, key) {
    return hasHash(hash, key, this);
};

/**
    Does an entry exist for `key` in `map`? Uses internal hash function.
*/
var has = hamt.has = function (key, map) {
    return hasHash(map._config.hash(key), key, map);
};

Map.prototype.has = function (key) {
    return has(key, this);
};

var defKeyCompare = function defKeyCompare(x, y) {
    return x === y;
};

/**
    Create an empty map.

    @param config Configuration.
*/
hamt.make = function (config) {
    return new Map(0, 0, {
        keyEq: config && config.keyEq || defKeyCompare,
        hash: config && config.hash || hash
    }, empty, 0);
};

/**
    Empty map.
*/
hamt.empty = hamt.make();

/**
    Does `map` contain any elements?
*/
var isEmpty = hamt.isEmpty = function (map) {
    return map && !!isEmptyNode(map._root);
};

Map.prototype.isEmpty = function () {
    return isEmpty(this);
};

/* Updates
 ******************************************************************************/
/**
    Alter the value stored for `key` in `map` using function `f` using
    custom hash.

    `f` is invoked with the current value for `k` if it exists,
    or no arguments if no such value exists. `modify` will always either
    update or insert a value into the map.

    Returns a map with the modified value. Does not alter `map`.
*/
var modifyHash = hamt.modifyHash = function (f, hash, key, map) {
    var size = { value: map._size };
    var newRoot = map._root._modify(map._editable ? map._edit : NaN, map._config.keyEq, 0, f, hash, key, size);
    return map.setTree(newRoot, size.value);
};

Map.prototype.modifyHash = function (hash, key, f) {
    return modifyHash(f, hash, key, this);
};

/**
    Alter the value stored for `key` in `map` using function `f` using
    internal hash function.

    @see `modifyHash`
*/
var modify = hamt.modify = function (f, key, map) {
    return modifyHash(f, map._config.hash(key), key, map);
};

Map.prototype.modify = function (key, f) {
    return modify(f, key, this);
};

/**
    Store `value` for `key` in `map` using custom `hash`.

    Returns a map with the modified value. Does not alter `map`.
*/
var setHash = hamt.setHash = function (hash, key, value, map) {
    return modifyHash(constant(value), hash, key, map);
};

Map.prototype.setHash = function (hash, key, value) {
    return setHash(hash, key, value, this);
};

/**
    Store `value` for `key` in `map` using internal hash function.

    @see `setHash`
*/
var set = hamt.set = function (key, value, map) {
    return setHash(map._config.hash(key), key, value, map);
};

Map.prototype.set = function (key, value) {
    return set(key, value, this);
};

/**
    Remove the entry for `key` in `map`.

    Returns a map with the value removed. Does not alter `map`.
*/
var del = constant(nothing);
var removeHash = hamt.removeHash = function (hash, key, map) {
    return modifyHash(del, hash, key, map);
};

Map.prototype.removeHash = Map.prototype.deleteHash = function (hash, key) {
    return removeHash(hash, key, this);
};

/**
    Remove the entry for `key` in `map` using internal hash function.

    @see `removeHash`
*/
var remove = hamt.remove = function (key, map) {
    return removeHash(map._config.hash(key), key, map);
};

Map.prototype.remove = Map.prototype.delete = function (key) {
    return remove(key, this);
};

/* Mutation
 ******************************************************************************/
/**
    Mark `map` as mutable.
 */
var beginMutation = hamt.beginMutation = function (map) {
    return new Map(map._editable + 1, map._edit + 1, map._config, map._root, map._size);
};

Map.prototype.beginMutation = function () {
    return beginMutation(this);
};

/**
    Mark `map` as immutable.
 */
var endMutation = hamt.endMutation = function (map) {
    map._editable = map._editable && map._editable - 1;
    return map;
};

Map.prototype.endMutation = function () {
    return endMutation(this);
};

/**
    Mutate `map` within the context of `f`.
    @param f
    @param map HAMT
*/
var mutate = hamt.mutate = function (f, map) {
    var transient = beginMutation(map);
    f(transient);
    return endMutation(transient);
};

Map.prototype.mutate = function (f) {
    return mutate(f, this);
};

/* Traversal
 ******************************************************************************/
/**
    Apply a continuation.
*/
var appk = function appk(k) {
    return k && lazyVisitChildren(k[0], k[1], k[2], k[3], k[4]);
};

/**
    Recursively visit all values stored in an array of nodes lazily.
*/
var lazyVisitChildren = function lazyVisitChildren(len, children, i, f, k) {
    while (i < len) {
        var child = children[i++];
        if (child && !isEmptyNode(child)) return lazyVisit(child, f, [len, children, i, f, k]);
    }
    return appk(k);
};

/**
    Recursively visit all values stored in `node` lazily.
*/
var lazyVisit = function lazyVisit(node, f, k) {
    switch (node.type) {
        case LEAF:
            return {
                value: f(node),
                rest: k
            };

        case COLLISION:
        case ARRAY:
        case INDEX:
            var children = node.children;
            return lazyVisitChildren(children.length, children, 0, f, k);

        default:
            return appk(k);
    }
};

var DONE = {
    done: true
};

/**
    Javascript iterator over a map.
*/
function MapIterator(v) {
    this.v = v;
};

MapIterator.prototype.next = function () {
    if (!this.v) return DONE;
    var v0 = this.v;
    this.v = appk(v0.rest);
    return v0;
};

MapIterator.prototype[Symbol.iterator] = function () {
    return this;
};

/**
    Lazily visit each value in map with function `f`.
*/
var visit = function visit(map, f) {
    return new MapIterator(lazyVisit(map._root, f));
};

/**
    Get a Javascsript iterator of `map`.

    Iterates over `[key, value]` arrays.
*/
var buildPairs = function buildPairs(x) {
    return [x.key, x.value];
};
var entries = hamt.entries = function (map) {
    return visit(map, buildPairs);
};

Map.prototype.entries = Map.prototype[Symbol.iterator] = function () {
    return entries(this);
};

/**
    Get array of all keys in `map`.

    Order is not guaranteed.
*/
var buildKeys = function buildKeys(x) {
    return x.key;
};
var keys = hamt.keys = function (map) {
    return visit(map, buildKeys);
};

Map.prototype.keys = function () {
    return keys(this);
};

/**
    Get array of all values in `map`.

    Order is not guaranteed, duplicates are preserved.
*/
var buildValues = function buildValues(x) {
    return x.value;
};
var values = hamt.values = Map.prototype.values = function (map) {
    return visit(map, buildValues);
};

Map.prototype.values = function () {
    return values(this);
};

/* Fold
 ******************************************************************************/
/**
    Visit every entry in the map, aggregating data.

    Order of nodes is not guaranteed.

    @param f Function mapping accumulated value, value, and key to new value.
    @param z Starting value.
    @param m HAMT
*/
var fold = hamt.fold = function (f, z, m) {
    var root = m._root;
    if (root.type === LEAF) return f(z, root.value, root.key);

    var toVisit = [root.children];
    var children = void 0;
    while (children = toVisit.pop()) {
        for (var i = 0, len = children.length; i < len;) {
            var child = children[i++];
            if (child && child.type) {
                if (child.type === LEAF) z = f(z, child.value, child.key);else toVisit.push(child.children);
            }
        }
    }
    return z;
};

Map.prototype.fold = function (f, z) {
    return fold(f, z, this);
};

/**
    Visit every entry in the map, aggregating data.

    Order of nodes is not guaranteed.

    @param f Function invoked with value and key
    @param map HAMT
*/
var forEach = hamt.forEach = function (f, map) {
    return fold(function (_, value, key) {
        return f(value, key, map);
    }, null, map);
};

Map.prototype.forEach = function (f) {
    return forEach(f, this);
};

/* Aggregate
 ******************************************************************************/
/**
    Get the number of entries in `map`.
*/
var count = hamt.count = function (map) {
    return map._size;
};

Map.prototype.count = function () {
    return count(this);
};

Object.defineProperty(Map.prototype, 'size', {
    get: Map.prototype.count
});

/* Export
 ******************************************************************************/
if (typeof module !== 'undefined' && module.exports) {
    module.exports = hamt;
} else if (typeof define === 'function' && define.amd) {
    define('hamt', [], function () {
        return hamt;
    });
} else {
    undefined.hamt = hamt;
}
//# sourceMappingURL=hamt.js.map
