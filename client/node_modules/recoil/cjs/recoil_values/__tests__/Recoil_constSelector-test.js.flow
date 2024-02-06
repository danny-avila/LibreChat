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

import type {RecoilValue} from '../../core/Recoil_RecoilValue';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let getRecoilValueAsLoadable, store, constSelector;

const testRecoil = getRecoilTestFn(() => {
  const {
    makeStore,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

  ({
    getRecoilValueAsLoadable,
  } = require('../../core/Recoil_RecoilValueInterface'));
  constSelector = require('../Recoil_constSelector');

  store = makeStore();
});

function get<T>(recoilValue: RecoilValue<T>): T {
  return getRecoilValueAsLoadable<T>(store, recoilValue).valueOrThrow();
}

testRecoil('constSelector - string', () => {
  const mySelector = constSelector('HELLO');
  expect(get(mySelector)).toEqual('HELLO');
  expect(get(mySelector)).toBe('HELLO');
});

testRecoil('constSelector - number', () => {
  const mySelector = constSelector(42);
  expect(get(mySelector)).toEqual(42);
  expect(get(mySelector)).toBe(42);
});

testRecoil('constSelector - null', () => {
  const mySelector = constSelector(null);
  expect(get(mySelector)).toEqual(null);
  expect(get(mySelector)).toBe(null);
});

testRecoil('constSelector - boolean', () => {
  const mySelector = constSelector(true);
  expect(get(mySelector)).toEqual(true);
  expect(get(mySelector)).toBe(true);
});
testRecoil('constSelector - array', () => {
  const emptyArraySelector = constSelector(([]: Array<$FlowFixMe>));
  expect(get(emptyArraySelector)).toEqual([]);

  const numberArray = [1, 2, 3];
  const numberArraySelector = constSelector(numberArray);
  expect(get(numberArraySelector)).toEqual([1, 2, 3]);
  expect(get(numberArraySelector)).toBe(numberArray);
});

testRecoil('constSelector - object', () => {
  const emptyObjSelector = constSelector({});
  expect(get(emptyObjSelector)).toEqual({});

  const obj = {foo: 'bar'};
  const objSelector = constSelector(obj);
  expect(get(objSelector)).toEqual({foo: 'bar'});
  expect(get(objSelector)).toBe(obj);

  // Calling a second time with same object provides the same selector
  const objSelector2 = constSelector(obj);
  expect(objSelector2).toBe(objSelector);
  expect(get(objSelector2)).toEqual({foo: 'bar'});
  expect(get(objSelector2)).toBe(obj);

  // Calling a third time with similar but different object provides
  // a new selector for the new reference.
  const newObj = {foo: 'bar'};
  const objSelector3 = constSelector(newObj);
  expect(get(objSelector3)).toEqual({foo: 'bar'});
  expect(get(objSelector3)).toBe(newObj);
});

testRecoil('constSelector - function', () => {
  const foo = () => 'FOO';
  const bar = () => 'BAR';

  const fooSelector = constSelector(foo);
  const barSelector = constSelector(bar);

  expect(get(fooSelector)()).toEqual('FOO');
  expect(get(barSelector)()).toEqual('BAR');

  expect(constSelector(foo)).toEqual(fooSelector);
});
