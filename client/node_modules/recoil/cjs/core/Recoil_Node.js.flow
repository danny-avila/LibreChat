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
import type {RecoilValue} from './Recoil_RecoilValue';
import type {RetainedBy} from './Recoil_RetainedBy';
import type {AtomWrites, NodeKey, Store, TreeState} from './Recoil_State';

const {isFastRefreshEnabled} = require('./Recoil_ReactMode');
const RecoilValueClasses = require('./Recoil_RecoilValue');
const expectationViolation = require('recoil-shared/util/Recoil_expectationViolation');
const gkx = require('recoil-shared/util/Recoil_gkx');
const mapIterable = require('recoil-shared/util/Recoil_mapIterable');
const nullthrows = require('recoil-shared/util/Recoil_nullthrows');
const RecoilEnv = require('recoil-shared/util/Recoil_RecoilEnv');
const recoverableViolation = require('recoil-shared/util/Recoil_recoverableViolation');

class DefaultValue {}
const DEFAULT_VALUE: DefaultValue = new DefaultValue();

export type PersistenceType = 'none' | 'url';
export type PersistenceInfo = $ReadOnly<{
  type: PersistenceType,
  backButton?: boolean,
}>;

export type Trigger = 'get' | 'set';

type NodeType = 'atom' | 'selector';

export type ReadOnlyNodeOptions<T> = $ReadOnly<{
  key: NodeKey,
  nodeType: NodeType,

  // Returns the current value without evaluating or modifying state
  peek: (Store, TreeState) => ?Loadable<T>,

  // Returns the discovered deps and the loadable value of the node
  get: (Store, TreeState) => Loadable<T>,

  // Informs the node the first time it is used (either ever or since the node was
  // last released). Returns a cleanup function for when the store ceases to be or
  // the node is released again.
  init: (Store, TreeState, Trigger) => () => void,

  // Invalidate the cached value stored in the TreeState.
  // It is used at the end of each batch for mutated state.
  // This does not affect any other caches such as the selector cache.
  invalidate: TreeState => void,

  // Clear all internal caches for this node.  Unlike "invalidate()" this clears
  // the selector cache and clears for all possible dependency values.
  clearCache?: (Store, TreeState) => void,

  shouldRestoreFromSnapshots: boolean,

  dangerouslyAllowMutability?: boolean,
  persistence_UNSTABLE?: PersistenceInfo,

  // True for members of families, since another node can be created later for the
  // same parameter value; but false for individual atoms and selectors which have
  // a singleton config passed to us only once when they're defined:
  shouldDeleteConfigOnRelease?: () => boolean,

  retainedBy: RetainedBy,
}>;

export type ReadWriteNodeOptions<T> = $ReadOnly<{
  ...ReadOnlyNodeOptions<T>,

  // Returns the discovered deps and the set of key-value pairs to be written.
  // (Deps may be discovered since selectors get an updater function which has
  //  the ability to read other atoms, which may have deps.)
  set: (
    store: Store,
    state: TreeState,
    newValue: T | DefaultValue,
  ) => AtomWrites,
}>;

type Node<T> = ReadOnlyNodeOptions<T> | ReadWriteNodeOptions<T>;

// flowlint-next-line unclear-type:off
const nodes: Map<string, Node<any>> = new Map();
// flowlint-next-line unclear-type:off
const recoilValues: Map<string, RecoilValue<any>> = new Map();

/* eslint-disable no-redeclare */
declare function registerNode<T>(
  node: ReadWriteNodeOptions<T>,
): RecoilValueClasses.RecoilState<T>;

declare function registerNode<T>(
  node: ReadOnlyNodeOptions<T>,
): RecoilValueClasses.RecoilValueReadOnly<T>;

function recoilValuesForKeys(
  keys: Iterable<NodeKey>,
): Iterable<RecoilValue<mixed>> {
  return mapIterable(keys, key => nullthrows(recoilValues.get(key)));
}

function checkForDuplicateAtomKey(key: string): void {
  if (nodes.has(key)) {
    const message = `Duplicate atom key "${key}". This is a FATAL ERROR in
      production. But it is safe to ignore this warning if it occurred because of
      hot module replacement.`;

    if (__DEV__) {
      // TODO Figure this out for open-source
      if (!isFastRefreshEnabled()) {
        expectationViolation(message, 'recoil');
      }
    } else {
      // @fb-only: recoverableViolation(message, 'recoil');
      console.warn(message); // @oss-only
    }
  }
}

function registerNode<T>(node: Node<T>): RecoilValue<T> {
  if (RecoilEnv.RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED) {
    checkForDuplicateAtomKey(node.key);
  }
  nodes.set(node.key, node);

  const recoilValue: RecoilValue<T> =
    node.set == null
      ? new RecoilValueClasses.RecoilValueReadOnly(node.key)
      : new RecoilValueClasses.RecoilState(node.key);

  recoilValues.set(node.key, recoilValue);
  return recoilValue;
}
/* eslint-enable no-redeclare */

class NodeMissingError extends Error {}

// flowlint-next-line unclear-type:off
function getNode(key: NodeKey): Node<any> {
  const node = nodes.get(key);
  if (node == null) {
    throw new NodeMissingError(`Missing definition for RecoilValue: "${key}""`);
  }
  return node;
}

// flowlint-next-line unclear-type:off
function getNodeMaybe(key: NodeKey): void | Node<any> {
  return nodes.get(key);
}

const configDeletionHandlers = new Map<NodeKey, () => void>();

function deleteNodeConfigIfPossible(key: NodeKey): void {
  if (!gkx('recoil_memory_managament_2020')) {
    return;
  }
  const node = nodes.get(key);
  if (node?.shouldDeleteConfigOnRelease?.()) {
    nodes.delete(key);
    getConfigDeletionHandler(key)?.();
    configDeletionHandlers.delete(key);
  }
}

function setConfigDeletionHandler(key: NodeKey, fn: void | (() => void)): void {
  if (!gkx('recoil_memory_managament_2020')) {
    return;
  }
  if (fn === undefined) {
    configDeletionHandlers.delete(key);
  } else {
    configDeletionHandlers.set(key, fn);
  }
}

function getConfigDeletionHandler(key: NodeKey): void | (() => void) {
  return configDeletionHandlers.get(key);
}

module.exports = {
  nodes,
  recoilValues,
  registerNode,
  getNode,
  getNodeMaybe,
  deleteNodeConfigIfPossible,
  setConfigDeletionHandler,
  getConfigDeletionHandler,
  recoilValuesForKeys,
  NodeMissingError,
  DefaultValue,
  DEFAULT_VALUE,
};
