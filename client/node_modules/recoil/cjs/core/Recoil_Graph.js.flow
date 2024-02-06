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

import type {Graph} from './Recoil_GraphTypes';
import type {NodeKey, StateID} from './Recoil_Keys';
import type {Store} from './Recoil_State';

const differenceSets = require('recoil-shared/util/Recoil_differenceSets');
const mapMap = require('recoil-shared/util/Recoil_mapMap');
const nullthrows = require('recoil-shared/util/Recoil_nullthrows');
const recoverableViolation = require('recoil-shared/util/Recoil_recoverableViolation');

function makeGraph(): Graph {
  return {
    nodeDeps: new Map(),
    nodeToNodeSubscriptions: new Map(),
  };
}

function cloneGraph(graph: Graph): Graph {
  return {
    nodeDeps: mapMap(graph.nodeDeps, s => new Set(s)),
    nodeToNodeSubscriptions: mapMap(
      graph.nodeToNodeSubscriptions,
      s => new Set(s),
    ),
  };
}

// Note that this overwrites the deps of existing nodes, rather than unioning
// the new deps with the old deps.
function mergeDepsIntoGraph(
  key: NodeKey,
  newDeps: $ReadOnlySet<NodeKey>,
  graph: Graph,
  // If olderGraph is given then we will not overwrite changes made to the given
  // graph compared with olderGraph:
  olderGraph?: Graph,
): void {
  const {nodeDeps, nodeToNodeSubscriptions} = graph;
  const oldDeps = nodeDeps.get(key);

  if (oldDeps && olderGraph && oldDeps !== olderGraph.nodeDeps.get(key)) {
    return;
  }

  // Update nodeDeps:
  nodeDeps.set(key, newDeps);

  // Add new deps to nodeToNodeSubscriptions:
  const addedDeps =
    oldDeps == null ? newDeps : differenceSets(newDeps, oldDeps);
  for (const dep of addedDeps) {
    if (!nodeToNodeSubscriptions.has(dep)) {
      nodeToNodeSubscriptions.set(dep, new Set());
    }
    const existing = nullthrows(nodeToNodeSubscriptions.get(dep));
    existing.add(key);
  }

  // Remove removed deps from nodeToNodeSubscriptions:
  if (oldDeps) {
    const removedDeps = differenceSets(oldDeps, newDeps);
    for (const dep of removedDeps) {
      if (!nodeToNodeSubscriptions.has(dep)) {
        return;
      }
      const existing = nullthrows(nodeToNodeSubscriptions.get(dep));
      existing.delete(key);
      if (existing.size === 0) {
        nodeToNodeSubscriptions.delete(dep);
      }
    }
  }
}

function saveDepsToStore(
  key: NodeKey,
  deps: $ReadOnlySet<NodeKey>,
  store: Store,
  version: StateID,
): void {
  const storeState = store.getState();
  if (
    !(
      version === storeState.currentTree.version ||
      version === storeState.nextTree?.version ||
      version === storeState.previousTree?.version
    )
  ) {
    recoverableViolation(
      'Tried to save dependencies to a discarded tree',
      'recoil',
    );
  }

  // Merge the dependencies discovered into the store's dependency map
  // for the version that was read:
  const graph = store.getGraph(version);
  mergeDepsIntoGraph(key, deps, graph);

  // If this version is not the latest version, also write these dependencies
  // into later versions if they don't already have their own:
  if (version === storeState.previousTree?.version) {
    const currentGraph = store.getGraph(storeState.currentTree.version);
    mergeDepsIntoGraph(key, deps, currentGraph, graph);
  }
  if (
    version === storeState.previousTree?.version ||
    version === storeState.currentTree.version
  ) {
    const nextVersion = storeState.nextTree?.version;
    if (nextVersion !== undefined) {
      const nextGraph = store.getGraph(nextVersion);
      mergeDepsIntoGraph(key, deps, nextGraph, graph);
    }
  }
}

module.exports = {
  cloneGraph,
  graph: makeGraph,
  saveDepsToStore,
};
