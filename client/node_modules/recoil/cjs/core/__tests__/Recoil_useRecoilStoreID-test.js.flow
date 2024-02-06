/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * @flow strict-local
 * @format
 * @oncall recoil
 */
'use strict';

import type {StoreID as StoreIDType} from 'Recoil_Keys';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let React, renderElements, RecoilRoot, useRecoilStoreID;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({
    renderElements,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  ({RecoilRoot, useRecoilStoreID} = require('../Recoil_RecoilRoot'));
});

testRecoil('useRecoilStoreID', () => {
  const storeIDs: {[string]: StoreIDType} = {};
  function StoreID({
    rootKey,
  }:
    | $TEMPORARY$object<{rootKey: $TEMPORARY$string<'A'>}>
    | $TEMPORARY$object<{rootKey: $TEMPORARY$string<'A1'>}>
    | $TEMPORARY$object<{rootKey: $TEMPORARY$string<'A2'>}>
    | $TEMPORARY$object<{rootKey: $TEMPORARY$string<'B'>}>) {
    const storeID = useRecoilStoreID();
    storeIDs[rootKey] = storeID;
    return null;
  }
  function MyApp() {
    return (
      <div>
        <RecoilRoot>
          <StoreID rootKey="A" />
          <RecoilRoot>
            <StoreID rootKey="A1" />
          </RecoilRoot>
          <RecoilRoot override={false}>
            <StoreID rootKey="A2" />
          </RecoilRoot>
        </RecoilRoot>
        <RecoilRoot>
          <StoreID rootKey="B" />
        </RecoilRoot>
      </div>
    );
  }

  renderElements(<MyApp />);

  expect('A' in storeIDs).toEqual(true);
  expect('A1' in storeIDs).toEqual(true);
  expect('A2' in storeIDs).toEqual(true);
  expect('B' in storeIDs).toEqual(true);
  expect(storeIDs.A).not.toEqual(storeIDs.B);
  expect(storeIDs.A).not.toEqual(storeIDs.A1);
  expect(storeIDs.A).toEqual(storeIDs.A2);
  expect(storeIDs.B).not.toEqual(storeIDs.A1);
  expect(storeIDs.B).not.toEqual(storeIDs.A2);
});
