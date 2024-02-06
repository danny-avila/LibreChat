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

type Options<K> = {
  mapKey: K => mixed,
};

class MapCache<K, V> {
  _map: Map<mixed, V>;
  _keyMapper: K => mixed;

  constructor(options?: Options<K>) {
    this._map = new Map<mixed, V>();
    this._keyMapper = options?.mapKey ?? (v => v);
  }

  size(): number {
    return this._map.size;
  }

  has(key: K): boolean {
    return this._map.has(this._keyMapper(key));
  }

  get(key: K): ?V {
    return this._map.get(this._keyMapper(key));
  }

  set(key: K, val: V): void {
    this._map.set(this._keyMapper(key), val);
  }

  delete(key: K): void {
    this._map.delete(this._keyMapper(key));
  }

  clear(): void {
    this._map.clear();
  }
}

module.exports = {MapCache};
