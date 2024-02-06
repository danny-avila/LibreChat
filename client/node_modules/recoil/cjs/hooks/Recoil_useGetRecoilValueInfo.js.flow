/**
 * (c) Meta Platforms, Inc. and affiliates. Confidential and proprietary.
 *
 * @flow strict-local
 * @format
 * @oncall recoil
 */
'use strict';

import type {RecoilValueInfo} from '../core/Recoil_FunctionalCore';
import type {RecoilValue} from '../core/Recoil_RecoilValue';

const {peekNodeInfo} = require('../core/Recoil_FunctionalCore');
const {useStoreRef} = require('../core/Recoil_RecoilRoot');

function useGetRecoilValueInfo(): <T>(RecoilValue<T>) => RecoilValueInfo<T> {
  const storeRef = useStoreRef();

  // $FlowFixMe[incompatible-return]
  return <T>({key}): RecoilValueInfo<T> =>
    peekNodeInfo<T>(
      storeRef.current,
      storeRef.current.getState().currentTree,
      key,
    );
}

module.exports = useGetRecoilValueInfo;
