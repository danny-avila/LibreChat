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

const {reactMode} = require('../core/Recoil_ReactMode');
const {RecoilRoot, useStoreRef} = require('../core/Recoil_RecoilRoot');
const React = require('react');
const {useMemo} = require('react');

export type RecoilBridge = React.AbstractComponent<{children: React.Node}>;

function useRecoilBridgeAcrossReactRoots(): RecoilBridge {
  // The test fails when using useMutableSource(), but only if act() is used
  // for the nested root.  So, this may only be a testing environment issue.
  if (reactMode().mode === 'MUTABLE_SOURCE') {
    // eslint-disable-next-line fb-www/no-console
    console.warn(
      'Warning: There are known issues using useRecoilBridgeAcrossReactRoots() in recoil_mutable_source rendering mode.  Please consider upgrading to recoil_sync_external_store mode.',
    );
  }
  const store = useStoreRef().current;
  return useMemo(() => {
    // eslint-disable-next-line no-shadow
    function RecoilBridge({
      children,
    }: $TEMPORARY$object<{children: React.Node}>) {
      return <RecoilRoot store_INTERNAL={store}>{children}</RecoilRoot>;
    }
    return RecoilBridge;
  }, [store]);
}

module.exports = useRecoilBridgeAcrossReactRoots;
