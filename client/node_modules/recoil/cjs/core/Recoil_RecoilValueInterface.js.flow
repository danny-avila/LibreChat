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

import type {Loadable} from '../adt/Recoil_Loadable';
import type {ValueOrUpdater} from '../recoil_values/Recoil_callbackTypes';
import type {
  AtomValues,
  AtomWrites,
  NodeKey,
  Store,
  TreeState,
} from './Recoil_State';

const {
  getDownstreamNodes,
  getNodeLoadable,
  setNodeValue,
} = require('./Recoil_FunctionalCore');
const {getNextComponentID} = require('./Recoil_Keys');
const {getNode, getNodeMaybe} = require('./Recoil_Node');
const {DefaultValue} = require('./Recoil_Node');
const {reactMode} = require('./Recoil_ReactMode');
const {
  AbstractRecoilValue,
  RecoilState,
  RecoilValueReadOnly,
  isRecoilValue,
} = require('./Recoil_RecoilValue');
const {invalidateMemoizedSnapshot} = require('./Recoil_SnapshotCache');
const err = require('recoil-shared/util/Recoil_err');
const nullthrows = require('recoil-shared/util/Recoil_nullthrows');
const recoverableViolation = require('recoil-shared/util/Recoil_recoverableViolation');

function getRecoilValueAsLoadable<T>(
  store: Store,
  {key}: AbstractRecoilValue<T>,
  treeState: TreeState = store.getState().currentTree,
): Loadable<T> {
  // Reading from an older tree can cause bugs because the dependencies that we
  // discover during the read are lost.
  const storeState = store.getState();
  if (
    !(
      treeState.version === storeState.currentTree.version ||
      treeState.version === storeState.nextTree?.version ||
      treeState.version === storeState.previousTree?.version
    )
  ) {
    recoverableViolation('Tried to read from a discarded tree', 'recoil');
  }

  const loadable = getNodeLoadable<T>(store, treeState, key);

  if (loadable.state === 'loading') {
    loadable.contents.catch(() => {
      /**
       * HACK: intercept thrown error here to prevent an uncaught promise exception. Ideally this would happen closer to selector
       * execution (perhaps introducing a new ERROR class to be resolved by async selectors that are in an error state)
       */
      return;
    });
  }

  return loadable;
}

function applyAtomValueWrites(
  atomValues: AtomValues,
  writes: AtomWrites,
): AtomValues {
  const result = atomValues.clone();
  writes.forEach((v, k) => {
    if (v.state === 'hasValue' && v.contents instanceof DefaultValue) {
      result.delete(k);
    } else {
      result.set(k, v);
    }
  });
  return result;
}

function valueFromValueOrUpdater<T>(
  store: Store,
  state: TreeState,
  {key}: AbstractRecoilValue<T>,
  valueOrUpdater: ValueOrUpdater<T>,
): T | DefaultValue {
  if (typeof valueOrUpdater === 'function') {
    // Updater form: pass in the current value. Throw if the current value
    // is unavailable (namely when updating an async selector that's
    // pending or errored):
    const current = getNodeLoadable<$FlowFixMe>(store, state, key);

    if (current.state === 'loading') {
      const msg = `Tried to set atom or selector "${key}" using an updater function while the current state is pending, this is not currently supported.`;
      recoverableViolation(msg, 'recoil');
      throw err(msg);
    } else if (current.state === 'hasError') {
      throw current.contents;
    }
    // T itself may be a function, so our refinement is not sufficient:
    return (valueOrUpdater: any)(current.contents); // flowlint-line unclear-type:off
  } else {
    return valueOrUpdater;
  }
}

