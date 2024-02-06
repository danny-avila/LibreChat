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

import type {NodeKey} from './Recoil_Keys';
import type {RetainedBy} from './Recoil_RetainedBy';
import type {Retainable, Store, StoreState, TreeState} from './Recoil_State';

const {cleanUpNode} = require('./Recoil_FunctionalCore');
const {deleteNodeConfigIfPossible, getNode} = require('./Recoil_Node');
const {RetentionZone} = require('./Recoil_RetentionZone');
const gkx = require('recoil-shared/util/Recoil_gkx');
const nullthrows = require('recoil-shared/util/Recoil_nullthrows');
const recoverableViolation = require('recoil-shared/util/Recoil_recoverableViolation');
const someSet = require('recoil-shared/util/Recoil_someSet');

// Components that aren't mounted after suspending for this long will be assumed
// to be discarded and their resources released.
const SUSPENSE_TIMEOUT_MS = 120000;

const emptySet = new Set<NodeKey>();

function releaseRetainablesNowOnCurrentTree(
  store: Store,
  retainables: Set<Retainable>,
) {
  const storeState = store.getState();
  const treeState = storeState.currentTree;
  if (storeState.nextTree) {
    recoverableViolation(
      'releaseNodesNowOnCurrentTree should only be called at the end of a batch',
      'recoil',
    );
    return; // leak memory rather than erase something that's about to be used.
  }

  const nodes = new Set<NodeKey>();
  for (const r of retainables) {
    if (r instanceof RetentionZone) {
      for (const n of nodesRetainedByZone(storeState, r)) {
        nodes.add(n);
      }
    } else {
      nodes.add(r);
    }
  }

  const releasableNodes = findReleasableNodes(store, nodes);
  for (const node of releasableNodes) {
    releaseNode(store, treeState, node);
  }
}

function findReleasableNodes(
  store: Store,
  searchFromNodes: Set<NodeKey>,
): Set<NodeKey> {
  const storeState = store.getState();
  const treeState = storeState.currentTree;
  const graph = store.getGraph(treeState.version);

  const releasableNodes: Set<NodeKey> = new Set(); // mutated to collect answer
  const nonReleasableNodes: Set<NodeKey> = new Set();
  findReleasableNodesInner(searchFromNodes);
  return releasableNodes;

  function findReleasableNodesInner(searchFromNodes: Set<NodeKey>): void {
    const releasableNodesFoundThisIteration = new Set<NodeKey>();

    const downstreams = getDownstreamNodesInTopologicalOrder(
      store,
      treeState,
      searchFromNodes,
      releasableNodes, // don't descend into these
      nonReleasableNodes, // don't descend into these
    );

    // Find which of the downstream nodes are releasable and which are not:
    for (const node of downstreams) {
      // Not releasable if configured to be retained forever:
      if (getNode(node).retainedBy === 'recoilRoot') {
        nonReleasableNodes.add(node);
        continue;
      }

      // Not releasable if retained directly by a component:
      if ((storeState.retention.referenceCounts.get(node) ?? 0) > 0) {
        nonReleasableNodes.add(node);
        continue;
      }

      // Not releasable if retained by a zone:
      if (
        zonesThatCouldRetainNode(node).some(z =>
          storeState.retention.referenceCounts.get(z),
        )
      ) {
        nonReleasableNodes.add(node);
        continue;
      }

      // Not releasable if it has a non-releasable child (which will already be in
      // nonReleasableNodes because we are going in topological order):
      const nodeChildren = graph.nodeToNodeSubscriptions.get(node);
      if (
        nodeChildren &&
        someSet(nodeChildren, child => nonReleasableNodes.has(child))
      ) {
        nonReleasableNodes.add(node);
        continue;
      }

      releasableNodes.add(node);
      releasableNodesFoundThisIteration.add(node);
    }

    // If we found any releasable nodes, we need to walk UP from those nodes to
    // find whether their parents can now be released as well:
    const parents = new Set<NodeKey>();
    for (const node of releasableNodesFoundThisIteration) {
      for (const parent of graph.nodeDeps.get(node) ?? emptySet) {
        if (!releasableNodes.has(parent)) {
          parents.add(parent);
        }
      }
    }
    if (parents.size) {
      findReleasableNodesInner(parents);
    }
  }
}

