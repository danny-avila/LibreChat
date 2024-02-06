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

import type {NodeKey} from '../core/Recoil_Keys';

export type NodeCacheRoute = Array<[NodeKey, mixed]>;

export type TreeCacheNode<T> = TreeCacheLeaf<T> | TreeCacheBranch<T>;

export type TreeCacheLeaf<T> = {
  type: 'leaf',
  value: T,
  branchKey?: mixed,
  parent: ?TreeCacheBranch<T>,
};

export type TreeCacheBranch<T> = {
  type: 'branch',
  nodeKey: NodeKey,
  branches: Map<mixed, TreeCacheNode<T>>,
  branchKey?: mixed,
  parent: ?TreeCacheBranch<T>,
};

export type NodeValueGet = (nodeKey: NodeKey) => mixed;

type NodeVisitHandler<T> = (node: TreeCacheNode<T>) => void;

export type GetHandlers<T> = {
  onNodeVisit: NodeVisitHandler<T>,
};

export type SetHandlers<T> = {
  onNodeVisit: NodeVisitHandler<T>,
};

/**
 * This is an opinionated tree cache that conforms to the requirements needed
 * by Recoil selectors.
 *
 * Unlike a conventional cache, the tree cache does not store key-value pairs,
 * but "routes" that point to values. In the context of selectors these routes
 * represent dependencies that a selector has to other atoms and selectors.
 *
 * In order to retrieve a value from the cache, a function is passed to the
 * cache's `get()` method, and the tree cache will use that function to traverse
 * itself, passing the provided function a "key" (the first part of the route tuple),
 * reconstructing the route to some value (or undefined).
 *
 * The handlers are necessary for the selector to be able to capture the
 * incremental nodes in the tree that are traversed while looking for a cache
 * hit as these incremental nodes represent dependencies to the selector, which
 * are used internally by the selector.
 */
export interface TreeCacheImplementation<T> {
  get(NodeValueGet, handlers?: GetHandlers<T>): ?T;
  set(NodeCacheRoute, T, handlers?: SetHandlers<T>): void;
  delete(TreeCacheLeaf<T>): boolean;
  clear(): void;
  root(): ?TreeCacheNode<T>;
  size(): number;
}
