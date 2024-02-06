/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall recoil
 */
'use strict';

import type {NodeKey} from './Recoil_State';

// eslint-disable-next-line no-unused-vars
class AbstractRecoilValue<+T> {
  key: NodeKey;
  constructor(newKey: NodeKey) {
    this.key = newKey;
  }
  toJSON(): {key: string} {
    return {key: this.key};
  }
}

class RecoilState<T> extends AbstractRecoilValue<T> {}

class RecoilValueReadOnly<+T> extends AbstractRecoilValue<T> {}

export type RecoilValue<T> = RecoilValueReadOnly<T> | RecoilState<T>;

function isRecoilValue(x: mixed): boolean %checks {
  return x instanceof RecoilState || x instanceof RecoilValueReadOnly;
}

module.exports = {
  AbstractRecoilValue,
  RecoilState,
  RecoilValueReadOnly,
  isRecoilValue,
};