// Children before parents
function getDownstreamNodesInTopologicalOrder(
  store: Store,
  treeState: TreeState,
  nodes: Set<NodeKey>, // Mutable set is destroyed in place
  doNotDescendInto1: Set<NodeKey>,
  doNotDescendInto2: Set<NodeKey>,
): Array<NodeKey> {
  const graph = store.getGraph(treeState.version);

  const answer = [];
  const visited = new Set<NodeKey>();
  while (nodes.size > 0) {
    visit(nullthrows(nodes.values().next().value));
  }
  return answer;

  function visit(node: NodeKey): void {
    if (doNotDescendInto1.has(node) || doNotDescendInto2.has(node)) {
      nodes.delete(node);
      return;
    }
    if (visited.has(node)) {
      return;
    }
    const children = graph.nodeToNodeSubscriptions.get(node);
    if (children) {
      for (const child of children) {
        visit(child);
      }
    }
    visited.add(node);
    nodes.delete(node);
    answer.push(node);
  }
}

function releaseNode(store: Store, treeState: TreeState, node: NodeKey) {
  if (!gkx('recoil_memory_managament_2020')) {
    return;
  }

  // Atom effects, in-closure caches, etc.:
  cleanUpNode(store, node);

  // Delete from store state:
  const storeState = store.getState();
  storeState.knownAtoms.delete(node);
  storeState.knownSelectors.delete(node);
  storeState.nodeTransactionSubscriptions.delete(node);
  storeState.retention.referenceCounts.delete(node);
  const zones = zonesThatCouldRetainNode(node);
  for (const zone of zones) {
    storeState.retention.nodesRetainedByZone.get(zone)?.delete(node);
  }
  // Note that we DO NOT delete from nodeToComponentSubscriptions because this
  // already happens when the last component that was retaining the node unmounts,
  // and this could happen either before or after that.

  // Delete from TreeState and dep graph:
  treeState.atomValues.delete(node);
  treeState.dirtyAtoms.delete(node);
  treeState.nonvalidatedAtoms.delete(node);
  const graph = storeState.graphsByVersion.get(treeState.version);
  if (graph) {
    const deps = graph.nodeDeps.get(node);
    if (deps !== undefined) {
      graph.nodeDeps.delete(node);
      for (const dep of deps) {
        graph.nodeToNodeSubscriptions.get(dep)?.delete(node);
      }
    }
    // No need to delete sub's deps as there should be no subs at this point.
    // But an invariant would require deleting nodes in topological order.
    graph.nodeToNodeSubscriptions.delete(node);
  }

  // Node config (for family members only as their configs can be recreated, and
  // only if they are not retained within any other Stores):
  deleteNodeConfigIfPossible(node);
}

function nodesRetainedByZone(
  storeState: StoreState,
  zone: RetentionZone,
): Set<NodeKey> {
  return storeState.retention.nodesRetainedByZone.get(zone) ?? emptySet;
}

function zonesThatCouldRetainNode(node: NodeKey): Array<RetentionZone> {
  const retainedBy = getNode(node).retainedBy;
  if (
    retainedBy === undefined ||
    retainedBy === 'components' ||
    retainedBy === 'recoilRoot'
  ) {
    return [];
  } else if (retainedBy instanceof RetentionZone) {
    return [retainedBy];
  } else {
    return retainedBy; // it's an array of zones
  }
}

function scheduleOrPerformPossibleReleaseOfRetainable(
  store: Store,
  retainable: Retainable,
) {
  const state = store.getState();
  if (state.nextTree) {
    state.retention.retainablesToCheckForRelease.add(retainable);
  } else {
    releaseRetainablesNowOnCurrentTree(store, new Set([retainable]));
  }
}

function updateRetainCount(
  store: Store,
  retainable: Retainable,
  delta: 1 | -1,
): void {
  if (!gkx('recoil_memory_managament_2020')) {
    return;
  }
  const map = store.getState().retention.referenceCounts;
  const newCount = (map.get(retainable) ?? 0) + delta;
  if (newCount === 0) {
    updateRetainCountToZero(store, retainable);
  } else {
    map.set(retainable, newCount);
  }
}

function updateRetainCountToZero(store: Store, retainable: Retainable): void {
  if (!gkx('recoil_memory_managament_2020')) {
    return;
  }
  const map = store.getState().retention.referenceCounts;
  map.delete(retainable);
  scheduleOrPerformPossibleReleaseOfRetainable(store, retainable);
}

function releaseScheduledRetainablesNow(store: Store) {
  if (!gkx('recoil_memory_managament_2020')) {
    return;
  }
  const state = store.getState();
  releaseRetainablesNowOnCurrentTree(
    store,
    state.retention.retainablesToCheckForRelease,
  );
  state.retention.retainablesToCheckForRelease.clear();
}

function retainedByOptionWithDefault(r: RetainedBy | void): RetainedBy {
  // The default will change from 'recoilRoot' to 'components' in the future.
  return r === undefined ? 'recoilRoot' : r;
}

module.exports = {
  SUSPENSE_TIMEOUT_MS,
  updateRetainCount,
  updateRetainCountToZero,
  releaseScheduledRetainablesNow,
  retainedByOptionWithDefault,
};
