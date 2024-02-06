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
import type {DefaultValue, Trigger} from './Recoil_Node';
import type {RecoilValue} from './Recoil_RecoilValue';
import type {RetainedBy} from './Recoil_RetainedBy';
import type {AtomWrites, NodeKey, Store, TreeState} from './Recoil_State';

const {getNode, getNodeMaybe, recoilValuesForKeys} = require('./Recoil_Node');
const {RetentionZone} = require('./Recoil_RetentionZone');
const {setByAddingToSet} = require('recoil-shared/util/Recoil_CopyOnWrite');
const filterIterable = require('recoil-shared/util/Recoil_filterIterable');
const gkx = require('recoil-shared/util/Recoil_gkx');
const lazyProxy = require('recoil-shared/util/Recoil_lazyProxy');
const mapIterable = require('recoil-shared/util/Recoil_mapIterable');

// flowlint-next-line unclear-type:off
const emptySet: $ReadOnlySet<any> = Object.freeze(new Set());

class ReadOnlyRecoilValueError extends Error {}

function initializeRetentionForNode(
  store: Store,
  nodeKey: NodeKey,
  retainedBy: RetainedBy,
): () => void {
  if (!gkx('recoil_memory_managament_2020')) {
    return () => undefined;
  }
  const {nodesRetainedByZone} = store.getState().retention;

  function addToZone(zone: RetentionZone) {
    let set = nodesRetainedByZone.get(zone);
    if (!set) {
      nodesRetainedByZone.set(zone, (set = new Set()));
    }
    set.add(nodeKey);
  }

  if (retainedBy instanceof RetentionZone) {
    addToZone(retainedBy);
  } else if (Array.isArray(retainedBy)) {
    for (const zone of retainedBy) {
      addToZone(zone);
    }
  }

  return () => {
    if (!gkx('recoil_memory_managament_2020')) {
      return;
    }
    const {retention} = store.getState();

    function deleteFromZone(zone: RetentionZone) {
      const set = retention.nodesRetainedByZone.get(zone);
      set?.delete(nodeKey);
      if (set && set.size === 0) {
        retention.nodesRetainedByZone.delete(zone);
      }
    }

    if (retainedBy instanceof RetentionZone) {
      deleteFromZone(retainedBy);
    } else if (Array.isArray(retainedBy)) {
      for (const zone of retainedBy) {
        deleteFromZone(zone);
      }
    }
  };
}

function initializeNodeIfNewToStore(
  store: Store,
  treeState: TreeState,
  key: NodeKey,
  trigger: Trigger,
): void {
  const storeState = store.getState();
  if (storeState.nodeCleanupFunctions.has(key)) {
    return;
  }
  const node = getNode(key);
  const retentionCleanup = initializeRetentionForNode(
    store,
    key,
    node.retainedBy,
  );
  const nodeCleanup = node.init(store, treeState, trigger);
  storeState.nodeCleanupFunctions.set(key, () => {
    nodeCleanup();
    retentionCleanup();
  });
}

function initializeNode(store: Store, key: NodeKey, trigger: Trigger): void {
  initializeNodeIfNewToStore(store, store.getState().currentTree, key, trigger);
}

function cleanUpNode(store: Store, key: NodeKey) {
  const state = store.getState();
  state.nodeCleanupFunctions.get(key)?.();
  state.nodeCleanupFunctions.delete(key);
}

// Get the current value loadable of a node and update the state.
// Update dependencies and subscriptions for selectors.
// Update saved value validation for atoms.
function getNodeLoadable<T>(
  store: Store,
  state: TreeState,
  key: NodeKey,
): Loadable<T> {
  initializeNodeIfNewToStore(store, state, key, 'get');
  return getNode(key).get(store, state);
}

// Peek at the current value loadable for a node without any evaluation or state change
function peekNodeLoadable<T>(
  store: Store,
  state: TreeState,
  key: NodeKey,
): ?Loadable<T> {
  return getNode(key).peek(store, state);
}

