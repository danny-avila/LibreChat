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

let _invalidateMemoizedSnapshot: ?() => void = null;

function setInvalidateMemoizedSnapshot(invalidate: () => void): void {
  _invalidateMemoizedSnapshot = invalidate;
}

function invalidateMemoizedSnapshot(): void {
  _invalidateMemoizedSnapshot?.();
}

module.exports = {
  setInvalidateMemoizedSnapshot,
  invalidateMemoizedSnapshot,
};
