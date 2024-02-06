/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Implements (a subset of) the interface of built-in Map but supports arrays as
 * keys. Two keys are equal if corresponding elements are equal according to the
 * equality semantics of built-in Map. Operations are at worst O(n*b) where n is
 * the array length and b is the complexity of the built-in operation.
 *
 * @flow
 * @format
 * @oncall recoil
 */

'use strict';

const LEAF = {};

const emptyMap = new Map<mixed, mixed>();

class ArrayKeyedMap<V> {
  _base: Map<any, any> = new Map();

  constructor(
    existing?: ArrayKeyedMap<V> | Iterable<[mixed, V]>,
    // $FlowFixMe[incompatible-return]
  ): ArrayKeyedMap<V> {
    if (existing instanceof ArrayKeyedMap) {
      for (const [k, v] of existing.entries()) {
        this.set(k, v);
      }
    } else if (existing) {
      for (const [k, v] of existing) {
        this.set(k, v);
      }
    }
    return this;
  }

  get(key: mixed): V | void {
    const ks = Array.isArray(key) ? key : [key];
    let map = this._base;
    ks.forEach(k => {
      map = map.get(k) ?? emptyMap;
    });
    return map === undefined ? undefined : map.get(LEAF);
  }

  set(key: mixed, value: V): any {
    const ks = Array.isArray(key) ? key : [key];
    let map: ?(any | Map<mixed, mixed> | Map<any, any>) = this._base;
    let next: ?(any | Map<mixed, mixed> | Map<any, any>) = map;
    ks.forEach(k => {
      // $FlowFixMe[incompatible-use]
      next = map.get(k);
      if (!next) {
        next = new Map();
        // $FlowFixMe[incompatible-use]
        map.set(k, next);
      }
      map = next;
    });
    // $FlowFixMe[incompatible-use]
    next.set(LEAF, value);
    return this;
  }

  delete(key: mixed): any {
    const ks = Array.isArray(key) ? key : [key];
    let map: ?(any | Map<mixed, mixed> | Map<any, any>) = this._base;
    let next: ?(any | Map<mixed, mixed> | Map<any, any>) = map;
    ks.forEach(k => {
      // $FlowFixMe[incompatible-use]
      next = map.get(k);
      if (!next) {
        next = new Map();
        // $FlowFixMe[incompatible-use]
        map.set(k, next);
      }
      map = next;
    });
    // $FlowFixMe[incompatible-use]
    next.delete(LEAF);
    // TODO We could cleanup empty maps
    return this;
  }

  entries(): Iterator<[$ReadOnlyArray<mixed>, V]> {
    const answer = [];
    function recurse(level: any | Map<any, any>, prefix: Array<mixed>) {
      level.forEach((v, k) => {
        if (k === LEAF) {
          answer.push([prefix, v]);
        } else {
          recurse(v, prefix.concat(k));
        }
      });
    }
    recurse(this._base, []);
    return answer.values();
  }

  toBuiltInMap(): Map<$ReadOnlyArray<mixed>, V> {
    return new Map(this.entries());
  }
}

module.exports = {ArrayKeyedMap};
