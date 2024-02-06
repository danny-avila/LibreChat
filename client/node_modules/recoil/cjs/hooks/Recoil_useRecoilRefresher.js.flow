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

import type {RecoilValue} from '../core/Recoil_RecoilValue';

const {useStoreRef} = require('../core/Recoil_RecoilRoot');
const {refreshRecoilValue} = require('../core/Recoil_RecoilValueInterface');
const {useCallback} = require('react');

function useRecoilRefresher<T>(recoilValue: RecoilValue<T>): () => void {
  const storeRef = useStoreRef();
  return useCallback(() => {
    const store = storeRef.current;
    refreshRecoilValue(store, recoilValue);
  }, [recoilValue, storeRef]);
}

module.exports = useRecoilRefresher;
