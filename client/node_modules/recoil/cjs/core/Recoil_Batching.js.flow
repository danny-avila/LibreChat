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

const {batchStart} = require('../core/Recoil_RecoilValueInterface');
const {
  unstable_batchedUpdates,
} = require('recoil-shared/util/Recoil_ReactBatchedUpdates');

// flowlint-next-line unclear-type:off
type Callback = () => any;
type Batcher = (callback: Callback) => void;

/*
 * During SSR, unstable_batchedUpdates may be undefined so this
 * falls back to a basic function that executes the batch
 */
let batcher: Batcher = unstable_batchedUpdates || (batchFn => batchFn());

/**
 * Sets the provided batcher function as the batcher function used by Recoil.
 *
 * Set the batcher to a custom batcher for your renderer,
 * if you use a renderer other than React DOM or React Native.
 */
const setBatcher: Batcher => void = (newBatcher: Batcher) => {
  batcher = newBatcher;
};

/**
 * Returns the current batcher function.
 */
const getBatcher: () => Batcher = () => batcher;

/**
 * Calls the current batcher function and passes the
 * provided callback function.
 */
const batchUpdates: Callback => void = (callback: Callback) => {
  batcher(() => {
    let batchEnd = () => undefined;
    try {
      batchEnd = batchStart();
      callback();
    } finally {
      batchEnd();
    }
  });
};

module.exports = {
  getBatcher,
  setBatcher,
  batchUpdates,
};
