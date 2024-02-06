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
import type {NodeKey} from 'Recoil_Keys';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let treeCacheFromPolicy;

const testRecoil = getRecoilTestFn(() => {
  treeCacheFromPolicy = require('../Recoil_treeCacheFromPolicy');
});

/* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
 * LTI update could not be added via codemod */
const valGetterFromPath = path => (nodeKey: NodeKey) =>
  path.find(([k]) => k === nodeKey)?.[1];
/* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
 * LTI update could not be added via codemod */
const clonePath = path => JSON.parse(JSON.stringify(path));

describe('treeCacheFromPolicy()', () => {
  testRecoil('equality: reference, eviction: keep-all', () => {
    const policy = {equality: 'reference', eviction: 'keep-all'};
    const cache = treeCacheFromPolicy<{[string]: number}>(policy);

    const path1 = [
      ['a', [1]],
      ['b', [2]],
    ];
    const obj1 = {a: 1};

    const path2 = [['a', [2]]];
    const obj2 = {b: 2};

    const path3 = [
      ['a', [3]],
      ['c', [4]],
    ];
    const obj3 = {c: 3};

    cache.set(path1, obj1);
    cache.set(path2, obj2);
    cache.set(path3, obj3);

    expect(cache.size()).toBe(3);

    expect(cache.get(valGetterFromPath(path1))).toBe(obj1);
    expect(cache.get(valGetterFromPath(path2))).toBe(obj2);
    expect(cache.get(valGetterFromPath(path3))).toBe(obj3);

    expect(cache.get(valGetterFromPath(clonePath(path1)))).toBe(undefined);
    expect(cache.get(valGetterFromPath(clonePath(path2)))).toBe(undefined);
    expect(cache.get(valGetterFromPath(clonePath(path3)))).toBe(undefined);
  });

  testRecoil('equality: value, eviction: keep-all', () => {
    const policy = {equality: 'value', eviction: 'keep-all'};
    const cache = treeCacheFromPolicy<{[string]: number}>(policy);

    const path1 = [
      ['a', [1]],
      ['b', [2]],
    ];
    const obj1 = {a: 1};

    const path2 = [['a', [2]]];
    const obj2 = {b: 2};

    const path3 = [
      ['a', [3]],
      ['c', [4]],
    ];
    const obj3 = {c: 3};

    cache.set(path1, obj1);
    cache.set(path2, obj2);
    cache.set(path3, obj3);

    expect(cache.size()).toBe(3);

    expect(cache.get(valGetterFromPath(path1))).toBe(obj1);
    expect(cache.get(valGetterFromPath(path2))).toBe(obj2);
    expect(cache.get(valGetterFromPath(path3))).toBe(obj3);

    expect(cache.get(valGetterFromPath(clonePath(path1)))).toBe(obj1);
    expect(cache.get(valGetterFromPath(clonePath(path2)))).toBe(obj2);
    expect(cache.get(valGetterFromPath(clonePath(path3)))).toBe(obj3);
  });

  testRecoil('equality: reference, eviction: lru', () => {
    const policy = {equality: 'reference', eviction: 'lru', maxSize: 2};
    const cache = treeCacheFromPolicy<{[string]: number}>(policy);

    const path1 = [
      ['a', [1]],
      ['b', [2]],
    ];
    const obj1 = {a: 1};

    const path2 = [['a', [2]]];
    const obj2 = {b: 2};

    const path3 = [
      ['a', [3]],
      ['c', [4]],
    ];
    const obj3 = {c: 3};

    cache.set(path1, obj1);
    cache.set(path2, obj2);
    cache.set(path3, obj3);

    expect(cache.size()).toBe(2);

    expect(cache.get(valGetterFromPath(path1))).toBe(undefined);

    expect(cache.get(valGetterFromPath(path2))).toBe(obj2);
    expect(cache.get(valGetterFromPath(path3))).toBe(obj3);

    cache.set(path1, obj1);

    expect(cache.size()).toBe(2);

    expect(cache.get(valGetterFromPath(path2))).toBe(undefined);

    expect(cache.get(valGetterFromPath(path1))).toBe(obj1);
    expect(cache.get(valGetterFromPath(path3))).toBe(obj3);

    expect(cache.get(valGetterFromPath(clonePath(path1)))).toBe(undefined);
    expect(cache.get(valGetterFromPath(clonePath(path3)))).toBe(undefined);
  });

  testRecoil('equality: value, eviction: lru', () => {
    const policy = {equality: 'value', eviction: 'lru', maxSize: 2};
    const cache = treeCacheFromPolicy<{[string]: number}>(policy);

    const path1 = [
      ['a', [1]],
      ['b', [2]],
    ];
    const obj1 = {a: 1};

    const path2 = [['a', [2]]];
    const obj2 = {b: 2};

    const path3 = [
      ['a', [3]],
      ['c', [4]],
    ];
    const obj3 = {c: 3};

    cache.set(path1, obj1);
    cache.set(path2, obj2);
    cache.set(path3, obj3);

    expect(cache.size()).toBe(2);

    expect(cache.get(valGetterFromPath(path1))).toBe(undefined);

    expect(cache.get(valGetterFromPath(path2))).toBe(obj2);
    expect(cache.get(valGetterFromPath(path3))).toBe(obj3);

    cache.set(path1, obj1);

    expect(cache.size()).toBe(2);

    expect(cache.get(valGetterFromPath(path2))).toBe(undefined);

    expect(cache.get(valGetterFromPath(path1))).toBe(obj1);
    expect(cache.get(valGetterFromPath(path3))).toBe(obj3);

    expect(cache.get(valGetterFromPath(clonePath(path1)))).toBe(obj1);
    expect(cache.get(valGetterFromPath(clonePath(path3)))).toBe(obj3);
  });

  testRecoil('equality: reference, eviction: most-recent', () => {
    const policy = {equality: 'reference', eviction: 'most-recent'};
    const cache = treeCacheFromPolicy<{[string]: number}>(policy);

    const path1 = [
      ['a', [1]],
      ['b', [2]],
    ];
    const obj1 = {a: 1};

    const path2 = [['a', [2]]];
    const obj2 = {b: 2};

    const path3 = [
      ['a', [3]],
      ['c', [4]],
    ];
    const obj3 = {c: 3};

    cache.set(path1, obj1);
    cache.set(path2, obj2);
    cache.set(path3, obj3);

    expect(cache.size()).toBe(1);

    expect(cache.get(valGetterFromPath(path1))).toBe(undefined);
    expect(cache.get(valGetterFromPath(path2))).toBe(undefined);

    expect(cache.get(valGetterFromPath(path3))).toBe(obj3);

    cache.set(path1, obj1);

    expect(cache.size()).toBe(1);

    expect(cache.get(valGetterFromPath(path2))).toBe(undefined);
    expect(cache.get(valGetterFromPath(path3))).toBe(undefined);

    expect(cache.get(valGetterFromPath(path1))).toBe(obj1);

    expect(cache.get(valGetterFromPath(clonePath(path1)))).toBe(undefined);
    expect(cache.get(valGetterFromPath(clonePath(path2)))).toBe(undefined);
    expect(cache.get(valGetterFromPath(clonePath(path3)))).toBe(undefined);
  });

  testRecoil('equality: value, eviction: most-recent', () => {
    const policy = {equality: 'value', eviction: 'most-recent'};
    const cache = treeCacheFromPolicy<{[string]: number}>(policy);

    const path1 = [
      ['a', [1]],
      ['b', [2]],
    ];
    const obj1 = {a: 1};

    const path2 = [['a', [2]]];
    const obj2 = {b: 2};

    const path3 = [
      ['a', [3]],
      ['c', [4]],
    ];
    const obj3 = {c: 3};

    cache.set(path1, obj1);
    cache.set(path2, obj2);
    cache.set(path3, obj3);

    expect(cache.size()).toBe(1);

    expect(cache.get(valGetterFromPath(path1))).toBe(undefined);
    expect(cache.get(valGetterFromPath(path2))).toBe(undefined);

    expect(cache.get(valGetterFromPath(path3))).toBe(obj3);

    cache.set(path1, obj1);

    expect(cache.size()).toBe(1);

    expect(cache.get(valGetterFromPath(path2))).toBe(undefined);
    expect(cache.get(valGetterFromPath(path3))).toBe(undefined);

    expect(cache.get(valGetterFromPath(path1))).toBe(obj1);

    expect(cache.get(valGetterFromPath(clonePath(path1)))).toBe(obj1);

    expect(cache.get(valGetterFromPath(clonePath(path2)))).toBe(undefined);
    expect(cache.get(valGetterFromPath(clonePath(path3)))).toBe(undefined);
  });
});
