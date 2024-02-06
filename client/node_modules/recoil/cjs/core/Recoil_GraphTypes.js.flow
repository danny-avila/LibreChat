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

import type {NodeKey} from './Recoil_Keys';

export type Graph = $ReadOnly<{
  // TODO rename these properties to be more descriptive and symetric.
  // Upstream Node dependencies
  // NOTE: if you ever make the sets in nodeDeps mutable you must change the
  // logic in mergeDepsIntoGraph() that relies on reference equality
  // of these sets in avoiding overwriting newer deps with older ones.
  nodeDeps: Map<NodeKey, $ReadOnlySet<NodeKey>>,
  // Downstream Node subscriptions
  nodeToNodeSubscriptions: Map<NodeKey, Set<NodeKey>>,
}>;

module.exports = ({}: {...});
