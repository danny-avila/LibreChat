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

import type {TransactionInterface} from '../core/Recoil_AtomicUpdates';
import type {RecoilState, RecoilValue} from '../core/Recoil_RecoilValue';
import type {Snapshot} from '../core/Recoil_Snapshot';
import type {Store} from '../core/Recoil_State';

const {atomicUpdater} = require('../core/Recoil_AtomicUpdates');
const {batchUpdates} = require('../core/Recoil_Batching');
const {DEFAULT_VALUE} = require('../core/Recoil_Node');
const {useStoreRef} = require('../core/Recoil_RecoilRoot');
const {
  refreshRecoilValue,
  setRecoilValue,
} = require('../core/Recoil_RecoilValueInterface');
const {cloneSnapshot} = require('../core/Recoil_Snapshot');
const {gotoSnapshot} = require('./Recoil_SnapshotHooks');
const {useCallback} = require('react');
const err = require('recoil-shared/util/Recoil_err');
const invariant = require('recoil-shared/util/Recoil_invariant');
const isPromise = require('recoil-shared/util/Recoil_isPromise');
const lazyProxy = require('recoil-shared/util/Recoil_lazyProxy');

export type RecoilCallbackInterface = $ReadOnly<{
  set: <T>(RecoilState<T>, (T => T) | T) => void,
  reset: <T>(RecoilState<T>) => void,
  refresh: <T>(RecoilValue<T>) => void,
  snapshot: Snapshot,
  gotoSnapshot: Snapshot => void,
  transact_UNSTABLE: ((TransactionInterface) => void) => void,
}>;

class Sentinel {}
const SENTINEL = new Sentinel();

function recoilCallback<Args: $ReadOnlyArray<mixed>, Return, ExtraInterface>(
  store: Store,
  fn: ({...ExtraInterface, ...RecoilCallbackInterface}) => (...Args) => Return,
  args: Args,
  extraInterface?: ExtraInterface,
): Return {
  let ret: $FlowFixMe = SENTINEL;
  let releaseSnapshot;
  batchUpdates(() => {
    const errMsg =
      'useRecoilCallback() expects a function that returns a function: ' +
      'it accepts a function of the type (RecoilInterface) => (Args) => ReturnType ' +
      'and returns a callback function (Args) => ReturnType, where RecoilInterface is ' +
      'an object {snapshot, set, ...} and Args and ReturnType are the argument and return ' +
      'types of the callback you want to create.  Please see the docs ' +
      'at recoiljs.org for details.';
    if (typeof fn !== 'function') {
      throw err(errMsg);
    }

    // Clone the snapshot lazily to avoid overhead if the callback does not use it.
    // Note that this means the snapshot may represent later state from when
    // the callback was called if it first accesses the snapshot asynchronously.
    const callbackInterface: {
      ...ExtraInterface,
      ...RecoilCallbackInterface,
    } = lazyProxy(
      {
        ...(extraInterface ?? ({}: any)), // flowlint-line unclear-type:off
        // $FlowFixMe[missing-local-annot]
        set: <T>(node: RecoilState<T>, newValue: T | (T => T)) =>
          setRecoilValue(store, node, newValue),
        // $FlowFixMe[missing-local-annot]
        reset: <T>(node: RecoilState<T>) =>
          setRecoilValue(store, node, DEFAULT_VALUE),
        // $FlowFixMe[missing-local-annot]
        refresh: <T>(node: RecoilValue<T>) => refreshRecoilValue(store, node),
        gotoSnapshot: snapshot => gotoSnapshot(store, snapshot),
        transact_UNSTABLE: transaction => atomicUpdater(store)(transaction),
      },
      {
        snapshot: () => {
          const snapshot = cloneSnapshot(store);
          releaseSnapshot = snapshot.retain();
          return snapshot;
        },
      },
    );

    const callback = fn(callbackInterface);
    if (typeof callback !== 'function') {
      throw err(errMsg);
    }
    ret = callback(...args);
  });
  invariant(
    !(ret instanceof Sentinel),
    'batchUpdates should return immediately',
  );
  if (isPromise(ret)) {
    ret = ret.finally(() => {
      releaseSnapshot?.();
    });
  } else {
    releaseSnapshot?.();
  }
  return (ret: Return);
}

function useRecoilCallback<Args: $ReadOnlyArray<mixed>, Return>(
  fn: RecoilCallbackInterface => (...Args) => Return,
  deps?: $ReadOnlyArray<mixed>,
): (...Args) => Return {
  const storeRef = useStoreRef();

  return useCallback(
    // $FlowIssue[incompatible-call]
    (...args: Args): Return => {
      return recoilCallback(storeRef.current, fn, args);
    },
    deps != null ? [...deps, storeRef] : undefined, // eslint-disable-line fb-www/react-hooks-deps
  );
}

module.exports = {recoilCallback, useRecoilCallback};
