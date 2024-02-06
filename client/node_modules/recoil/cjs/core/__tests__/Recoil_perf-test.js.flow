/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall obviz
 */

'use strict';

import type {Loadable, RecoilState, RecoilValue} from '../../Recoil_index';

const {atom, selector, selectorFamily} = require('../../Recoil_index');
const {waitForAll} = require('../../recoil_values/Recoil_WaitFor');
const {
  getRecoilValueAsLoadable,
  setRecoilValue,
} = require('../Recoil_RecoilValueInterface');
const {performance} = require('perf_hooks');
const {makeStore} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

const ITERATIONS = [1]; // Avoid iterating for automated testing
// const ITERATIONS = [100];
// const ITERATIONS = [1000];
// const ITERATIONS = [10, 100, 1000];
// const ITERATIONS = [10, 100, 1000, 10000];
// const ITERATIONS = [10, 100, 1000, 10000, 100000];

function testPerf(
  name: string,
  fn: ({iterations: number, perf: (() => void) => void}) => void,
) {
  test.each(ITERATIONS)(name, iterations => {
    store = makeStore();
    const perf = (cb: () => void) => {
      const BEGIN = performance.now();
      cb();
      const END = performance.now();
      console.log(`${name}(${iterations})`, END - BEGIN);
    };
    fn({iterations, perf});
  });
}

let store = makeStore();

function getNodeLoadable<T>(recoilValue: RecoilValue<T>): Loadable<T> {
  return getRecoilValueAsLoadable(store, recoilValue);
}

function getNodeValue<T>(recoilValue: RecoilValue<T>): T {
  return getNodeLoadable(recoilValue).getValue();
}

function setNode(recoilValue: RecoilState<string>, value: mixed) {
  setRecoilValue(store, recoilValue, value);
  // $FlowFixMe[cannot-write]
  // $FlowFixMe[unsafe-arithmetic]
  store.getState().currentTree.version++;
}

let nextAtomKey = 0;

function createAtoms(num: number): Array<RecoilState<string>> {
  const atoms = Array(num);
  const atomKey = nextAtomKey++;
  for (let i = 0; i < num; i++) {
    atoms[i] = atom({
      key: `PERF-${atomKey}-${i}`,
      default: 'DEFAULT',
    });
  }
  return atoms;
}

const helpersSelector = () =>
  // $FlowFixMe[incompatible-call]
  selector({
    key: `PERF-helpers-${nextAtomKey++}`,
    get: ({getCallback}) => ({
      getSnapshot: getCallback(
        ({snapshot}) =>
          () =>
            snapshot,
      ),
    }),
  });
const getHelpers = () => getNodeValue(helpersSelector());

testPerf('create n atoms', ({iterations}) => {
  createAtoms(iterations);
});

testPerf('get n atoms', ({iterations, perf}) => {
  const atoms = createAtoms(iterations);
  perf(() => {
    for (const node of atoms) {
      getNodeValue(node);
    }
  });
});

testPerf('set n atoms', ({iterations, perf}) => {
  const atoms = createAtoms(iterations);
  perf(() => {
    for (const node of atoms) {
      setNode(node, 'SET');
    }
  });
});

testPerf('get n selectors', ({iterations, perf}) => {
  const atoms = createAtoms(iterations);
  const testFamily = selectorFamily({
    key: 'PERF-getselectors',
    get:
      (id: number) =>
      // $FlowFixMe[missing-local-annot]
      ({get}) =>
        get(atoms[id]) + get(atoms[0]),
  });
  perf(() => {
    for (let i = 0; i < iterations; i++) {
      getNodeValue(testFamily(i));
    }
  });
});

testPerf('clone n snapshots', ({iterations, perf}) => {
  const atoms = createAtoms(iterations);
  const {getSnapshot} = getHelpers();
  perf(() => {
    for (const node of atoms) {
      // Set node to avoid hitting cached snapshots
      setNode(node, 'SET');
      const snapshot = getSnapshot();
      expect(getNodeValue(node)).toBe('SET');
      expect(snapshot.getLoadable(node).contents).toBe('SET');
    }
  });
});

testPerf('get 1 selector with n dependencies', ({iterations, perf}) => {
  const atoms = createAtoms(iterations);
  perf(() => {
    getNodeValue(waitForAll(atoms));
  });
});

testPerf('get 1 selector with n dependencies n times', ({iterations, perf}) => {
  const atoms = createAtoms(iterations);
  perf(() => {
    for (let i = 0; i < iterations; i++) {
      getNodeValue(waitForAll(atoms));
    }
  });
});

testPerf('get n selectors n times', ({iterations, perf}) => {
  const atoms = createAtoms(iterations);
  const testFamily = selectorFamily({
    key: 'PERF-getselectors',
    get:
      (id: number) =>
      // $FlowFixMe[missing-local-annot]
      ({get}) =>
        get(atoms[id]) + get(atoms[0]),
  });
  perf(() => {
    for (let i = 0; i < iterations; i++) {
      for (let j = 0; j < iterations; j++) {
        getNodeValue(testFamily(i));
      }
    }
  });
});

testPerf(
  'get n selectors with n dependencies n times',
  ({iterations, perf}) => {
    const atoms = createAtoms(iterations);
    const testFamily = selectorFamily<_, number>({
      key: 'PERF-getselectors',
      get: () => () => waitForAll(atoms),
    });
    perf(() => {
      for (let i = 0; i < iterations; i++) {
        for (let j = 0; j < iterations; j++) {
          getNodeValue(testFamily(i));
        }
      }
    });
  },
);
