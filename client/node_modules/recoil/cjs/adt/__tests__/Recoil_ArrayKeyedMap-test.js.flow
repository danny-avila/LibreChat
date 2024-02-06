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

const {ArrayKeyedMap} = require('../Recoil_ArrayKeyedMap');

test('basic operation', () => {
  const m = new ArrayKeyedMap<number>();
  m.set([], 0);
  m.set(['a'], 1);
  m.set(['a', 'b'], 2);
  expect(m.get([])).toBe(0);
  expect(m.get(['a'])).toBe(1);
  expect(m.get(['a', 'b'])).toBe(2);
});

test('enumeration of properties', () => {
  const m = new ArrayKeyedMap<number>();
  m.set([], 0);
  m.set(['a'], 1);
  m.set(['a', 'b'], 2);
  const entries = Array.from(m.entries());
  expect(entries[0][0]).toEqual([]);
  expect(entries[0][1]).toBe(0);
  expect(entries[1][0]).toEqual(['a']);
  expect(entries[1][1]).toBe(1);
  expect(entries[2][0]).toEqual(['a', 'b']);
  expect(entries[2][1]).toBe(2);
});

test('copying', () => {
  const m = new ArrayKeyedMap<number | $FlowFixMe>();
  m.set([], 0);
  m.set(['a'], 1);
  m.set(['a', 'b'], 2);
  const mm = new ArrayKeyedMap(m);
  expect(mm.get([])).toBe(0);
  expect(mm.get(['a'])).toBe(1);
  expect(mm.get(['a', 'b'])).toBe(2);
  expect(Array.from(m.entries())).toEqual(Array.from(mm.entries()));
});
