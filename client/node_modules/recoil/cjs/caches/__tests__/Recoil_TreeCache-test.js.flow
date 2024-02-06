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

let TreeCache, loadableWithValue, nullthrows;

const testRecoil = getRecoilTestFn(() => {
  ({TreeCache} = require('../Recoil_TreeCache'));
  nullthrows = require('recoil-shared/util/Recoil_nullthrows');
  ({loadableWithValue} = require('../../adt/Recoil_Loadable'));
});

describe('TreeCache', () => {
  testRecoil('setting and getting values', () => {
    const cache = new TreeCache();

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

  testRecoil('deleting values', () => {
    const cache = new TreeCache();

    const [route1, loadable1] = [
      [
        ['a', 2],
        ['b', 3],
      ],
      loadableWithValue('value1'),
    ];

    const [route2, loadable2] = [
      [
        ['a', 2],
        ['b', 4],
        ['c', 5],
      ],
      loadableWithValue('value2'),
    ];

    const [route3, loadable3] = [[['a', 6]], loadableWithValue('value3')];

    cache.set(route1, loadable1);
    cache.set(route2, loadable2);
    cache.set(route3, loadable3);

    const leaf1 = cache.getLeafNode(
      nodeKey => route1.find(([key]) => key === nodeKey)?.[1],
    );

    const leaf2 = cache.getLeafNode(
      nodeKey => route2.find(([key]) => key === nodeKey)?.[1],
    );

    const leaf3 = cache.getLeafNode(
      nodeKey => route3.find(([key]) => key === nodeKey)?.[1],
    );

    expect(leaf1).toBeDefined();
    expect(leaf2).toBeDefined();
    expect(leaf3).toBeDefined();

    const leaf1Node = nullthrows(leaf1);
    const leaf2Node = nullthrows(leaf2);
    const leaf3Node = nullthrows(leaf3);

    expect(cache.size()).toBe(3);

    const deleted1 = cache.delete(leaf1Node);
    expect(deleted1).toBe(true);
    expect(cache.size()).toBe(2);

    const deleted2 = cache.delete(leaf2Node);
    expect(deleted2).toBe(true);
    expect(cache.size()).toBe(1);

    const deleted3 = cache.delete(leaf3Node);
    expect(deleted3).toBe(true);
    expect(cache.size()).toBe(0);
    expect(cache.root()).toBeNull();

    const deletedAgain = cache.delete(leaf1Node);
    expect(deletedAgain).toBe(false);
  });

  testRecoil('onHit() handler', () => {
    const [route1, loadable1] = [
      [
        ['a', 2],
        ['b', 3],
      ],
      loadableWithValue('value1'),
    ];

    const onHit = jest.fn();

    const cache = new TreeCache({
      onHit,
    });

    const getter = (nodeKey: NodeKey) =>
      route1.find(([key]) => key === nodeKey)?.[1];

    cache.set(route1, loadable1);

    // hit
    cache.get(getter);

    // miss
    cache.get(() => {});

    // hit
    cache.get(getter);

    expect(onHit).toHaveBeenCalledTimes(2);
  });

  testRecoil('onSet() handler', () => {
    const onSet = jest.fn();

    const cache = new TreeCache({
      onSet,
    });

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

    expect(onSet).toHaveBeenCalledTimes(3);
  });

  testRecoil('default key generation uses reference equality', () => {
    const [route1, loadable1] = [
      [
        ['a', [2]],
        ['b', [3]],
      ],
      loadableWithValue('value1'),
    ];

    const cache = new TreeCache();

    cache.set(route1, loadable1);

    const resultWithKeyCopy = cache.get(nodeKey => [
      ...(route1.find(([key]) => key === nodeKey)?.[1] ?? []),
    ]);

    expect(resultWithKeyCopy).toBeUndefined();

    const result = cache.get(
      nodeKey => route1.find(([key]) => key === nodeKey)?.[1],
    );

    expect(result).toBe(loadable1);
  });

  testRecoil('mapNodeValue() to implement value equality keys', () => {
    const cache = new TreeCache({
      mapNodeValue: value => JSON.stringify(value),
    });

    const [route1, loadable1] = [
      [
        ['a', [2]],
        ['b', [3]],
      ],
      loadableWithValue('value1'),
    ];

    cache.set(route1, loadable1);

    const resultWithKeyCopy = cache.get(nodeKey => [
      ...(route1.find(([key]) => key === nodeKey)?.[1] ?? []),
    ]);

    expect(resultWithKeyCopy).toBe(loadable1);
  });

  // Test ability to scale cache to large number of entries.
  // Use more dependencies than the JavaScript callstack depth limit to ensure
  // we are not using a recursive algorithm.
  testRecoil('Scalability', () => {
    const cache = new TreeCache();

    const route = Array.from(Array(10000).keys()).map(i => [
      String(i),
      String(i),
    ]);

    // $FlowFixMe[incompatible-call]
    cache.set(route, 'VALUE');

    expect(cache.get(x => x)).toBe('VALUE');

    const leafNode = cache.getLeafNode(x => x);
    expect(cache.delete(nullthrows(leafNode))).toBe(true);
  });
});
