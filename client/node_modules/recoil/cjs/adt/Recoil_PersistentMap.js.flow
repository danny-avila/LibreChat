/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall recoil
 */

'use strict';

import type {HAMTPlusMap} from 'hamt_plus';

const hamt = require('hamt_plus');
const gkx = require('recoil-shared/util/Recoil_gkx');

export interface PersistentMap<K: string, V> {
  keys(): Iterable<K>;
  entries(): Iterable<[K, V]>;

  get(key: K): V | void;
  has(key: K): boolean;
  set(key: K, value: V): PersistentMap<K, V>;
  delete(key: K): PersistentMap<K, V>;

  clone(): PersistentMap<K, V>;
  toMap(): Map<K, V>;
}

class BuiltInMap<K: string, V> implements PersistentMap<K, V> {
  _map: Map<K, V>;

  constructor(existing?: PersistentMap<K, V>) {
    this._map = new Map(existing?.entries());
  }

  keys(): Iterable<K> {
    return this._map.keys();
  }

  entries(): Iterable<[K, V]> {
    return this._map.entries();
  }

  get(k: K): V | void {
    return this._map.get(k);
  }

  has(k: K): boolean {
    return this._map.has(k);
  }

  set(k: K, v: V): PersistentMap<K, V> {
    this._map.set(k, v);
    return this;
  }

  delete(k: K): PersistentMap<K, V> {
    this._map.delete(k);
    return this;
  }

  clone(): PersistentMap<K, V> {
    return persistentMap(this);
  }

  toMap(): Map<K, V> {
    return new Map(this._map);
  }
}

class HashArrayMappedTrieMap<K: string, V> implements PersistentMap<K, V> {
  // Because hamt.empty is not a function there is no way to introduce type
  // parameters on it, so empty is typed as HAMTPlusMap<string, mixed>.
  // $FlowIssue
  _hamt: HAMTPlusMap<K, V> = ((hamt.empty: any).beginMutation(): HAMTPlusMap<
    K,
    V,
  >);

  constructor(existing?: PersistentMap<K, V>) {
    if (existing instanceof HashArrayMappedTrieMap) {
      const h = existing._hamt.endMutation();
      existing._hamt = h.beginMutation();
      this._hamt = h.beginMutation();
    } else if (existing) {
      for (const [k, v] of existing.entries()) {
        this._hamt.set(k, v);
      }
    }
  }

  keys(): Iterable<K> {
    return this._hamt.keys();
  }

  entries(): Iterable<[K, V]> {
    return this._hamt.entries();
  }

  get(k: K): V | void {
    return this._hamt.get(k);
  }

  has(k: K): boolean {
    return this._hamt.has(k);
  }

  set(k: K, v: V): PersistentMap<K, V> {
    this._hamt.set(k, v);
    return this;
  }

  delete(k: K): PersistentMap<K, V> {
    this._hamt.delete(k);
    return this;
  }

  clone(): PersistentMap<K, V> {
    return persistentMap(this);
  }

  toMap(): Map<K, V> {
    return new Map(this._hamt);
  }
}

function persistentMap<K: string, V>(
  existing?: PersistentMap<K, V>,
): PersistentMap<K, V> {
  if (gkx('recoil_hamt_2020')) {
    return new HashArrayMappedTrieMap(existing);
  } else {
    return new BuiltInMap(existing);
  }
}

module.exports = {
  persistentMap,
};
