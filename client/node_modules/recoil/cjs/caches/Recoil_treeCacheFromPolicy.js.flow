/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall recoil
 */
'use strict';

import type {
  CachePolicy,
  EqualityPolicy,
  EvictionPolicy,
} from './Recoil_CachePolicy';
import type {TreeCacheImplementation} from './Recoil_TreeCacheImplementationType';

const {TreeCache} = require('./Recoil_TreeCache');
const treeCacheLRU = require('./Recoil_treeCacheLRU');
const err = require('recoil-shared/util/Recoil_err');
const nullthrows = require('recoil-shared/util/Recoil_nullthrows');
const stableStringify = require('recoil-shared/util/Recoil_stableStringify');

const defaultPolicy: {
  equality: 'reference',
  eviction: 'keep-all',
  maxSize: number,
} = {
  equality: 'reference',
  eviction: 'keep-all',
  maxSize: Infinity,
};

function treeCacheFromPolicy<T>(
  {
    equality = defaultPolicy.equality,
    eviction = defaultPolicy.eviction,
    maxSize = defaultPolicy.maxSize,
  }: // $FlowFixMe[incompatible-type]
  CachePolicy = defaultPolicy,
  name?: string,
): TreeCacheImplementation<T> {
  const valueMapper = getValueMapper(equality);
  return getTreeCache(eviction, maxSize, valueMapper, name);
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

function getTreeCache<T>(
  eviction: EvictionPolicy,
  maxSize: ?number,
  mapNodeValue: mixed => mixed,
  name?: string,
): TreeCacheImplementation<T> {
  switch (eviction) {
    case 'keep-all':
      return new TreeCache<T>({name, mapNodeValue});
    case 'lru':
      return treeCacheLRU<T>({
        name,
        maxSize: nullthrows(maxSize),
        mapNodeValue,
      });
    case 'most-recent':
      return treeCacheLRU<T>({name, maxSize: 1, mapNodeValue});
  }

  throw err(`Unrecognized eviction policy ${eviction}`);
}

module.exports = treeCacheFromPolicy;
