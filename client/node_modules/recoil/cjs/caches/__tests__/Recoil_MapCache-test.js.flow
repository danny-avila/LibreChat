/**
 * (c) Meta Platforms, Inc. and affiliates. Confidential and proprietary.
 *
 * @flow strict-local
 * @format
 * @oncall recoil
 */

'use strict';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let MapCache;

const testRecoil = getRecoilTestFn(() => {
  ({MapCache} = require('../Recoil_MapCache'));
});

describe('MapCache', () => {
  testRecoil('setting and getting', () => {
    const cache = new MapCache<string, number>();

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.size()).toBe(3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  testRecoil('deleting', () => {
    const cache = new MapCache<string, number>();

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.size()).toBe(3);

    cache.delete('a');

    expect(cache.size()).toBe(2);

    expect(cache.get('a')).toBe(undefined);
    expect(cache.get('b')).toBe(2);
    expect(cache.has('a')).toBe(false);
  });
});
