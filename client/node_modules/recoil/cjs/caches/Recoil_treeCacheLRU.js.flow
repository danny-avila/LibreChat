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

import type {TreeCacheImplementation} from './Recoil_TreeCacheImplementationType';

const {LRUCache} = require('./Recoil_LRUCache');
const {TreeCache} = require('./Recoil_TreeCache');

function treeCacheLRU<T>({
  name,
  maxSize,
  mapNodeValue = (v: mixed) => v,
}: {
  name?: string,
  maxSize: number,
  mapNodeValue?: mixed => mixed,
}): TreeCacheImplementation<T> {
  const lruCache = new LRUCache({maxSize});

  const cache: TreeCache<T> = new TreeCache({
    name,
    mapNodeValue,
    onHit: node => {
      lruCache.set(node, true);
    },
    onSet: node => {
      const lruNode = lruCache.tail();

      lruCache.set(node, true);

      if (lruNode && cache.size() > maxSize) {
        // $FlowFixMe[incompatible-call]
        cache.delete(lruNode.key);
      }
    },
  });

  return cache;
}

module.exports = treeCacheLRU;
