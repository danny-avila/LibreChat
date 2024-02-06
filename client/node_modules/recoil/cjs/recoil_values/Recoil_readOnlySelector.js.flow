/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Wraps another recoil value and prevents writing to it.
 *
 * @flow strict-local
 * @format
 * @oncall recoil
 */

'use strict';

import type {
  RecoilValue,
  RecoilValueReadOnly,
} from '../core/Recoil_RecoilValue';

function readOnlySelector<T>(atom: RecoilValue<T>): RecoilValueReadOnly<T> {
  // flowlint-next-line unclear-type: off
  return (atom: any);
}

module.exports = readOnlySelector;