type Action<T> =
  | {
      type: 'set',
      recoilValue: AbstractRecoilValue<T>,
      valueOrUpdater: T | DefaultValue | (T => T | DefaultValue),
    }
  | {
      type: 'setLoadable',
      recoilValue: AbstractRecoilValue<T>,
      loadable: Loadable<T>,
    }
  | {
      type: 'setUnvalidated',
      recoilValue: AbstractRecoilValue<T>,
      unvalidatedValue: mixed,
    }
  | {type: 'markModified', recoilValue: AbstractRecoilValue<T>};

function applyAction(store: Store, state: TreeState, action: Action<mixed>) {
  if (action.type === 'set') {
    const {recoilValue, valueOrUpdater} = action;
    const newValue = valueFromValueOrUpdater(
      store,
      state,
      recoilValue,
      valueOrUpdater,
    );

    const writes = setNodeValue(store, state, recoilValue.key, newValue);

    for (const [key, loadable] of writes.entries()) {
      writeLoadableToTreeState(state, key, loadable);
    }
  } else if (action.type === 'setLoadable') {
    const {
      recoilValue: {key},
      loadable,
    } = action;
    writeLoadableToTreeState(state, key, loadable);
  } else if (action.type === 'markModified') {
    const {
      recoilValue: {key},
    } = action;
    state.dirtyAtoms.add(key);
  } else if (action.type === 'setUnvalidated') {
    // Write value directly to state bypassing the Node interface as the node
    // definitions may not have been loaded yet when processing the initial snapshot.
    const {
      recoilValue: {key},
      unvalidatedValue,
    } = action;
    const node = getNodeMaybe(key);
    node?.invalidate?.(state);
    state.atomValues.delete(key);
    state.nonvalidatedAtoms.set(key, unvalidatedValue);
    state.dirtyAtoms.add(key);
  } else {
    recoverableViolation(`Unknown action ${action.type}`, 'recoil');
  }
}

function writeLoadableToTreeState(
  state: TreeState,
  key: NodeKey,
  loadable: Loadable<mixed>,
): void {
  if (
    loadable.state === 'hasValue' &&
    loadable.contents instanceof DefaultValue
  ) {
    state.atomValues.delete(key);
  } else {
    state.atomValues.set(key, loadable);
  }
  state.dirtyAtoms.add(key);
  state.nonvalidatedAtoms.delete(key);
}

function applyActionsToStore(store: Store, actions: Array<Action<mixed>>) {
  store.replaceState(state => {
    const newState = copyTreeState(state);
    for (const action of actions) {
      applyAction(store, newState, action);
    }
    invalidateDownstreams(store, newState);
    invalidateMemoizedSnapshot();
    return newState;
  });
}

function queueOrPerformStateUpdate(store: Store, action: Action<mixed>): void {
  if (batchStack.length) {
    const actionsByStore = batchStack[batchStack.length - 1];
    let actions = actionsByStore.get(store);
    if (!actions) {
      actionsByStore.set(store, (actions = []));
    }
    actions.push(action);
  } else {
    applyActionsToStore(store, [action]);
  }
}

const batchStack: Array<Map<Store, Array<Action<mixed>>>> = [];
function batchStart(): () => void {
  const actionsByStore = new Map<Store, Array<Action<mixed>>>();
  batchStack.push(actionsByStore);
  return () => {
    for (const [store, actions] of actionsByStore) {
      applyActionsToStore(store, actions);
    }
    const popped = batchStack.pop();
    if (popped !== actionsByStore) {
      recoverableViolation('Incorrect order of batch popping', 'recoil');
    }
  };
}

function copyTreeState(state: TreeState): TreeState {
  return {
    ...state,
    atomValues: state.atomValues.clone(),
    nonvalidatedAtoms: state.nonvalidatedAtoms.clone(),
    dirtyAtoms: new Set(state.dirtyAtoms),
  };
}

function invalidateDownstreams(store: Store, state: TreeState): void {
  // Inform any nodes that were changed or downstream of changes so that they
  // can clear out any caches as needed due to the update:
  const downstreams = getDownstreamNodes(store, state, state.dirtyAtoms);
  for (const key of downstreams) {
    getNodeMaybe(key)?.invalidate?.(state);
  }
}

