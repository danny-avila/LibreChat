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

import type {Loadable} from '../adt/Recoil_Loadable';
import type {PersistentMap} from '../adt/Recoil_PersistentMap';
import type {Graph} from './Recoil_GraphTypes';
import type {ComponentID, NodeKey, StateID, StoreID} from './Recoil_Keys';
import type {RetentionZone} from './Recoil_RetentionZone';

const {persistentMap} = require('../adt/Recoil_PersistentMap');
const {graph} = require('./Recoil_Graph');
const {getNextTreeStateVersion} = require('./Recoil_Keys');

export type {ComponentID, NodeKey, StateID, StoreID} from './Recoil_Keys';

// flowlint-next-line unclear-type:off
export type AtomValues = PersistentMap<NodeKey, Loadable<any>>;
// flowlint-next-line unclear-type:off
export type AtomWrites = Map<NodeKey, Loadable<any>>;

type ComponentCallback = TreeState => void;

export type Retainable = RetentionZone | NodeKey;

// TreeState represents the state of a rendered React tree. As such, multiple
// TreeStates may be in play at one time due to concurrent rendering, and each
// TreeState is immutable.
export type TreeState = $ReadOnly<{
  // Version always increments when moving from one state to another, even
  // if the same state has been seen before.
  version: StateID,

  // State ID usually increments, but when going to a snapshot that was
  // previously rendered the state ID will be re-used:
  stateID: StateID,

  transactionMetadata: {...},

  // Atoms:
  dirtyAtoms: Set<NodeKey>,
  atomValues: AtomValues,
  nonvalidatedAtoms: PersistentMap<NodeKey, mixed>,
}>;

// StoreState represents the state of a Recoil context. It is global and mutable.
// It is updated only during effects, except that the nextTree property is updated
// when atom values change and async requests resolve, and suspendedComponentResolvers
// is updated when components are suspended.
export type StoreState = {
  // The "current" TreeState being either directly read from (legacy) or passed
  // to useMutableSource (when in use). It is replaced with nextTree when
  // a transaction is completed or async request finishes:
  currentTree: TreeState,

  // The TreeState that is written to when during the course of a transaction
  // (generally equal to a React batch) when atom values are updated.
  nextTree: null | TreeState,

  // This TreeState exists only during the time that components and observers
  // are being notified of a newly-committed tree:
  previousTree: null | TreeState,

  // Incremented when finishing a batch; used to detect cascading updates.
  commitDepth: number,

  // Node lifetimes
  knownAtoms: Set<NodeKey>,
  knownSelectors: Set<NodeKey>,

  +retention: {
    referenceCounts: Map<NodeKey | RetentionZone, number>,
    nodesRetainedByZone: Map<RetentionZone, Set<NodeKey>>,
    retainablesToCheckForRelease: Set<Retainable>,
  },

  // Between the time a component is first used and when it is released,
  // there will be a function in this map that cleans up the node upon release
  // (or upon root unmount).
  +nodeCleanupFunctions: Map<NodeKey, () => void>,

  // Which components depend on a specific node. (COMMIT/SUSPEND updates).
  +nodeToComponentSubscriptions: Map<
    NodeKey,
    Map<ComponentID, [string, ComponentCallback]>,
  >,

  // Which nodes depend on which. A pure function of the version (atom state)
  // and nodeToComponentSubscriptions. Recomputed when:
  // (1) A transaction occurs (atoms written) or
  // (2) An async request is completed or
  // (3) (IN FUTURE) nodeToComponentSubscriptions is updated
  // How incremental computation is performed:
  // In case of transactions, we walk downward from the updated atoms
  // In case of async request completion, we walk downward from updated selector
  // In (future) case of component subscriptions updated, we walk upwards from
  // component and then downward from any no-longer-depended on nodes
  +graphsByVersion: Map<StateID, Graph>,
  // Side note: it would be useful to consider async request completion as
  // another type of transaction since it should increase version etc. and many
  // things have to happen in both of these cases.

  // For observing transactions:
  +transactionSubscriptions: Map<number, (Store) => void>,
  +nodeTransactionSubscriptions: Map<NodeKey, Map<number, (Store) => void>>,

  // Callbacks to render external components that are subscribed to nodes
  // These are executed at the end of the transaction or asynchronously.
  // FIXME remove when removing useInterface
  +queuedComponentCallbacks_DEPRECATED: Array<ComponentCallback>,

  // Promise resolvers to wake any components we suspended with React Suspense
  +suspendedComponentResolvers: Set<() => void>,
};

// The Store is just the interface that is made available via the context.
// It is constant within a given Recoil root.
export type Store = $ReadOnly<{
  storeID: StoreID,
  parentStoreID?: StoreID,
  getState: () => StoreState,
  replaceState: ((TreeState) => TreeState) => void,
  getGraph: StateID => Graph,
  subscribeToTransactions: ((Store) => void, ?NodeKey) => {release: () => void},
  addTransactionMetadata: ({...}) => void,
}>;

export type StoreRef = {
  current: Store,
};

function makeEmptyTreeState(): TreeState {
  const version = getNextTreeStateVersion();
  return {
    version,
    stateID: version,
    transactionMetadata: {},
    dirtyAtoms: new Set(),
    atomValues: persistentMap(),
    nonvalidatedAtoms: persistentMap(),
  };
}

function makeEmptyStoreState(): StoreState {
  const currentTree = makeEmptyTreeState();
  return {
    currentTree,
    nextTree: null,
    previousTree: null,
    commitDepth: 0,
    knownAtoms: new Set(),
    knownSelectors: new Set(),
    transactionSubscriptions: new Map(),
    nodeTransactionSubscriptions: new Map(),
    nodeToComponentSubscriptions: new Map(),
    queuedComponentCallbacks_DEPRECATED: [],
    suspendedComponentResolvers: new Set(),
    graphsByVersion: new Map<StateID, Graph>().set(
      currentTree.version,
      graph(),
    ),
    retention: {
      referenceCounts: new Map(),
      nodesRetainedByZone: new Map(),
      retainablesToCheckForRelease: new Set(),
    },
    nodeCleanupFunctions: new Map(),
  };
}

module.exports = {
  makeEmptyTreeState,
  makeEmptyStoreState,
  getNextTreeStateVersion,
};
