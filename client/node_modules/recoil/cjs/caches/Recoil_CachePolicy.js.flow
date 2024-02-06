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

export type EqualityPolicy = 'reference' | 'value';
export type EvictionPolicy = 'lru' | 'keep-all' | 'most-recent';

export type CachePolicy =
  | {eviction: 'lru', maxSize: number, equality?: EqualityPolicy}
  | {eviction: 'keep-all', equality?: EqualityPolicy}
  | {eviction: 'most-recent', equality?: EqualityPolicy}
  | {equality: EqualityPolicy};

export type CachePolicyWithoutEviction = {equality: EqualityPolicy};
