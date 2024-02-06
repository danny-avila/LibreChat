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

import type {ValueOrUpdater} from '../recoil_values/Recoil_callbackTypes';
import type {RecoilState, RecoilValue} from './Recoil_RecoilValue';
import type {NodeKey, Store, TreeState} from './Recoil_State';

const {loadableWithValue} = require('../adt/Recoil_Loadable');
const {initializeNode} = require('./Recoil_FunctionalCore');
const {DEFAULT_VALUE, getNode} = require('./Recoil_Node');
const {
  copyTreeState,
  getRecoilValueAsLoadable,
  invalidateDownstreams,
  writeLoadableToTreeState,
} = require('./Recoil_RecoilValueInterface');
const err = require('recoil-shared/util/Recoil_err');

export interface TransactionInterface {
  get: <T>(RecoilValue<T>) => T;
  set: <T>(RecoilState<T>, ValueOrUpdater<T>) => void;
  reset: <T>(RecoilState<T>) => void;
}

function isAtom<T>(recoilValue: RecoilValue<T>): boolean {
  return getNode(recoilValue.key).nodeType === 'atom';
}

class TransactionInterfaceImpl {
  _store: Store;
  _treeState: TreeState;
  _changes: Map<NodeKey, mixed>;

  constructor(store: Store, treeState: TreeState) {
    this._store = store;
    this._treeState = treeState;
    this._changes = new Map();
  }

  // Allow destructing
  // eslint-disable-next-line fb-www/extra-arrow-initializer
  get = <T>(recoilValue: RecoilValue<T>): T => {
    if (this._changes.has(recoilValue.key)) {
      // $FlowIssue[incompatible-return]
      return this._changes.get(recoilValue.key);
    }
    if (!isAtom(recoilValue)) {
      throw err('Reading selectors within atomicUpdate is not supported');
    }
    const loadable = getRecoilValueAsLoadable(
      this._store,
      recoilValue,
      this._treeState,
    );
    if (loadable.state === 'hasValue') {
      return loadable.contents;
    } else if (loadable.state === 'hasError') {
      throw loadable.contents;
    } else {
      throw err(
        `Expected Recoil atom ${recoilValue.key} to have a value, but it is in a loading state.`,
      );
    }
  };

  // Allow destructing
  // eslint-disable-next-line fb-www/extra-arrow-initializer
  set = <T>(
    recoilState: RecoilState<T>,
    valueOrUpdater: ValueOrUpdater<T>,
  ): void => {
    if (!isAtom(recoilState)) {
      throw err('Setting selectors within atomicUpdate is not supported');
    }

    if (typeof valueOrUpdater === 'function') {
      const current = this.get(recoilState);
      this._changes.set(recoilState.key, (valueOrUpdater: any)(current)); // flowlint-line unclear-type:off
    } else {
      // Initialize atom and run effects if not initialized yet
      initializeNode(this._store, recoilState.key, 'set');

      this._changes.set(recoilState.key, valueOrUpdater);
    }
  };

  // Allow destructing
  // eslint-disable-next-line fb-www/extra-arrow-initializer
  reset = <T>(recoilState: RecoilState<T>): void => {
    this.set(recoilState, DEFAULT_VALUE);
  };

  newTreeState_INTERNAL(): TreeState {
    if (this._changes.size === 0) {
      return this._treeState;
    }
    const newState = copyTreeState(this._treeState);
    for (const [k, v] of this._changes) {
      writeLoadableToTreeState(newState, k, loadableWithValue(v));
    }
    invalidateDownstreams(this._store, newState);
    return newState;
  }
}

function atomicUpdater(store: Store): ((TransactionInterface) => void) => void {
  return fn => {
    store.replaceState(treeState => {
      const changeset = new TransactionInterfaceImpl(store, treeState);
      fn(changeset);
      return changeset.newTreeState_INTERNAL();
    });
  };
}

module.exports = {atomicUpdater};
