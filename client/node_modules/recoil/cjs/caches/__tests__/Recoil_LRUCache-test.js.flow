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

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let LRUCache;

const testRecoil = getRecoilTestFn(() => {
  ({LRUCache} = require('../Recoil_LRUCache'));
});

describe('LRUCache', () => {
  testRecoil('setting and getting (without hitting max size)', () => {
    const cache = new LRUCache({
      maxSize: 10,
    });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.size()).toBe(3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);

    cache.delete('a');
    cache.delete('b');

    expect(cache.size()).toBe(1);
  });

  testRecoil('setting and getting (hitting max size)', () => {
    const cache = new LRUCache({
      maxSize: 2,
    });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.size()).toBe(2);

    expect(cache.get('a')).toBe(undefined);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);

    cache.delete('a');
    cache.delete('b');

    expect(cache.size()).toBe(1);

    cache.set('d', 4);
    cache.set('e', 5);

    expect(cache.size()).toBe(2);

    expect(cache.get('b')).toBe(undefined);
    expect(cache.get('c')).toBe(undefined);
  });

  testRecoil('manually deleting LRU', () => {
    const cache = new LRUCache({
      maxSize: 10,
    });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.size()).toBe(3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);

    cache.deleteLru(); // delete 'a'

    expect(cache.get('a')).toBe(undefined);
    expect(cache.size()).toBe(2);

    cache.deleteLru(); // delete 'b'

    expect(cache.get('b')).toBe(undefined);

    expect(cache.size()).toBe(1);
  });

  testRecoil('head() and tail()', () => {
    const cache = new LRUCache({
      maxSize: 10,
    });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.size()).toBe(3);

    expect(cache.tail()).toBeDefined();

    expect(cache.tail()?.value).toBe(1);
    expect(cache.head()?.value).toBe(3);

    expect(cache.get('c')).toBe(3);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('a')).toBe(1);

    expect(cache.tail()?.value).toBe(3);
    expect(cache.head()?.value).toBe(1);

    cache.delete('a');
    cache.delete('b');

    expect(cache.tail()?.value).toBe(3);
    expect(cache.head()?.value).toBe(3);

    expect(cache.size()).toBe(1);
  });
});
