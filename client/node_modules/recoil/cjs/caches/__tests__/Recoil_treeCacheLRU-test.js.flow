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

let treeCacheLRU, loadableWithValue;

const testRecoil = getRecoilTestFn(() => {
  treeCacheLRU = require('../Recoil_treeCacheLRU');
  ({loadableWithValue} = require('../../adt/Recoil_Loadable'));
});

describe('treeCacheLRU()', () => {
  testRecoil('getting and setting cache', () => {
    const cache = treeCacheLRU<$FlowFixMe>({maxSize: 10});

    const [route1, loadable1] = [
      [
        ['a', 2],
        ['b', 3],
      ],
      loadableWithValue('value1'),
    ];

    const [route2, loadable2] = [
      [
        ['a', 3],
        ['b', 4],
      ],
      loadableWithValue('value2'),
    ];

    const [route3, loadable3] = [[['a', 4]], loadableWithValue('value3')];

    cache.set(route1, loadable1);
    cache.set(route2, loadable2);
    cache.set(route3, loadable3);

    expect(
      cache.get(nodeKey => route1.find(([key]) => key === nodeKey)?.[1]),
    ).toBe(loadable1);

    expect(
      cache.get(nodeKey => route2.find(([key]) => key === nodeKey)?.[1]),
    ).toBe(loadable2);

    expect(
      cache.get(nodeKey => route3.find(([key]) => key === nodeKey)?.[1]),
    ).toBe(loadable3);

    expect(cache.size()).toBe(3);
  });

  testRecoil('getting and setting cache (hitting max size)', () => {
    const cache = treeCacheLRU<$FlowFixMe>({maxSize: 2});

    const [route1, loadable1] = [
      [
        ['a', 2],
        ['b', 3],
      ],
      loadableWithValue('value1'),
    ];

    const [route2, loadable2] = [
      [
        ['a', 3],
        ['b', 4],
      ],
      loadableWithValue('value2'),
    ];

    const [route3, loadable3] = [[['a', 4]], loadableWithValue('value3')];

    cache.set(route1, loadable1);
    cache.set(route2, loadable2);
    cache.set(route3, loadable3);

    expect(
      cache.get(nodeKey => route1.find(([key]) => key === nodeKey)?.[1]),
    ).toBe(undefined);

    expect(
      cache.get(nodeKey => route2.find(([key]) => key === nodeKey)?.[1]),
    ).toBe(loadable2);

    expect(
      cache.get(nodeKey => route3.find(([key]) => key === nodeKey)?.[1]),
    ).toBe(loadable3);

    expect(cache.size()).toBe(2);

    cache.set(route1, loadable1);

    expect(
      cache.get(nodeKey => route1.find(([key]) => key === nodeKey)?.[1]),
    ).toBe(loadable1);

    expect(
      cache.get(nodeKey => route2.find(([key]) => key === nodeKey)?.[1]),
    ).toBe(undefined);

    expect(cache.size()).toBe(2);
  });
});
