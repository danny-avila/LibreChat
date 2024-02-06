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

const nullthrows = require('recoil-shared/util/Recoil_nullthrows');

type CacheNode<K, V> = {
  key: K,
  value: V,
  left: ?CacheNode<K, V>,
  right: ?CacheNode<K, V>,
};

type Options<K> = {
  maxSize: number,
  mapKey?: K => mixed,
};

class LRUCache<K = mixed, V = mixed> {
  _maxSize: number;
  _size: number;
  _head: ?CacheNode<K, V>;
  _tail: ?CacheNode<K, V>;
  _map: Map<mixed, CacheNode<K, V>>;
  _keyMapper: K => mixed;

  constructor(options: Options<K>) {
    this._maxSize = options.maxSize;
    this._size = 0;
    this._head = null;
    this._tail = null;
    this._map = new Map<mixed, CacheNode<K, V>>();
    this._keyMapper = options.mapKey ?? (v => v);
  }

  head(): ?CacheNode<K, V> {
    return this._head;
  }

  tail(): ?CacheNode<K, V> {
    return this._tail;
  }

  size(): number {
    return this._size;
  }

  maxSize(): number {
    return this._maxSize;
  }

  has(key: K): boolean {
    return this._map.has(this._keyMapper(key));
  }

  get(key: K): ?V {
    const mappedKey = this._keyMapper(key);
    const node = this._map.get(mappedKey);

    if (!node) {
      return undefined;
    }

    this.set(key, node.value);

    return node.value;
  }

  set(key: K, val: V): void {
    const mappedKey = this._keyMapper(key);
    const existingNode = this._map.get(mappedKey);

    if (existingNode) {
      this.delete(key);
    }

    const head = this.head();
    const node = {
      key,
      right: head,
      left: null,
      value: val,
    };

    if (head) {
      head.left = node;
    } else {
      this._tail = node;
    }

    this._map.set(mappedKey, node);
    this._head = node;
    this._size++;

    this._maybeDeleteLRU();
  }

  _maybeDeleteLRU() {
    if (this.size() > this.maxSize()) {
      this.deleteLru();
    }
  }

  deleteLru(): void {
    const tail = this.tail();

    if (tail) {
      this.delete(tail.key);
    }
  }

  delete(key: K): void {
    const mappedKey = this._keyMapper(key);

    if (!this._size || !this._map.has(mappedKey)) {
      return;
    }

    const node = nullthrows(this._map.get(mappedKey));
    const right = node.right;
    const left = node.left;

    if (right) {
      right.left = node.left;
    }

    if (left) {
      left.right = node.right;
    }

    if (node === this.head()) {
      this._head = right;
    }

    if (node === this.tail()) {
      this._tail = left;
    }

    this._map.delete(mappedKey);
    this._size--;
  }

  clear(): void {
    this._size = 0;
    this._head = null;
    this._tail = null;
    this._map = new Map<mixed, CacheNode<K, V>>();
  }
}

module.exports = {LRUCache};