// Write value directly to state bypassing the Node interface as the node
// definitions may not have been loaded yet when processing the initial snapshot.
function setUnvalidatedAtomValue_DEPRECATED<T>(
  state: TreeState,
  key: NodeKey,
  newValue: T,
): TreeState {
  const node = getNodeMaybe(key);
  node?.invalidate?.(state);

  return {
    ...state,
    atomValues: state.atomValues.clone().delete(key),
    nonvalidatedAtoms: state.nonvalidatedAtoms.clone().set(key, newValue),
    dirtyAtoms: setByAddingToSet(state.dirtyAtoms, key),
  };
}

// Return the discovered dependencies and values to be written by setting
// a node value. (Multiple values may be written due to selectors getting to
// set upstreams; deps may be discovered because of reads in updater functions.)
function setNodeValue<T>(
  store: Store,
  state: TreeState,
  key: NodeKey,
  newValue: T | DefaultValue,
): AtomWrites {
  const node = getNode(key);
  if (node.set == null) {
    throw new ReadOnlyRecoilValueError(
      `Attempt to set read-only RecoilValue: ${key}`,
    );
  }
  const set = node.set; // so flow doesn't lose the above refinement.
  initializeNodeIfNewToStore(store, state, key, 'set');
  return set(store, state, newValue);
}

type ComponentInfo = {
  name: string,
};

export type RecoilValueInfo<T> = {
  loadable: ?Loadable<T>,
  isActive: boolean,
  isSet: boolean,
  isModified: boolean, // TODO report modified selectors
  type: 'atom' | 'selector',
  deps: Iterable<RecoilValue<mixed>>,
  subscribers: {
    nodes: Iterable<RecoilValue<mixed>>,
    components: Iterable<ComponentInfo>,
  },
};

function peekNodeInfo<T>(
  store: Store,
  state: TreeState,
  key: NodeKey,
): RecoilValueInfo<T> {
  const storeState = store.getState();
  const graph = store.getGraph(state.version);
  const type = getNode(key).nodeType;
  return lazyProxy(
    {
      type,
    },
    {
      // $FlowFixMe[underconstrained-implicit-instantiation]
      loadable: () => peekNodeLoadable(store, state, key),
      isActive: () =>
        storeState.knownAtoms.has(key) || storeState.knownSelectors.has(key),
      isSet: () => (type === 'selector' ? false : state.atomValues.has(key)),
      isModified: () => state.dirtyAtoms.has(key),
      // Report current dependencies.  If the node hasn't been evaluated, then
      // dependencies may be missing based on the current state.
      deps: () => recoilValuesForKeys(graph.nodeDeps.get(key) ?? []),
      // Reports all "current" subscribers.  Evaluating other nodes or
      // previous in-progress async evaluations may introduce new subscribers.
      subscribers: () => ({
        nodes: recoilValuesForKeys(
          filterIterable(
            getDownstreamNodes(store, state, new Set([key])),
            nodeKey => nodeKey !== key,
          ),
        ),
        components: mapIterable(
          storeState.nodeToComponentSubscriptions.get(key)?.values() ?? [],
          ([name]) => ({name}),
        ),
      }),
    },
  );
}

// Find all of the recursively dependent nodes
function getDownstreamNodes(
  store: Store,
  state: TreeState,
  keys: $ReadOnlySet<NodeKey> | $ReadOnlyArray<NodeKey>,
): $ReadOnlySet<NodeKey> {
  const visitedNodes = new Set<NodeKey>();
  const visitingNodes = Array.from(keys);
  const graph = store.getGraph(state.version);

  for (let key = visitingNodes.pop(); key; key = visitingNodes.pop()) {
    visitedNodes.add(key);
    const subscribedNodes = graph.nodeToNodeSubscriptions.get(key) ?? emptySet;
    for (const downstreamNode of subscribedNodes) {
      if (!visitedNodes.has(downstreamNode)) {
        visitingNodes.push(downstreamNode);
      }
    }
  }
  return visitedNodes;
}

module.exports = {
  getNodeLoadable,
  peekNodeLoadable,
  setNodeValue,
  initializeNode,
  cleanUpNode,
  setUnvalidatedAtomValue_DEPRECATED,
  peekNodeInfo,
  getDownstreamNodes,
};
