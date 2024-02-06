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

import type {RecoilValueReadOnly} from 'Recoil_RecoilValue';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let store, getRecoilValueAsLoadable, errorSelector;

const testRecoil = getRecoilTestFn(() => {
  const {
    makeStore,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

  ({
    getRecoilValueAsLoadable,
  } = require('../../core/Recoil_RecoilValueInterface'));
  errorSelector = require('../Recoil_errorSelector');

  store = makeStore();
});

function getError(recoilValue: RecoilValueReadOnly<mixed>): Error {
  const error = getRecoilValueAsLoadable(store, recoilValue).errorOrThrow();
  if (!(error instanceof Error)) {
    throw new Error('Expected error to be an instance of Error');
  }
  return error;
}

testRecoil('errorSelector - string', () => {
  const mySelector = errorSelector<mixed>('My Error');
  expect(getError(mySelector).message).toEqual(
    expect.stringContaining('My Error'),
  );
});
