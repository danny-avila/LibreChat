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

import type {RetentionZone} from './Recoil_RetentionZone';

// This is a separate module to prevent an import cycle.
// Options for how an atom can be retained:
export type RetainedBy =
  | 'components' // only retained directly by components
  | 'recoilRoot' // lives for the lifetime of the root
  | RetentionZone // retained whenever this zone or these zones are retained
  | Array<RetentionZone>;

module.exports = undefined;