function setRecoilValue<T>(
  store: Store,
  recoilValue: AbstractRecoilValue<T>,
  valueOrUpdater: T | DefaultValue | (T => T | DefaultValue),
): void {
  queueOrPerformStateUpdate(store, {
    type: 'set',
    recoilValue,
    valueOrUpdater,
  });
}

function setRecoilValueLoadable<T>(
  store: Store,
  recoilValue: AbstractRecoilValue<T>,
  loadable: DefaultValue | Loadable<T>,
): void {
  if (loadable instanceof DefaultValue) {
    return setRecoilValue(store, recoilValue, loadable);
  }
  queueOrPerformStateUpdate(store, {
    type: 'setLoadable',
    recoilValue,
    loadable: (loadable: Loadable<T>),
  });
}

function markRecoilValueModified<T>(
  store: Store,
  recoilValue: AbstractRecoilValue<T>,
): void {
  queueOrPerformStateUpdate(store, {
    type: 'markModified',
    recoilValue,
  });
}

function setUnvalidatedRecoilValue<T>(
  store: Store,
  recoilValue: AbstractRecoilValue<T>,
  unvalidatedValue: T,
): void {
  queueOrPerformStateUpdate(store, {
    type: 'setUnvalidated',
    recoilValue,
    unvalidatedValue,
  });
}

export type ComponentSubscription = {release: () => void};
function subscribeToRecoilValue<T>(
  store: Store,
  {key}: AbstractRecoilValue<T>,
  callback: TreeState => void,
  componentDebugName: ?string = null,
): ComponentSubscription {
  const subID = getNextComponentID();
  const storeState = store.getState();
  if (!storeState.nodeToComponentSubscriptions.has(key)) {
    storeState.nodeToComponentSubscriptions.set(key, new Map());
  }
  nullthrows(storeState.nodeToComponentSubscriptions.get(key)).set(subID, [
    componentDebugName ?? '<not captured>',
    callback,
  ]);

  // Handle the case that, during the same tick that we are subscribing, an atom
  // has been updated by some effect handler. Otherwise we will miss the update.
  const mode = reactMode();
  if (
    mode.early &&
    (mode.mode === 'LEGACY' || mode.mode === 'MUTABLE_SOURCE')
  ) {
    const nextTree = store.getState().nextTree;
    if (nextTree && nextTree.dirtyAtoms.has(key)) {
      callback(nextTree);
    }
  }

  return {
    release: () => {
      const releaseStoreState = store.getState();
      const subs = releaseStoreState.nodeToComponentSubscriptions.get(key);
      if (subs === undefined || !subs.has(subID)) {
        recoverableViolation(
          `Subscription missing at release time for atom ${key}. This is a bug in Recoil.`,
          'recoil',
        );
        return;
      }
      subs.delete(subID);
      if (subs.size === 0) {
        releaseStoreState.nodeToComponentSubscriptions.delete(key);
      }
    },
  };
}

function refreshRecoilValue<T>(
  store: Store,
  recoilValue: AbstractRecoilValue<T>,
): void {
  const {currentTree} = store.getState();
  const node = getNode(recoilValue.key);
  node.clearCache?.(store, currentTree);
}

module.exports = {
  RecoilValueReadOnly,
  AbstractRecoilValue,
  RecoilState,
  getRecoilValueAsLoadable,
  setRecoilValue,
  setRecoilValueLoadable,
  markRecoilValueModified,
  setUnvalidatedRecoilValue,
  subscribeToRecoilValue,
  isRecoilValue,
  applyAtomValueWrites, // TODO Remove export when deprecating initialStoreState_DEPRECATED in RecoilRoot
  batchStart,
  writeLoadableToTreeState,
  invalidateDownstreams,
  copyTreeState,
  refreshRecoilValue,
};
