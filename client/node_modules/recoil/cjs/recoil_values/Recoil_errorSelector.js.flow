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

import type {RecoilValueReadOnly} from '../core/Recoil_RecoilValue';

const selectorFamily = require('./Recoil_selectorFamily');
const err = require('recoil-shared/util/Recoil_err');

// flowlint-next-line unclear-type:off
const throwingSelector = selectorFamily<any, any>({
  key: '__error',
  get: message => () => {
    throw err(message);
  },
  // TODO Why?
  cachePolicyForParams_UNSTABLE: {
    equality: 'reference',
  },
});

// Function that returns a selector which always throws an error
// with the provided message.
function errorSelector<T>(message: string): RecoilValueReadOnly<T> {
  return throwingSelector(message);
}

module.exports = errorSelector;
