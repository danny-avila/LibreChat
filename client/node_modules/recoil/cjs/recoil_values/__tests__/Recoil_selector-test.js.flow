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

import type {Loadable} from '../../adt/Recoil_Loadable';
import type {RecoilValue} from '../../core/Recoil_RecoilValue';
import type {RecoilState} from 'Recoil';
import type {RecoilValueReadOnly} from 'Recoil_RecoilValue';
import type {WrappedValue} from 'Recoil_Wrapper';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let store,
  atom,
  noWait,
  act,
  isRecoilValue,
  constSelector,
  errorSelector,
  getRecoilValueAsLoadable,
  setRecoilValue,
  selector,
  asyncSelector,
  resolvingAsyncSelector,
  stringAtom,
  loadingAsyncSelector,
  flushPromisesAndTimers,
  DefaultValue,
  RecoilLoadable,
  isLoadable,
  freshSnapshot;

const testRecoil = getRecoilTestFn(() => {
  const {
    makeStore,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

  ({act} = require('ReactTestUtils'));
  ({isRecoilValue} = require('../../core/Recoil_RecoilValue'));
  atom = require('../Recoil_atom');
  constSelector = require('../Recoil_constSelector');
  errorSelector = require('../Recoil_errorSelector');
  ({
    getRecoilValueAsLoadable,
    setRecoilValue,
  } = require('../../core/Recoil_RecoilValueInterface'));
  selector = require('../Recoil_selector');
  ({freshSnapshot} = require('../../core/Recoil_Snapshot'));
  ({
    asyncSelector,
    resolvingAsyncSelector,
    stringAtom,
    loadingAsyncSelector,
    flushPromisesAndTimers,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  ({noWait} = require('../Recoil_WaitFor'));
  ({RecoilLoadable, isLoadable} = require('../../adt/Recoil_Loadable'));
  ({DefaultValue} = require('../../core/Recoil_Node'));

  store = makeStore();
});

function getLoadable<T>(recoilValue: RecoilValue<T>): Loadable<T> {
  return getRecoilValueAsLoadable(store, recoilValue);
}

function getValue<T>(recoilValue: RecoilValue<T>): T {
  return (getLoadable(recoilValue).contents: any); // flowlint-line unclear-type:off
}

function getPromise<T>(recoilValue: RecoilValue<T>): Promise<T> {
  return getLoadable(recoilValue).promiseOrThrow();
}

/* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
 * LTI update could not be added via codemod */
function getError(recoilValue): Error {
  const error = getLoadable(recoilValue).errorOrThrow();
  if (!(error instanceof Error)) {
    throw new Error('Expected error to be instance of Error');
  }
  return error;
}

function setValue<T>(recoilState: RecoilState<T>, value: T) {
  setRecoilValue(store, recoilState, value);
  // $FlowExpectedError[cannot-write]
  // $FlowFixMe[unsafe-arithmetic]
  store.getState().currentTree.version++;
}

function resetValue<T>(recoilState: RecoilState<T>) {
  setRecoilValue(store, recoilState, new DefaultValue());
  // $FlowExpectedError[cannot-write]
  // $FlowFixMe[unsafe-arithmetic]
  store.getState().currentTree.version++;
}

testRecoil('Required options are provided when creating selectors', () => {
  const devStatus = window.__DEV__;
  window.__DEV__ = true;

  // $FlowExpectedError[incompatible-call]
  expect(() => selector({get: () => {}})).toThrow();
  // $FlowExpectedError[incompatible-call]
  expect(() => selector({get: false})).toThrow();
  // $FlowExpectedError[incompatible-call]
  expect(() => selector({key: 'MISSING GET'})).toThrow();

  window.__DEV__ = devStatus;
});

testRecoil('selector get', () => {
  const staticSel = constSelector('HELLO');

  // $FlowFixMe[incompatible-call]
  const selectorRO = selector({
    key: 'selector/get',
    get: ({get}) => get(staticSel),
  });

  expect(getValue(selectorRO)).toEqual('HELLO');
});

testRecoil('selector set', () => {
  const myAtom = atom({
    key: 'selector/set/atom',
    default: 'DEFAULT',
  });

  // $FlowFixMe[incompatible-call]
  const selectorRW = selector({
    key: 'selector/set',
    get: ({get}) => get(myAtom),
    set: ({set}, newValue) =>
      set(
        myAtom,
        // $FlowFixMe[unsafe-addition]
        newValue instanceof DefaultValue ? newValue : 'SET: ' + newValue,
      ),
  });

  expect(getValue(selectorRW)).toEqual('DEFAULT');
  setValue(myAtom, 'SET ATOM');
  expect(getValue(selectorRW)).toEqual('SET ATOM');
  setValue(selectorRW, 'SET SELECTOR');
  expect(getValue(selectorRW)).toEqual('SET: SET SELECTOR');
  resetValue(selectorRW);
  expect(getValue(selectorRW)).toEqual('DEFAULT');
});

testRecoil('selector reset', () => {
  const myAtom = atom({
    key: 'selector/reset/atom',
    default: 'DEFAULT',
  });

  // $FlowFixMe[incompatible-call]
  const selectorRW = selector({
    key: 'selector/reset',
    get: ({get}) => get(myAtom),
    set: ({reset}) => reset(myAtom),
  });

  expect(getValue(selectorRW)).toEqual('DEFAULT');
  setValue(myAtom, 'SET ATOM');
  expect(getValue(selectorRW)).toEqual('SET ATOM');
  setValue(selectorRW, 'SET SELECTOR');
  expect(getValue(selectorRW)).toEqual('DEFAULT');
});

describe('get return types', () => {
  testRecoil('evaluate to RecoilValue', () => {
    const atomA = atom({key: 'selector/const atom A', default: 'A'});
    const atomB = atom({key: 'selector/const atom B', default: 'B'});
    const inputAtom = atom({key: 'selector/input', default: 'a'});
    // $FlowFixMe[incompatible-call]
    const mySelector = selector<string>({
      key: 'selector/output recoil value',
      get: ({get}) => (get(inputAtom) === 'a' ? atomA : atomB),
    });

    expect(getValue(mySelector)).toEqual('A');
    setValue(inputAtom, 'b');
    expect(getValue(mySelector)).toEqual('B');
  });

  testRecoil('evaluate to ValueLoadable', () => {
    // $FlowFixMe[incompatible-call]
    const mySelector = selector<string>({
      key: 'selector/output loadable value',
      // $FlowFixMe[incompatible-call]
      get: () => RecoilLoadable.of('VALUE'),
    });

    expect(getValue(mySelector)).toEqual('VALUE');
  });

  testRecoil('evaluate to ErrorLoadable', () => {
    // $FlowFixMe[incompatible-call]
    const mySelector = selector<string>({
      key: 'selector/output loadable error',
      get: () => RecoilLoadable.error(new Error('ERROR')),
    });

    expect(getError(mySelector)).toBeInstanceOf(Error);
    expect(getError(mySelector).message).toBe('ERROR');
  });

  testRecoil('evaluate to LoadingLoadable', async () => {
    // $FlowFixMe[incompatible-call]
    const mySelector = selector<string>({
      key: 'selector/output loadable loading',
      // $FlowFixMe[incompatible-call]
      get: () => RecoilLoadable.of(Promise.resolve('ASYNC')),
    });

    await expect(getPromise(mySelector)).resolves.toEqual('ASYNC');
  });

  testRecoil('evaluate to derived Loadable', async () => {
    const myAtom = stringAtom();
    // $FlowFixMe[incompatible-call]
    const mySelector = selector<string>({
      key: 'selector/output loadable derived',
      get: ({get}) =>
        // $FlowFixMe[incompatible-call]
        get(noWait(myAtom)).map(x => Promise.resolve(`DERIVE-${x}`)),
    });

    await expect(getPromise(mySelector)).resolves.toEqual('DERIVE-DEFAULT');
  });

  testRecoil('evaluate to SelectorValue value', () => {
    const mySelector = selector<string>({
      key: 'selector/output SelectorValue value',
      // $FlowFixMe[incompatible-call]
      get: () => selector.value('VALUE'),
    });

    expect(getValue(mySelector)).toEqual('VALUE');
  });

  testRecoil('evaluate to SelectorValue Promise', async () => {
    const mySelector = selector<Promise<string>>({
      key: 'selector/output SelectorValue promise',
      // $FlowFixMe[incompatible-call]
      get: () => selector.value(Promise.resolve('ASYNC')),
    });

    expect(getValue(mySelector)).toBeInstanceOf(Promise);
    await expect(getValue(mySelector)).resolves.toBe('ASYNC');
  });

  testRecoil('evaluate to SelectorValue Loadable', () => {
    const mySelector = selector<Loadable<string>>({
      key: 'selector/output SelectorValue loadable',
      // $FlowFixMe[incompatible-call]
      get: () => selector.value(RecoilLoadable.of('VALUE')),
    });

    expect(isLoadable(getValue(mySelector))).toBe(true);
    expect(getValue(mySelector).getValue()).toBe('VALUE');
  });

  testRecoil('evaluate to SelectorValue ErrorLoadable', () => {
    const mySelector = selector({
      key: 'selector/output SelectorValue loadable error',
      // $FlowFixMe[incompatible-call]
      get: () => selector.value(RecoilLoadable.error('ERROR')),
    });

    expect(isLoadable(getValue(mySelector))).toBe(true);
    expect(getValue(mySelector).errorOrThrow()).toBe('ERROR');
  });

  testRecoil('evaluate to SelectorValue Atom', () => {
    const myAtom = stringAtom();
    const mySelector = selector({
      key: 'selector/output SelectorValue loadable error',
      // $FlowFixMe[incompatible-call]
      get: () => selector.value(myAtom),
    });

    expect(isRecoilValue(getValue(mySelector))).toBe(true);
  });
});

describe('Catching Deps', () => {
  testRecoil('selector - catching exceptions', () => {
    const throwingSel = errorSelector<$FlowFixMe>('MY ERROR');
    expect(getValue(throwingSel)).toBeInstanceOf(Error);

    // $FlowFixMe[incompatible-call]
    const catchingSelector = selector({
      key: 'selector/catching selector',
      get: ({get}) => {
        try {
          return get(throwingSel);
        } catch (e) {
          expect(e instanceof Error).toBe(true);
          expect(e.message).toContain('MY ERROR');
          return 'CAUGHT';
        }
      },
    });
    expect(getValue(catchingSelector)).toEqual('CAUGHT');
  });

  testRecoil('selector - catching exception (non Error)', () => {
    const throwingSel = selector<
      | RecoilValue<string>
      | Promise<string>
      | Loadable<string>
      | WrappedValue<string>
      | string,
    >({
      key: '__error/non Error thrown',
      get: () => {
        // eslint-disable-next-line no-throw-literal
        throw 'MY ERROR';
      },
    });

    // $FlowFixMe[incompatible-call]
    const catchingSelector = selector({
      key: 'selector/catching selector',
      get: ({get}) => {
        try {
          return get(throwingSel);
        } catch (e) {
          expect(e).toBe('MY ERROR');
          return 'CAUGHT';
        }
      },
    });

    expect(getValue(catchingSelector)).toEqual('CAUGHT');
  });

  testRecoil('selector - catching loads', () => {
    const loadingSel = resolvingAsyncSelector('READY');
    expect(getValue(loadingSel) instanceof Promise).toBe(true);

    // $FlowFixMe[incompatible-call]
    const blockedSelector = selector({
      key: 'selector/blocked selector',
      get: ({get}) => get(loadingSel),
    });
    expect(getValue(blockedSelector) instanceof Promise).toBe(true);

    // $FlowFixMe[incompatible-call]
    const bypassSelector = selector({
      key: 'selector/bypassing selector',
      get: ({get}) => {
        try {
          return get(loadingSel);
        } catch (promise) {
          expect(promise instanceof Promise).toBe(true);
          return 'BYPASS';
        }
      },
    });
    expect(getValue(bypassSelector)).toBe('BYPASS');
    act(() => jest.runAllTimers());
    expect(getValue(bypassSelector)).toEqual('READY');
  });
});

describe('Dependencies', () => {
  // Test that Recoil will throw an error with a useful debug message instead of
  // infinite recurssion when there is a circular dependency
  testRecoil('Detect circular dependencies', () => {
    const selectorA: RecoilValueReadOnly<$FlowFixMe> = selector({
      key: 'circular/A',
      get: ({get}) => get(selectorC),
    });
    const selectorB: RecoilValueReadOnly<$FlowFixMe> = selector({
      key: 'circular/B',
      get: ({get}) => get(selectorA),
    });
    const selectorC: RecoilValueReadOnly<$FlowFixMe> = selector({
      key: 'circular/C',
      get: ({get}) => get(selectorB),
    });
    const devStatus = window.__DEV__;
    window.__DEV__ = true;
    expect(getValue(selectorC)).toBeInstanceOf(Error);
    expect(getError(selectorC).message).toEqual(
      expect.stringContaining('circular/A'),
    );
    window.__DEV__ = devStatus;
  });

  testRecoil(
    'distinct loading dependencies are treated as distinct',
    async () => {
      const upstreamAtom = atom({
        key: 'distinct loading dependencies/upstreamAtom',
        default: 0,
      });
      // $FlowFixMe[incompatible-call]
      const upstreamAsyncSelector = selector({
        key: 'distinct loading dependencies/upstreamAsyncSelector',
        get: ({get}) => Promise.resolve(get(upstreamAtom)),
      });
      const directSelector = selector({
        key: 'distinct loading dependencies/directSelector',
        get: ({get}) => get(upstreamAsyncSelector),
      });

      expect(getValue(directSelector) instanceof Promise).toBe(true);

      act(() => jest.runAllTimers());
      expect(getValue(directSelector)).toEqual(0);

      setValue(upstreamAtom, 1);
      expect(getValue(directSelector) instanceof Promise).toBe(true);

      act(() => jest.runAllTimers());
      expect(getValue(directSelector)).toEqual(1);
    },
  );

  testRecoil(
    'selector - kite pattern runs only necessary selectors',
    async () => {
      const aNode = atom({
        key: 'aNode',
        default: true,
      });

      let bNodeRunCount = 0;
      // $FlowFixMe[incompatible-call]
      const bNode = selector({
        key: 'bNode',
        get: ({get}) => {
          bNodeRunCount++;
          const a = get(aNode);
          return String(a);
        },
      });

      let cNodeRunCount = 0;
      // $FlowFixMe[incompatible-call]
      const cNode = selector({
        key: 'cNode',
        get: ({get}) => {
          cNodeRunCount++;
          const a = get(aNode);
          return String(Number(a));
        },
      });

      let dNodeRunCount = 0;
      const dNode = selector({
        key: 'dNode',
        get: ({get}) => {
          dNodeRunCount++;
          const value = get(aNode) ? get(bNode) : get(cNode);
          return value.toUpperCase();
        },
      });

      let dNodeValue = getValue(dNode);
      expect(dNodeValue).toEqual('TRUE');
      expect(bNodeRunCount).toEqual(1);
      expect(cNodeRunCount).toEqual(0);
      expect(dNodeRunCount).toEqual(1);

      setValue(aNode, false);
      dNodeValue = getValue(dNode);
      expect(dNodeValue).toEqual('0');
      expect(bNodeRunCount).toEqual(1);
      expect(cNodeRunCount).toEqual(1);
      expect(dNodeRunCount).toEqual(2);
    },
  );

  testRecoil(
    'selector does not re-run to completion when one of its async deps resolves to a previously cached value',
    async () => {
      const testSnapshot = freshSnapshot();
      testSnapshot.retain();

      const atomA = atom({
        key: 'atomc-rerun-opt-test',
        default: -3,
      });

      // $FlowFixMe[incompatible-call]
      const selectorB = selector({
        key: 'selb-rerun-opt-test',
        get: async ({get}) => {
          await Promise.resolve();

          return Math.abs(get(atomA));
        },
      });

      let numTimesCStartedToRun = 0;
      let numTimesCRanToCompletion = 0;

      const selectorC = selector({
        key: 'sela-rerun-opt-test',
        get: ({get}) => {
          numTimesCStartedToRun++;

          const ret = get(selectorB);

          /**
           * The placement of numTimesCRan is important as this optimization
           * prevents the execution of selectorC _after_ the point where the
           * selector execution hits a known path of dependencies. In other words,
           * the lines prior to the get(selectorB) will run twice, but the lines
           * following get(selectorB) should only run once given that we are
           * setting up this test so that selectorB resolves to a previously seen
           * value the second time that it runs.
           */
          numTimesCRanToCompletion++;

          return ret;
        },
      });

      testSnapshot.getLoadable(selectorC);

      /**
       * Run selector chain so that selectorC is cached with a dep of selectorB
       * set to "3"
       */
      await flushPromisesAndTimers();

      const loadableA = testSnapshot.getLoadable(selectorC);

      expect(loadableA.contents).toBe(3);
      expect(numTimesCRanToCompletion).toBe(1);

      /**
       * It's expected that C started to run twice so far (the first is the first
       * time that the selector was called and suspended, the second was when B
       * resolved and C re-ran because of the async dep resolution)
       */
      expect(numTimesCStartedToRun).toBe(2);

      const mappedSnapshot = testSnapshot.map(({set}) => {
        set(atomA, 3);
      });

      mappedSnapshot.getLoadable(selectorC);

      /**
       * Run selector chain so that selectorB recalculates as a result of atomA
       * being changed to "3"
       */
      mappedSnapshot.retain();
      await flushPromisesAndTimers();

      const loadableB = mappedSnapshot.getLoadable(selectorC);

      expect(loadableB.contents).toBe(3);

      /**
       * If selectors are correctly optimized, selectorC will not re-run because
       * selectorB resolved to "3", which is a value that selectorC has previously
       * cached for its selectorB dependency.
       */
      expect(numTimesCRanToCompletion).toBe(1);

      /**
       * TODO:
       * in the ideal case this should be:
       *
       * expect(numTimesCStartedToRun).toBe(2);
       */
      expect(numTimesCStartedToRun).toBe(3);
    },
  );

  testRecoil(
    'async dep that changes from loading to value triggers re-execution',
    async () => {
      const baseAtom = atom({
        key: 'baseAtom',
        default: 0,
      });

      const asyncSel = selector({
        key: 'asyncSel',
        get: ({get}) => {
          const atomVal = get(baseAtom);

          if (atomVal === 0) {
            return new Promise(() => {});
          }

          return atomVal;
        },
      });

      const selWithAsyncDep = selector({
        key: 'selWithAsyncDep',
        get: ({get}) => {
          return get(asyncSel);
        },
      });

      const snapshot = freshSnapshot();
      snapshot.retain();

      const loadingValLoadable = snapshot.getLoadable(selWithAsyncDep);

      expect(loadingValLoadable.state).toBe('loading');

      const mappedSnapshot = snapshot.map(({set}) => {
        set(baseAtom, 10);
      });

      const newAtomVal = mappedSnapshot.getLoadable(baseAtom);

      expect(newAtomVal.valueMaybe()).toBe(10);

      const valLoadable = mappedSnapshot.getLoadable(selWithAsyncDep);

      expect(valLoadable.valueMaybe()).toBe(10);
    },
  );

  testRecoil('Dynamic deps discovered after await', async () => {
    const testSnapshot = freshSnapshot();
    testSnapshot.retain();

    const myAtom = atom<number>({
      key: 'selector dynamic dep after await atom',
      default: 0,
    });

    let selectorRunCount = 0;
    let selectorRunCompleteCount = 0;
    // $FlowFixMe[incompatible-call]
    const mySelector = selector({
      key: 'selector dynamic dep after await selector',
      get: async ({get}) => {
        await Promise.resolve();
        get(myAtom);
        selectorRunCount++;
        await new Promise(() => {});
        selectorRunCompleteCount++;
      },
    });

    testSnapshot.getLoadable(mySelector);
    expect(testSnapshot.getLoadable(mySelector).state).toBe('loading');
    await flushPromisesAndTimers();
    expect(selectorRunCount).toBe(1);
    expect(selectorRunCompleteCount).toBe(0);

    const mappedSnapshot = testSnapshot.map(({set}) =>
      set(myAtom, prev => prev + 1),
    );
    expect(mappedSnapshot.getLoadable(mySelector).state).toBe('loading');
    await flushPromisesAndTimers();
    expect(selectorRunCount).toBe(2);
    expect(selectorRunCompleteCount).toBe(0);
  });

  testRecoil('Dynamic deps discovered after pending', async () => {
    const pendingSelector = loadingAsyncSelector();
    const testSnapshot = freshSnapshot();
    testSnapshot.retain();

    const myAtom = atom<number>({
      key: 'selector dynamic dep after pending atom',
      default: 0,
    });

    let selectorRunCount = 0;
    let selectorRunCompleteCount = 0;
    // $FlowFixMe[incompatible-call]
    const mySelector = selector({
      key: 'selector dynamic dep after pending selector',
      get: async ({get}) => {
        await Promise.resolve();
        get(myAtom);
        selectorRunCount++;
        get(pendingSelector);
        selectorRunCompleteCount++;
      },
    });

    testSnapshot.getLoadable(mySelector);
    expect(testSnapshot.getLoadable(mySelector).state).toBe('loading');
    await flushPromisesAndTimers();
    expect(selectorRunCount).toBe(1);
    expect(selectorRunCompleteCount).toBe(0);

    const mappedSnapshot = testSnapshot.map(({set}) =>
      set(myAtom, prev => prev + 1),
    );
    expect(mappedSnapshot.getLoadable(mySelector).state).toBe('loading');
    await flushPromisesAndTimers();
    expect(selectorRunCount).toBe(2);
    expect(selectorRunCompleteCount).toBe(0);
  });
});

describe('Async Selector Set', () => {
  testRecoil('async set not supported', () => {
    const myAtom = stringAtom();
    // $FlowFixMe[incompatible-call]
    const mySelector = selector({
      key: 'selector async set',
      get: () => null,
      // $FlowExpectedError[incompatible-call]
      set: async ({set}, x) => set(myAtom, x),
    });

    expect(() => setValue(mySelector, 'ERROR')).toThrow('Async');
  });

  testRecoil('async set call not supported', async () => {
    const myAtom = atom({
      key: 'selector / async not supported / other atom',
      default: 'DEFAULT',
    });

    // $FlowFixMe[incompatible-call]
    const mySelector = selector({
      key: 'selector / async set not supported / async set method',
      get: () => myAtom,
      // Set should not be async, this test checks that it throws an error.
      set: async ({set, reset}, newVal) => {
        await Promise.resolve();
        newVal instanceof DefaultValue ? reset(myAtom) : set(myAtom, 'SET');
      },
    });

    let setAttempt, resetAttempt;
    // $FlowFixMe[incompatible-call]
    const mySelector2 = selector({
      key: 'selector / async set not supported / async upstream call',
      get: () => myAtom,
      set: ({set, reset}, newVal) => {
        if (newVal instanceof DefaultValue) {
          resetAttempt = Promise.resolve().then(() => {
            reset(myAtom);
          });
        } else {
          setAttempt = Promise.resolve().then(() => {
            set(myAtom, 'SET');
          });
        }
      },
    });

    const testSnapshot = freshSnapshot();
    testSnapshot.retain();
    expect(() =>
      testSnapshot.map(({set}) => {
        set(mySelector, 'SET');
      }),
    ).toThrow();
    expect(() =>
      testSnapshot.map(({reset}) => {
        reset(mySelector);
      }),
    ).toThrow();
    const setSnapshot = testSnapshot.map(({set, reset}) => {
      set(mySelector2, 'SET');
      reset(mySelector2);
    });
    setSnapshot.retain();

    await flushPromisesAndTimers();
    expect(setSnapshot.getLoadable(mySelector2).contents).toEqual('DEFAULT');
    await expect(setAttempt).rejects.toThrowError();
    await expect(resetAttempt).rejects.toThrowError();
  });

  testRecoil('set tries to get async value', () => {
    const myAtom = atom<string>({key: 'selector set get async atom'});
    const mySelector = selector({
      key: 'selector set get async selector',
      get: () => myAtom,
      set: ({get}) => {
        get(myAtom);
      },
    });

    expect(() => setValue(mySelector, 'ERROR')).toThrow(
      'selector set get async',
    );
  });
});

describe('User-thrown promises', () => {
  testRecoil(
    'selectors with user-thrown loadable promises execute to completion as expected',
    async () => {
      const [asyncDep, resolveAsyncDep] = asyncSelector<string, void>();

      // $FlowFixMe[incompatible-call]
      const selWithUserThrownPromise = selector({
        key: 'selWithUserThrownPromise',
        get: ({get}) => {
          const loadable = get(noWait(asyncDep));

          if (loadable.state === 'loading') {
            throw loadable.toPromise();
          }

          return loadable.valueOrThrow();
        },
      });

      const loadable = getLoadable(selWithUserThrownPromise);
      const promise = loadable.toPromise();

      expect(loadable.state).toBe('loading');

      resolveAsyncDep('RESOLVED');

      await flushPromisesAndTimers();

      const val: mixed = await promise;

      expect(val).toBe('RESOLVED');
    },
  );

  testRecoil(
    'selectors with user-thrown loadable promises execute to completion as expected',
    async () => {
      const myAtomA = atom({
        key: 'myatoma selectors user-thrown promise',
        default: 'A',
      });

      const myAtomB = atom({
        key: 'myatomb selectors user-thrown promise',
        default: 'B',
      });

      let isResolved = false;
      let resolve = () => {};

      const myPromise = new Promise(localResolve => {
        resolve = () => {
          isResolved = true;
          localResolve();
        };
      });

      // $FlowFixMe[incompatible-call]
      const selWithUserThrownPromise = selector({
        key: 'selWithUserThrownPromise',
        get: ({get}) => {
          const a = get(myAtomA);

          if (!isResolved) {
            throw myPromise;
          }

          const b = get(myAtomB);

          return `${a}${b}`;
        },
      });

      const loadable = getLoadable(selWithUserThrownPromise);
      const promise = loadable.toPromise();

      expect(loadable.state).toBe('loading');

      resolve();

      await flushPromisesAndTimers();

      const val: mixed = await promise;

      expect(val).toBe('AB');
    },
  );

  testRecoil(
    'selectors with nested user-thrown loadable promises execute to completion as expected',
    async () => {
      const [asyncDep, resolveAsyncDep] = asyncSelector<string, void>();

      // $FlowFixMe[incompatible-call]
      const selWithUserThrownPromise = selector({
        key: 'selWithUserThrownPromise',
        get: ({get}) => {
          const loadable = get(noWait(asyncDep));

          if (loadable.state === 'loading') {
            throw loadable.toPromise();
          }

          return loadable.valueOrThrow();
        },
      });

      const selThatDependsOnSelWithUserThrownPromise = selector({
        key: 'selThatDependsOnSelWithUserThrownPromise',
        get: ({get}) => get(selWithUserThrownPromise),
      });

      const loadable = getLoadable(selThatDependsOnSelWithUserThrownPromise);
      const promise = loadable.toPromise();

      expect(loadable.state).toBe('loading');

      resolveAsyncDep('RESOLVED');

      await flushPromisesAndTimers();

      const val: mixed = await promise;

      expect(val).toBe('RESOLVED');
    },
  );
});

testRecoil('selectors cannot mutate values in get() or set()', () => {
  const devStatus = window.__DEV__;
  window.__DEV__ = true;

  const userState = atom({
    key: 'userState',
    default: {
      name: 'john',
      address: {
        road: '103 road',
        nested: {
          value: 'someNestedValue',
        },
      },
    },
  });

  // $FlowFixMe[incompatible-call]
  const userSelector = selector({
    key: 'userSelector',
    get: ({get}) => {
      const user = get(userState);

      user.address.road = '301 road';

      return user;
    },
    set: ({set, get}) => {
      const user = get(userState);

      user.address.road = 'narrow road';

      return set(userState, user);
    },
  });

  const testSnapshot = freshSnapshot();
  testSnapshot.retain();

  expect(() =>
    testSnapshot.map(({set}) => {
      set(userSelector, {
        name: 'matt',
        address: {
          road: '103 road',
          nested: {
            value: 'someNestedValue',
          },
        },
      });
    }),
  ).toThrow();

  expect(testSnapshot.getLoadable(userSelector).state).toBe('hasError');

  window.__DEV__ = devStatus;
});

describe('getCallback', () => {
  testRecoil('Selector getCallback', async () => {
    const myAtom = atom({
      key: 'selector - getCallback atom',
      default: 'DEFAULT',
    });
    // $FlowFixMe[incompatible-call]
    const mySelector = selector({
      key: 'selector - getCallback',
      get: ({getCallback}) => {
        return {
          onClick: getCallback(
            ({snapshot}) =>
              async () =>
                await snapshot.getPromise(myAtom),
          ),
        };
      },
    });

    const menuItem = getValue(mySelector);
    expect(getValue(myAtom)).toEqual('DEFAULT');
    await expect(menuItem.onClick()).resolves.toEqual('DEFAULT');

    act(() => setValue(myAtom, 'SET'));
    expect(getValue(myAtom)).toEqual('SET');
    await expect(menuItem.onClick()).resolves.toEqual('SET');

    act(() => setValue(myAtom, 'SET2'));
    expect(getValue(myAtom)).toEqual('SET2');
    await expect(menuItem.onClick()).resolves.toEqual('SET2');
  });

  testRecoil('snapshot', async () => {
    const otherSelector = constSelector('VALUE');
    // $FlowFixMe[incompatible-call]
    const mySelector = selector({
      key: 'selector getCallback snapshot',
      get: ({getCallback}) =>
        // $FlowFixMe[missing-local-annot]
        getCallback(({snapshot}) => param => ({
          param,
          loadable: snapshot.getLoadable(otherSelector),
          promise: snapshot.getPromise(otherSelector),
        })),
    });

    expect(getValue(mySelector)(123).param).toBe(123);
    expect(getValue(mySelector)(123).loadable.getValue()).toBe('VALUE');
    await expect(getValue(mySelector)(123).promise).resolves.toBe('VALUE');
  });

  testRecoil('set', () => {
    const myAtom = atom({
      key: 'selector getCallback set atom',
      default: 'DEFAULT',
    });
    // $FlowFixMe[incompatible-call]
    const setSelector = selector({
      key: 'selector getCallback set',
      get: ({getCallback}) =>
        // $FlowFixMe[missing-local-annot]
        getCallback(({set}) => param => {
          set(myAtom, param);
        }),
    });
    // $FlowFixMe[incompatible-call]
    const resetSelector = selector({
      key: 'selector getCallback reset',
      get: ({getCallback}) =>
        getCallback(({reset}) => () => {
          reset(myAtom);
        }),
    });

    expect(getValue(myAtom)).toBe('DEFAULT');
    getValue(setSelector)('SET');
    expect(getValue(myAtom)).toBe('SET');

    getValue(resetSelector)();
    expect(getValue(myAtom)).toBe('DEFAULT');
  });

  testRecoil('transaction', () => {
    const myAtom = atom({
      key: 'selector getCallback transact atom',
      default: 'DEFAULT',
    });
    // $FlowFixMe[incompatible-call]
    const setSelector = selector({
      key: 'selector getCallback transact set',
      get: ({getCallback}) =>
        // $FlowFixMe[missing-local-annot]
        getCallback(({transact_UNSTABLE}) => param => {
          transact_UNSTABLE(({set, get}) => {
            expect(get(myAtom)).toBe('DEFAULT');
            set(myAtom, 'TMP');
            expect(get(myAtom)).toBe('TMP');
            set(myAtom, param);
          });
        }),
    });
    // $FlowFixMe[incompatible-call]
    const resetSelector = selector({
      key: 'selector getCallback transact',
      get: ({getCallback}) =>
        getCallback(({transact_UNSTABLE}) => () => {
          transact_UNSTABLE(({reset}) => reset(myAtom));
        }),
    });

    expect(getValue(myAtom)).toBe('DEFAULT');
    getValue(setSelector)('SET');
    expect(getValue(myAtom)).toBe('SET');

    getValue(resetSelector)();
    expect(getValue(myAtom)).toBe('DEFAULT');
  });

  testRecoil('node', () => {
    // $FlowFixMe[incompatible-call]
    const mySelector = selector({
      key: 'selector getCallback node',
      get: ({getCallback}) =>
        // $FlowFixMe[missing-local-annot]
        getCallback(({node, snapshot}) => param => ({
          param,
          loadable: snapshot.getLoadable(node),
          promise: snapshot.getPromise(node),
        })),
    });

    expect(getValue(mySelector)(123).param).toBe(123);
    expect(getValue(mySelector)(123).loadable.getValue()(456).param).toBe(456);
  });

  testRecoil('refresh', async () => {
    let externalValue = 0;
    // $FlowFixMe[incompatible-call]
    const mySelector = selector({
      key: 'selector getCallback node refresh',
      get: ({getCallback}) => {
        const cachedExternalValue = externalValue;
        return getCallback(({node, refresh}) => () => ({
          cached: cachedExternalValue,
          current: externalValue,
          refresh: () => refresh(node),
        }));
      },
    });

    expect(getValue(mySelector)().current).toBe(0);
    expect(getValue(mySelector)().cached).toBe(0);

    externalValue = 1;
    expect(getValue(mySelector)().current).toBe(1);
    expect(getValue(mySelector)().cached).toBe(0);

    getValue(mySelector)().refresh();
    expect(getValue(mySelector)().current).toBe(1);
    expect(getValue(mySelector)().cached).toBe(1);
  });

  testRecoil('Guard against calling during selector evaluation', async () => {
    // $FlowFixMe[incompatible-call]
    const mySelector = selector({
      key: 'selector getCallback guard',
      get: ({getCallback}) => {
        const callback = getCallback(() => () => {});
        expect(() => callback()).toThrow();
        return 'THROW';
      },
    });

    expect(getValue(mySelector)).toBe('THROW');

    // $FlowFixMe[incompatible-call]
    const myAsyncSelector = selector({
      key: 'selector getCallback guard async',
      get: async ({getCallback}) => {
        const callback = getCallback(() => () => {});
        await Promise.resolve();
        expect(() => callback()).toThrow();
        return 'THROW';
      },
    });

    await expect(getPromise(myAsyncSelector)).resolves.toBe('THROW');
  });

  testRecoil('Callback can be used from thrown error', async () => {
    const mySelector = selector({
      key: 'selector getCallback from error',
      get: ({getCallback}) => {
        // eslint-disable-next-line no-throw-literal
        // $FlowFixMe[missing-local-annot]
        throw {callback: getCallback(() => x => x)};
      },
    });

    // $FlowExpectedError[incompatible-use]]
    expect(getLoadable(mySelector).errorOrThrow().callback(123)).toEqual(123);

    const myAsyncSelector = selector({
      key: 'selector getCallback from error async',
      get: ({getCallback}) => {
        return Promise.reject({callback: getCallback(() => x => x)});
      },
    });

    await expect(
      getPromise(myAsyncSelector).catch(({callback}) => callback(123)),
    ).resolves.toEqual(123);
  });
});

testRecoil('Report error with inconsistent values', () => {
  const depA = stringAtom();
  const depB = stringAtom();

  // NOTE This is an illegal selector because it can provide different values
  // with the same input dependency values.
  let invalidInput = null;
  // $FlowFixMe[incompatible-call]
  const mySelector = selector({
    key: 'selector report invalid change',
    get: ({get}) => {
      get(depA);
      if (invalidInput) {
        return invalidInput;
      }
      return get(depB);
    },
  });

  expect(getValue(mySelector)).toBe('DEFAULT');

  const DEV = window.__DEV__;
  let msg;
  const consoleError = console.error;
  // $FlowIssue[cannot-write]
  console.error = (...args) => {
    msg = args[0];
    consoleError(...args);
  };
  window.__DEV__ = true;

  invalidInput = 'INVALID';
  setValue(depB, 'SET');

  // Reset logic will still allow selector to work by resetting cache.
  expect(getValue(mySelector)).toBe('INVALID');
  expect(msg).toEqual(expect.stringContaining('consistent values'));

  // $FlowIssue[cannot-write]
  console.error = consoleError;
  window.__DEV__ = DEV;
});

testRecoil('Selector values are frozen', async () => {
  const devStatus = window.__DEV__;
  window.__DEV__ = true;

  const frozenSelector = selector({
    key: 'selector frozen',
    get: () => ({state: 'frozen', nested: {state: 'frozen'}}),
  });
  expect(Object.isFrozen(getValue(frozenSelector))).toBe(true);
  expect(Object.isFrozen(getValue(frozenSelector).nested)).toBe(true);

  const thawedSelector = selector({
    key: 'selector frozen thawed',
    get: () => ({state: 'thawed', nested: {state: 'thawed'}}),
    dangerouslyAllowMutability: true,
  });
  expect(Object.isFrozen(getValue(thawedSelector))).toBe(false);
  expect(Object.isFrozen(getValue(thawedSelector).nested)).toBe(false);

  const asyncFrozenSelector = selector({
    key: 'selector frozen async',
    get: () => Promise.resolve({state: 'frozen', nested: {state: 'frozen'}}),
  });
  await expect(
    getPromise(asyncFrozenSelector).then(x => Object.isFrozen(x)),
  ).resolves.toBe(true);
  expect(Object.isFrozen(getValue(asyncFrozenSelector).nested)).toBe(true);

  const asyncThawedSelector = selector({
    key: 'selector frozen thawed async',
    get: () => Promise.resolve({state: 'thawed', nested: {state: 'thawed'}}),
    dangerouslyAllowMutability: true,
  });
  await expect(
    getPromise(asyncThawedSelector).then(x => Object.isFrozen(x)),
  ).resolves.toBe(false);
  expect(Object.isFrozen(getValue(asyncThawedSelector).nested)).toBe(false);

  const upstreamFrozenSelector = selector({
    key: 'selector frozen upstream',
    get: () => ({state: 'frozen', nested: {state: 'frozen'}}),
  });
  const fwdFrozenSelector = selector({
    key: 'selector frozen fwd',
    get: () => upstreamFrozenSelector,
  });
  expect(Object.isFrozen(getValue(fwdFrozenSelector))).toBe(true);
  expect(Object.isFrozen(getValue(fwdFrozenSelector).nested)).toBe(true);

  const upstreamThawedSelector = selector({
    key: 'selector frozen thawed upstream',
    get: () => ({state: 'thawed', nested: {state: 'thawed'}}),
    dangerouslyAllowMutability: true,
  });
  const fwdThawedSelector = selector({
    key: 'selector frozen thawed fwd',
    get: () => upstreamThawedSelector,
    dangerouslyAllowMutability: true,
  });
  expect(Object.isFrozen(getValue(fwdThawedSelector))).toBe(false);
  expect(Object.isFrozen(getValue(fwdThawedSelector).nested)).toBe(false);

  // Selectors should not freeze their upstream dependencies
  const upstreamMixedSelector = selector({
    key: 'selector frozen mixed upstream',
    get: () => ({state: 'thawed', nested: {state: 'thawed'}}),
    dangerouslyAllowMutability: true,
  });
  // $FlowFixMe[incompatible-call]
  const fwdMixedSelector = selector({
    key: 'selector frozen mixed fwd',
    get: ({get}) => {
      get(upstreamMixedSelector);
      return {state: 'frozen'};
    },
  });
  expect(Object.isFrozen(getValue(fwdMixedSelector))).toBe(true);
  expect(Object.isFrozen(getValue(upstreamMixedSelector))).toBe(false);
  expect(Object.isFrozen(getValue(upstreamMixedSelector).nested)).toBe(false);

  window.__DEV__ = devStatus;
});
