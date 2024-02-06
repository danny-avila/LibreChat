/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall recoil
 */
'use strict';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let a, atom, store, nullthrows, getNodeLoadable, setNodeValue;

const testRecoil = getRecoilTestFn(() => {
  const {
    makeStore,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

  atom = require('../../recoil_values/Recoil_atom');
  nullthrows = require('recoil-shared/util/Recoil_nullthrows');
  ({getNodeLoadable, setNodeValue} = require('../Recoil_FunctionalCore'));

  a = atom<number>({key: 'a', default: 0}).key;

  store = makeStore();
});

testRecoil('read default value', () => {
  expect(getNodeLoadable(store, store.getState().currentTree, a)).toMatchObject(
    {
      state: 'hasValue',
      contents: 0,
    },
  );
});

testRecoil('setNodeValue returns written value when writing atom', () => {
  const writes = setNodeValue(store, store.getState().currentTree, a, 1);
  expect(nullthrows(writes.get(a)).contents).toBe(1);
});
