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

export type {StoreID} from './core/Recoil_Keys';
export type {PersistenceType} from './core/Recoil_Node';
export type {
  RecoilValue,
  RecoilState,
  RecoilValueReadOnly,
} from './core/Recoil_RecoilValue';
export type {
  MutableSnapshot,
  Snapshot,
  SnapshotID,
} from './core/Recoil_Snapshot';
export type {SetterOrUpdater} from './hooks/Recoil_Hooks';
export type {RecoilCallbackInterface} from './hooks/Recoil_useRecoilCallback';
export type {RecoilBridge} from './hooks/Recoil_useRecoilBridgeAcrossReactRoots';
export type {Loadable} from './adt/Recoil_Loadable';
export type {
  AtomEffect,
  PersistenceSettings,
} from './recoil_values/Recoil_atom';
export type {TransactionInterface} from './core/Recoil_AtomicUpdates';
export type {
  GetRecoilValue,
  SetRecoilState,
  ResetRecoilState,
} from './recoil_values/Recoil_callbackTypes';
export type {
  Parameter,
  SelectorFamilyOptions,
} from './recoil_values/Recoil_selectorFamily';

const {RecoilLoadable} = require('./adt/Recoil_Loadable');
const {DefaultValue} = require('./core/Recoil_Node');
const {RecoilRoot, useRecoilStoreID} = require('./core/Recoil_RecoilRoot');
const {isRecoilValue} = require('./core/Recoil_RecoilValue');
const {retentionZone} = require('./core/Recoil_RetentionZone');
const {freshSnapshot} = require('./core/Recoil_Snapshot');
const {
  useRecoilState,
  useRecoilState_TRANSITION_SUPPORT_UNSTABLE,
  useRecoilStateLoadable,
  useRecoilValue,
  useRecoilValue_TRANSITION_SUPPORT_UNSTABLE,
  useRecoilValueLoadable,
  useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE,
  useResetRecoilState,
  useSetRecoilState,
} = require('./hooks/Recoil_Hooks');
const {
  useGotoRecoilSnapshot,
  useRecoilSnapshot,
  useRecoilTransactionObserver,
} = require('./hooks/Recoil_SnapshotHooks');
const useGetRecoilValueInfo = require('./hooks/Recoil_useGetRecoilValueInfo');
const useRecoilBridgeAcrossReactRoots = require('./hooks/Recoil_useRecoilBridgeAcrossReactRoots');
const {useRecoilCallback} = require('./hooks/Recoil_useRecoilCallback');
const useRecoilRefresher = require('./hooks/Recoil_useRecoilRefresher');
const useRecoilTransaction = require('./hooks/Recoil_useRecoilTransaction');
const useRetain = require('./hooks/Recoil_useRetain');
const atom = require('./recoil_values/Recoil_atom');
const atomFamily = require('./recoil_values/Recoil_atomFamily');
const constSelector = require('./recoil_values/Recoil_constSelector');
const errorSelector = require('./recoil_values/Recoil_errorSelector');
const readOnlySelector = require('./recoil_values/Recoil_readOnlySelector');
const selector = require('./recoil_values/Recoil_selector');
const selectorFamily = require('./recoil_values/Recoil_selectorFamily');
const {
  noWait,
  waitForAll,
  waitForAllSettled,
  waitForAny,
  waitForNone,
} = require('./recoil_values/Recoil_WaitFor');
const RecoilEnv = require('recoil-shared/util/Recoil_RecoilEnv');

module.exports = {
  // Types
  DefaultValue,
  isRecoilValue,
  RecoilLoadable,

  // Global Recoil environment settiongs
  RecoilEnv,

  // Recoil Root
  RecoilRoot,
  useRecoilStoreID,
  useRecoilBridgeAcrossReactRoots_UNSTABLE: useRecoilBridgeAcrossReactRoots,

  // Atoms/Selectors
  atom,
  selector,

  // Convenience Atoms/Selectors
  atomFamily,
  selectorFamily,
  constSelector,
  errorSelector,
  readOnlySelector,

  // Concurrency Helpers for Atoms/Selectors
  noWait,
  waitForNone,
  waitForAny,
  waitForAll,
  waitForAllSettled,

  // Hooks for Atoms/Selectors
  useRecoilValue,
  useRecoilValueLoadable,
  useRecoilState,
  useRecoilStateLoadable,
  useSetRecoilState,
  useResetRecoilState,
  useGetRecoilValueInfo_UNSTABLE: useGetRecoilValueInfo,
  useRecoilRefresher_UNSTABLE: useRecoilRefresher,
  useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE,
  useRecoilValue_TRANSITION_SUPPORT_UNSTABLE,
  useRecoilState_TRANSITION_SUPPORT_UNSTABLE,

  // Hooks for complex operations
  useRecoilCallback,
  useRecoilTransaction_UNSTABLE: useRecoilTransaction,

  // Snapshots
  useGotoRecoilSnapshot,
  useRecoilSnapshot,
  useRecoilTransactionObserver_UNSTABLE: useRecoilTransactionObserver,
  snapshot_UNSTABLE: freshSnapshot,

  // Memory Management
  useRetain,
  retentionZone,
};
