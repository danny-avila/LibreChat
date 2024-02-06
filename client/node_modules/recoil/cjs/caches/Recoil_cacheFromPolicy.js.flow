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

import type {CacheImplementation} from './Recoil_CacheImplementationType';
import type {
  CachePolicy,
  EqualityPolicy,
  EvictionPolicy,
} from './Recoil_CachePolicy';

const {LRUCache} = require('./Recoil_LRUCache');
const {MapCache} = require('./Recoil_MapCache');
const err = require('recoil-shared/util/Recoil_err');
const nullthrows = require('recoil-shared/util/Recoil_nullthrows');
const stableStringify = require('recoil-shared/util/Recoil_stableStringify');

const defaultPolicy: {
  equality: 'reference',
  eviction: 'none',
  maxSize: number,
} = {
  equality: 'reference',
  eviction: 'none',
  maxSize: Infinity,
};

function cacheFromPolicy<K, V>({
  equality = defaultPolicy.equality,
  eviction = defaultPolicy.eviction,
  maxSize = defaultPolicy.maxSize,
}: // $FlowFixMe[incompatible-type]
CachePolicy = defaultPolicy): CacheImplementation<K, V> {
  const valueMapper = getValueMapper(equality);
  const cache = getCache<K, V>(eviction, maxSize, valueMapper);

  return cache;
}

function getValueMapper(equality: EqualityPolicy): mixed => mixed {
  switch (equality) {
    case 'reference':
      return val => val;
    case 'value':
      return val => stableStringify(val);
  }

  throw err(`Unrecognized equality policy ${equality}`);
}

function getCache<K, V>(
  eviction: EvictionPolicy,
  maxSize: ?number,
  mapKey: mixed => mixed,
): CacheImplementation<K, V> {
  switch (eviction) {
    case 'keep-all':
      return new MapCache<K, V>({mapKey});
    case 'lru':
      return new LRUCache<K, V>({mapKey, maxSize: nullthrows(maxSize)});
    case 'most-recent':
      return new LRUCache<K, V>({mapKey, maxSize: 1});
  }

  throw err(`Unrecognized eviction policy ${eviction}`);
}

module.exports = cacheFromPolicy;
