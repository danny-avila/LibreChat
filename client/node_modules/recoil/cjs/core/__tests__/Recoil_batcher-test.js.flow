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

let unstable_batchedUpdates, batchUpdates, getBatcher, setBatcher;

const testRecoil = getRecoilTestFn(() => {
  ({unstable_batchedUpdates} = require('ReactDOMLegacy_DEPRECATED'));
  ({batchUpdates, getBatcher, setBatcher} = require('../Recoil_Batching'));
});

/**
 * Cleanup function that will reset the batcher back
 * to ReactDOM's resetBatcherToDefault.
 *
 * Call this at the end of a test that calls setBatcher
 * to maintain test purity.
 */
const resetBatcherToDefault = () => {
  setBatcher(unstable_batchedUpdates);
};

describe('batcher', () => {
  testRecoil('default batcher is ReactDOM unstable_batchedUpdates', () => {
    expect(getBatcher()).toEqual(unstable_batchedUpdates);
  });

  testRecoil('setBatcher sets the batcher function', () => {
    const batcherFn = jest.fn();
    setBatcher(batcherFn);

    expect(getBatcher()).toEqual(batcherFn);

    resetBatcherToDefault();
  });

  testRecoil('batchUpdates calls the batcher', () => {
    const batcherFn = jest.fn();
    setBatcher(batcherFn);

    batchUpdates(() => {});
    expect(batcherFn).toHaveBeenCalledTimes(1);

    resetBatcherToDefault();
  });
});
