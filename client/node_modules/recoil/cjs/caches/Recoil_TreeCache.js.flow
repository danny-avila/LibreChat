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

import type {
  GetHandlers,
  NodeCacheRoute,
  NodeValueGet,
  SetHandlers,
  TreeCacheBranch,
  TreeCacheLeaf,
  TreeCacheNode,
} from './Recoil_TreeCacheImplementationType';

const {isFastRefreshEnabled} = require('../core/Recoil_ReactMode');
const recoverableViolation = require('recoil-shared/util/Recoil_recoverableViolation');

export type Options<T> = {
  name?: string,
  mapNodeValue?: (value: mixed) => mixed,
  onHit?: (node: TreeCacheLeaf<T>) => void,
  onSet?: (node: TreeCacheLeaf<T>) => void,
};

class ChangedPathError extends Error {}

class TreeCache<T = mixed> {
  _name: ?string;
  _numLeafs: number;
  // $FlowIssue[unclear-type]
  _root: TreeCacheNode<any> | null;

  _onHit: $NonMaybeType<Options<T>['onHit']>;
  _onSet: $NonMaybeType<Options<T>['onSet']>;
  _mapNodeValue: $NonMaybeType<Options<T>['mapNodeValue']>;

  constructor(options?: Options<T>) {
    this._name = options?.name;
    this._numLeafs = 0;
    this._root = null;
    this._onHit = options?.onHit ?? (() => {});
    this._onSet = options?.onSet ?? (() => {});
    this._mapNodeValue = options?.mapNodeValue ?? (val => val);
  }

  size(): number {
    return this._numLeafs;
  }

  // $FlowIssue[unclear-type]
  root(): TreeCacheNode<any> | null {
    return this._root;
  }

  get(getNodeValue: NodeValueGet, handlers?: GetHandlers<T>): ?T {
    return this.getLeafNode(getNodeValue, handlers)?.value;
  }

  getLeafNode(
    getNodeValue: NodeValueGet,
    handlers?: GetHandlers<T>,
  ): ?TreeCacheLeaf<T> {
    if (this._root == null) {
      return undefined;
    }

    // Iterate down the tree based on the current node values until we hit a leaf
    // $FlowIssue[unclear-type]
    let node: ?TreeCacheNode<any> = this._root;
    while (node) {
      handlers?.onNodeVisit(node);
      if (node.type === 'leaf') {
        this._onHit(node);
        return node;
      }
      const nodeValue = this._mapNodeValue(getNodeValue(node.nodeKey));
      node = node.branches.get(nodeValue);
    }
    return undefined;
  }

  set(route: NodeCacheRoute, value: T, handlers?: SetHandlers<T>): void {
    const addLeaf = () => {
      // First, setup the branch nodes for the route:

      // Iterate down the tree to find or add branch nodes following the route
      let node: ?TreeCacheBranch<T>;
      let branchKey;
      for (const [nodeKey, nodeValue] of route) {
        // If the previous root was a leaf, while we not have a get(), it means
        // the selector has inconsistent values or implementation changed.
        const root = this._root;
        if (root?.type === 'leaf') {
          throw this.invalidCacheError();
        }

        // node now refers to the next node down in the tree
        const parent = node;
        // $FlowFixMe[prop-missing]
        // $FlowFixMe[incompatible-type]
        node = parent ? parent.branches.get(branchKey) : root;
        // $FlowFixMe[prop-missing]
        // $FlowFixMe[incompatible-type]
        node = node ?? {
          type: 'branch',
          nodeKey,
          parent,
          branches: new Map(),
          branchKey,
        };

        // If we found an existing node, confirm it has a consistent value
        if (node.type !== 'branch' || node.nodeKey !== nodeKey) {
          throw this.invalidCacheError();
        }

        // Add the branch node to the tree
        parent?.branches.set(branchKey, node);
        handlers?.onNodeVisit?.(node);

        // Prepare for next iteration and install root if it is new.
        branchKey = this._mapNodeValue(nodeValue);
        this._root = this._root ?? node;
      }

      // Second, setup the leaf node:

      // If there is an existing leaf for this route confirm it is consistent
      const oldLeaf: ?TreeCacheNode<T> = node
        ? node?.branches.get(branchKey)
        : this._root;
      if (
        oldLeaf != null &&
        (oldLeaf.type !== 'leaf' || oldLeaf.branchKey !== branchKey)
      ) {
        throw this.invalidCacheError();
      }

      // Create a new or replacement leaf.
      const leafNode = {
        type: 'leaf',
        value,
        parent: node,
        branchKey,
      };

      // Install the leaf and call handlers
      node?.branches.set(branchKey, leafNode);
      this._root = this._root ?? leafNode;
      this._numLeafs++;
      this._onSet(leafNode);
      handlers?.onNodeVisit?.(leafNode);
    };

    try {
      addLeaf();
    } catch (error) {
      // If the cache was stale or observed inconsistent values, such as with
      // Fast Refresh, then clear it and rebuild with the new values.
      if (error instanceof ChangedPathError) {
        this.clear();
        addLeaf();
      } else {
        throw error;
      }
    }
  }

  // Returns true if leaf was actually deleted from the tree
  delete(leaf: TreeCacheLeaf<T>): boolean {
    const root = this.root();
    if (!root) {
      return false;
    }

    if (leaf === root) {
      this._root = null;
      this._numLeafs = 0;
      return true;
    }

    // Iterate up from the leaf deleteing it from it's parent's branches.
    let node = leaf.parent;
    let branchKey = leaf.branchKey;
    while (node) {
      node.branches.delete(branchKey);
      // Stop iterating if we hit the root.
      if (node === root) {
        if (node.branches.size === 0) {
          this._root = null;
          this._numLeafs = 0;
        } else {
          this._numLeafs--;
        }
        return true;
      }

      // Stop iterating if there are other branches since we don't need to
      // remove any more nodes.
      if (node.branches.size > 0) {
        break;
      }

      // Iterate up to our parent
      branchKey = node?.branchKey;
      node = node.parent;
    }

    // Confirm that the leaf we are deleting is actually attached to our tree
    for (; node !== root; node = node.parent) {
      if (node == null) {
        return false;
      }
    }

    this._numLeafs--;
    return true;
  }

  clear(): void {
    this._numLeafs = 0;
    this._root = null;
  }

  invalidCacheError(): ChangedPathError {
    const CHANGED_PATH_ERROR_MESSAGE = isFastRefreshEnabled()
      ? 'Possible Fast Refresh module reload detected.  ' +
        'This may also be caused by an selector returning inconsistent values. ' +
        'Resetting cache.'
      : 'Invalid cache values.  This happens when selectors do not return ' +
        'consistent values for the same input dependency values.  That may also ' +
        'be caused when using Fast Refresh to change a selector implementation.  ' +
        'Resetting cache.';
    recoverableViolation(
      CHANGED_PATH_ERROR_MESSAGE +
        (this._name != null ? ` - ${this._name}` : ''),
      'recoil',
    );
    throw new ChangedPathError();
  }
}

module.exports = {TreeCache};
