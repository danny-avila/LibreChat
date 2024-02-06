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

let cacheFromPolicy;

const testRecoil = getRecoilTestFn(() => {
  cacheFromPolicy = require('../Recoil_cacheFromPolicy');
});

describe('cacheFromPolicy()', () => {
  testRecoil('equality: reference, eviction: keep-all', () => {
    const policy = {equality: 'reference', eviction: 'keep-all'};
    const cache = cacheFromPolicy<{[string]: number}, boolean>(policy);

    const obj1 = {a: 1};
    const obj2 = {b: 2};
    const obj3 = {c: 3};

    cache.set(obj1, true);
    cache.set(obj2, true);
    cache.set(obj3, true);

    expect(cache.size()).toBe(3);

    expect(cache.get(obj1)).toBe(true);
    expect(cache.get(obj2)).toBe(true);
    expect(cache.get(obj3)).toBe(true);

    expect(cache.get({...obj1})).toBe(undefined);
    expect(cache.get({...obj2})).toBe(undefined);
    expect(cache.get({...obj3})).toBe(undefined);
  });

  testRecoil('equality: value, eviction: keep-all', () => {
    const policy = {equality: 'value', eviction: 'keep-all'};
    const cache = cacheFromPolicy<{[string]: number}, boolean>(policy);

    const obj1 = {a: 1};
    const obj2 = {b: 2};
    const obj3 = {c: 3};

    cache.set(obj1, true);
    cache.set(obj2, true);
    cache.set(obj3, true);

    expect(cache.size()).toBe(3);

    expect(cache.get(obj1)).toBe(true);
    expect(cache.get(obj2)).toBe(true);
    expect(cache.get(obj3)).toBe(true);

    expect(cache.get({...obj1})).toBe(true);
    expect(cache.get({...obj2})).toBe(true);
    expect(cache.get({...obj3})).toBe(true);
  });

  testRecoil('equality: reference, eviction: lru', () => {
    const policy = {equality: 'reference', eviction: 'lru', maxSize: 2};
    const cache = cacheFromPolicy<{[string]: number}, boolean>(policy);

    const obj1 = {a: 1};
    const obj2 = {b: 2};
    const obj3 = {c: 3};

    cache.set(obj1, true);
    cache.set(obj2, true);
    cache.set(obj3, true);

    expect(cache.size()).toBe(2);

    expect(cache.get(obj1)).toBe(undefined);

    expect(cache.get(obj2)).toBe(true);
    expect(cache.get(obj3)).toBe(true);

    cache.set(obj1, true);

    expect(cache.size()).toBe(2);

    expect(cache.get(obj2)).toBe(undefined);

    expect(cache.get(obj1)).toBe(true);
    expect(cache.get(obj3)).toBe(true);

    expect(cache.get({...obj1})).toBe(undefined);
    expect(cache.get({...obj3})).toBe(undefined);
  });

  testRecoil('equality: value, eviction: lru', () => {
    const policy = {equality: 'value', eviction: 'lru', maxSize: 2};
    const cache = cacheFromPolicy<{[string]: number}, boolean>(policy);

    const obj1 = {a: 1};
    const obj2 = {b: 2};
    const obj3 = {c: 3};

    cache.set(obj1, true);
    cache.set(obj2, true);
    cache.set(obj3, true);

    expect(cache.size()).toBe(2);

    expect(cache.get(obj1)).toBe(undefined);

    expect(cache.get(obj2)).toBe(true);
    expect(cache.get(obj3)).toBe(true);

    cache.set(obj1, true);

    expect(cache.size()).toBe(2);

    expect(cache.get(obj2)).toBe(undefined);

    expect(cache.get(obj1)).toBe(true);
    expect(cache.get(obj3)).toBe(true);

    expect(cache.get({...obj2})).toBe(undefined);

    expect(cache.get({...obj1})).toBe(true);
    expect(cache.get({...obj3})).toBe(true);
  });

  testRecoil('equality: reference, eviction: most-recent', () => {
    const policy = {equality: 'reference', eviction: 'most-recent'};
    const cache = cacheFromPolicy<{[string]: number}, boolean>(policy);

    const obj1 = {a: 1};
    const obj2 = {b: 2};
    const obj3 = {c: 3};

    cache.set(obj1, true);
    cache.set(obj2, true);
    cache.set(obj3, true);

    expect(cache.size()).toBe(1);

    expect(cache.get(obj1)).toBe(undefined);
    expect(cache.get(obj2)).toBe(undefined);

    expect(cache.get(obj3)).toBe(true);

    cache.set(obj1, true);

    expect(cache.size()).toBe(1);

    expect(cache.get(obj2)).toBe(undefined);
    expect(cache.get(obj3)).toBe(undefined);

    expect(cache.get(obj1)).toBe(true);

    expect(cache.get({...obj2})).toBe(undefined);
    expect(cache.get({...obj1})).toBe(undefined);
    expect(cache.get({...obj3})).toBe(undefined);
  });

  testRecoil('equality: value, eviction: most-recent', () => {
    const policy = {equality: 'value', eviction: 'most-recent'};
    const cache = cacheFromPolicy<{[string]: number}, boolean>(policy);

    const obj1 = {a: 1};
    const obj2 = {b: 2};
    const obj3 = {c: 3};

    cache.set(obj1, true);
    cache.set(obj2, true);
    cache.set(obj3, true);

    expect(cache.size()).toBe(1);

    expect(cache.get(obj1)).toBe(undefined);
    expect(cache.get(obj2)).toBe(undefined);

    expect(cache.get(obj3)).toBe(true);

    cache.set(obj1, true);

    expect(cache.size()).toBe(1);

    expect(cache.get(obj2)).toBe(undefined);
    expect(cache.get(obj3)).toBe(undefined);

    expect(cache.get(obj1)).toBe(true);

    expect(cache.get({...obj2})).toBe(undefined);
    expect(cache.get({...obj3})).toBe(undefined);

    expect(cache.get({...obj1})).toBe(true);
  });
});
