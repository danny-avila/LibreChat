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
import type {RecoilState} from 'Recoil_RecoilValue';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let atom,
  DefaultValue,
  selectorFamily,
  getRecoilValueAsLoadable,
  setRecoilValue,
  store,
  myAtom;

const testRecoil = getRecoilTestFn(() => {
  const {
    makeStore,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

  atom = require('../Recoil_atom');
  ({DefaultValue} = require('../../core/Recoil_Node'));
  selectorFamily = require('../Recoil_selectorFamily');
  ({
    getRecoilValueAsLoadable,
    setRecoilValue,
  } = require('../../core/Recoil_RecoilValueInterface'));

  store = makeStore();

  myAtom = atom({
    key: 'atom',
    default: 0,
  });
});

function getValue<T>(recoilValue: RecoilValue<T>): T {
  return getRecoilValueAsLoadable<T>(store, recoilValue).valueOrThrow();
}

function set(recoilValue: RecoilState<number>, value: number) {
  setRecoilValue(store, recoilValue, value);
}

testRecoil('selectorFamily - number parameter', () => {
  const mySelector = selectorFamily({
    key: 'selectorFamily/number',
    get:
      (
        // $FlowFixMe[missing-local-annot]
        multiplier,
      ) =>
      // $FlowFixMe[missing-local-annot]
      ({get}) =>
        get(myAtom) * multiplier,
  });

  set(myAtom, 1);
  expect(getValue(mySelector(10))).toBe(10);
  expect(getValue(mySelector(100))).toBe(100);
  set(myAtom, 2);
  expect(getValue(mySelector(10))).toBe(20);
  expect(getValue(mySelector(100))).toBe(200);
});

testRecoil('selectorFamily - array parameter', () => {
  const mySelector = selectorFamily({
    key: 'selectorFamily/array',
    // $FlowFixMe[missing-local-annot]
    get: numbers => () => numbers.reduce((x, y) => x + y, 0),
  });

  expect(getValue(mySelector([]))).toBe(0);
  expect(getValue(mySelector([1, 2, 3]))).toBe(6);
  expect(getValue(mySelector([0, 1, 1, 2, 3, 5]))).toBe(12);
});

testRecoil('selectorFamily - object parameter', () => {
  const mySelector = selectorFamily({
    key: 'selectorFamily/object',
    get:
      (
        // $FlowFixMe[missing-local-annot]
        {multiplier},
      ) =>
      // $FlowFixMe[missing-local-annot]
      ({get}) =>
        get(myAtom) * multiplier,
  });

  set(myAtom, 1);
  expect(getValue(mySelector({multiplier: 10}))).toBe(10);
  expect(getValue(mySelector({multiplier: 100}))).toBe(100);
  set(myAtom, 2);
  expect(getValue(mySelector({multiplier: 10}))).toBe(20);
  expect(getValue(mySelector({multiplier: 100}))).toBe(200);
});

testRecoil('selectorFamily - date parameter', () => {
  const mySelector = selectorFamily({
    key: 'selectorFamily/date',
    get:
      (
        // $FlowFixMe[missing-local-annot]
        date,
      ) =>
      // $FlowFixMe[missing-local-annot]
      ({get}) => {
        const daysToAdd = get(myAtom);
        const returnDate = new Date(date);

        returnDate.setDate(returnDate.getDate() + daysToAdd);

        return returnDate;
      },
  });

  set(myAtom, 1);
  expect(getValue(mySelector(new Date(2021, 2, 25))).getDate()).toBe(26);
  set(myAtom, 2);
  expect(getValue(mySelector(new Date(2021, 2, 25))).getDate()).toBe(27);
});

testRecoil('Works with supersets', () => {
  const mySelector = selectorFamily({
    key: 'selectorFamily/supersets',
    get:
      (
        // $FlowFixMe[missing-local-annot]
        {multiplier},
      ) =>
      // $FlowFixMe[missing-local-annot]
      ({get}) =>
        get(myAtom) * multiplier,
  });
  set(myAtom, 1);
  expect(getValue(mySelector({multiplier: 10}))).toBe(10);
  expect(getValue(mySelector({multiplier: 100}))).toBe(100);
  expect(getValue(mySelector({multiplier: 100, extra: 'foo'}))).toBe(100);
});

testRecoil('selectorFamily - writable', () => {
  const mySelector = selectorFamily({
    key: 'selectorFamily/writable',
    get:
      (
        // $FlowFixMe[missing-local-annot]
        {multiplier},
      ) =>
      // $FlowFixMe[missing-local-annot]
      ({get}) =>
        get(myAtom) * multiplier,
    set:
      (
        // $FlowFixMe[missing-local-annot]
        {multiplier},
      ) =>
      // $FlowFixMe[missing-local-annot]
      ({set}, num) =>
        set(myAtom, num instanceof DefaultValue ? num : num / multiplier),
  });

  set(myAtom, 1);
  expect(getValue(mySelector({multiplier: 10}))).toBe(10);
  set(mySelector({multiplier: 10}), 20);
  expect(getValue(myAtom)).toBe(2);
  set(mySelector({multiplier: 10}), 30);
  expect(getValue(myAtom)).toBe(3);
  set(mySelector({multiplier: 100}), 400);
  expect(getValue(myAtom)).toBe(4);
});

testRecoil('selectorFamily - value caching', () => {
  let evals = 0;
  const mySelector = selectorFamily({
    key: 'selectorFamily/value caching',
    get:
      (
        // $FlowFixMe[missing-local-annot]
        {multiplier},
      ) =>
      // $FlowFixMe[missing-local-annot]
      ({get}) => {
        evals++;
        return get(myAtom) * multiplier;
      },
  });

  expect(evals).toBe(0);

  set(myAtom, 1);
  expect(getValue(mySelector({multiplier: 10}))).toBe(10);
  expect(evals).toBe(1);
  expect(getValue(mySelector({multiplier: 10}))).toBe(10);
  expect(evals).toBe(1);
  expect(getValue(mySelector({multiplier: 100}))).toBe(100);
  expect(evals).toBe(2);
  expect(getValue(mySelector({multiplier: 100}))).toBe(100);
  expect(evals).toBe(2);
  expect(getValue(mySelector({multiplier: 10}))).toBe(10);
  expect(evals).toBe(2);

  set(myAtom, 2);
  expect(getValue(mySelector({multiplier: 10}))).toBe(20);
  expect(evals).toBe(3);
  expect(getValue(mySelector({multiplier: 10}))).toBe(20);
  expect(evals).toBe(3);
  expect(getValue(mySelector({multiplier: 100}))).toBe(200);
  expect(evals).toBe(4);
  expect(getValue(mySelector({multiplier: 100}))).toBe(200);
  expect(evals).toBe(4);
});

testRecoil('selectorFamily - reference caching', () => {
  let evals = 0;
  const mySelector = selectorFamily({
    key: 'selectorFamily/reference caching',
    get:
      (
        // $FlowFixMe[missing-local-annot]
        {multiplier},
      ) =>
      // $FlowFixMe[missing-local-annot]
      ({get}) => {
        evals++;
        return get(myAtom) * multiplier;
      },
    cachePolicyForParams_UNSTABLE: {
      equality: 'reference',
    },
  });

  expect(evals).toBe(0);

  set(myAtom, 1);
  expect(getValue(mySelector({multiplier: 10}))).toBe(10);
  expect(evals).toBe(1);
  expect(getValue(mySelector({multiplier: 10}))).toBe(10);
  expect(evals).toBe(2);
  expect(getValue(mySelector({multiplier: 100}))).toBe(100);
  expect(evals).toBe(3);
  expect(getValue(mySelector({multiplier: 100}))).toBe(100);
  expect(evals).toBe(4);
  expect(getValue(mySelector({multiplier: 10}))).toBe(10);
  expect(evals).toBe(5);

  set(myAtom, 2);
  expect(getValue(mySelector({multiplier: 10}))).toBe(20);
  expect(evals).toBe(6);
  expect(getValue(mySelector({multiplier: 10}))).toBe(20);
  expect(evals).toBe(7);
  expect(getValue(mySelector({multiplier: 100}))).toBe(200);
  expect(evals).toBe(8);
  expect(getValue(mySelector({multiplier: 100}))).toBe(200);
  expect(evals).toBe(9);

  const multiply10 = {multiplier: 10};
  const multiply100 = {multiplier: 100};

  set(myAtom, 1);
  expect(getValue(mySelector(multiply10))).toBe(10);
  expect(evals).toBe(10);
  expect(getValue(mySelector(multiply10))).toBe(10);
  expect(evals).toBe(10);
  expect(getValue(mySelector(multiply100))).toBe(100);
  expect(evals).toBe(11);
  expect(getValue(mySelector(multiply100))).toBe(100);
  expect(evals).toBe(11);
  expect(getValue(mySelector(multiply10))).toBe(10);
  expect(evals).toBe(11);

  set(myAtom, 2);
  expect(getValue(mySelector(multiply10))).toBe(20);
  expect(evals).toBe(12);
  expect(getValue(mySelector(multiply10))).toBe(20);
  expect(evals).toBe(12);
  expect(getValue(mySelector(multiply100))).toBe(200);
  expect(evals).toBe(13);
  expect(getValue(mySelector(multiply100))).toBe(200);
  expect(evals).toBe(13);
});

// Parameterized selector results should be frozen unless
// dangerouslyAllowMutability is set
testRecoil('selectorFamily - mutability', () => {
  const myImmutableSelector = selectorFamily({
    key: 'selectorFamily/immutable',
    get:
      (
        // $FlowFixMe[missing-local-annot]
        {key},
      ) =>
      // $FlowFixMe[missing-local-annot]
      ({get}) => ({[key]: get(myAtom)}),
  });
  set(myAtom, 42);
  const immutableResult: {[string]: number, ...} = getValue(
    myImmutableSelector({key: 'foo'}),
  );
  expect(immutableResult).toEqual({foo: 42});
  expect(() => {
    immutableResult.foo = 2600;
  }).toThrow();

  const myMutableSelector = selectorFamily({
    key: 'selectorFamily/mutable',
    get:
      (
        // $FlowFixMe[missing-local-annot]
        {key},
      ) =>
      // $FlowFixMe[missing-local-annot]
      ({get}) => ({[key]: get(myAtom)}),
    dangerouslyAllowMutability: true,
  });
  set(myAtom, 42);
  const mutableResult: {[string]: number, ...} = getValue(
    myMutableSelector({key: 'foo'}),
  );
  expect(mutableResult).toEqual({foo: 42});
  mutableResult.foo = 2600;
  expect(mutableResult).toEqual({foo: 2600});
});

testRecoil('selectorFamily - evaluate to RecoilValue', () => {
  const atomA = atom({key: 'selectorFamily/const atom A', default: 'A'});
  const atomB = atom({key: 'selectorFamily/const atom B', default: 'B'});
  const mySelector = selectorFamily<string, string>({
    key: 'selectorFamily/',
    get: param => () => param === 'a' ? atomA : atomB,
  });

  expect(getValue(mySelector('a'))).toEqual('A');
  expect(getValue(mySelector('b'))).toEqual('B');
});

testRecoil('selectorFamily - invalid parameter error message', () => {
  const mySelector = selectorFamily<_, {foo: () => void}>({
    key: 'function in parameter',
    get: () => () => {},
  });
  expect(() => getValue(mySelector({foo: () => {}}))).toThrow(
    'function in parameter',
  );
});
