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
  flushPromisesAndTimers,
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let getRecoilValueAsLoadable,
  noWait,
  waitForAll,
  waitForAllSettled,
  waitForAny,
  waitForNone,
  store,
  selector,
  invariant;

const testRecoil = getRecoilTestFn(() => {
  const {
    makeStore,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

  invariant = require('recoil-shared/util/Recoil_invariant');
  ({
    getRecoilValueAsLoadable,
  } = require('../../core/Recoil_RecoilValueInterface'));
  selector = require('../Recoil_selector');
  ({
    noWait,
    waitForAll,
    waitForAllSettled,
    waitForAny,
    waitForNone,
  } = require('../Recoil_WaitFor'));

  store = makeStore();
});

/* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
 * LTI update could not be added via codemod */
function getLoadable(atom) {
  return getRecoilValueAsLoadable(store, atom).contents;
}

function getState<T>(
  recoilValue: RecoilValue<T>,
): 'loading' | 'hasValue' | 'hasError' {
  return getRecoilValueAsLoadable(store, recoilValue).state;
}

function getValue<T>(recoilValue: RecoilValue<T>): T {
  const loadable = getRecoilValueAsLoadable(store, recoilValue);
  if (loadable.state !== 'hasValue') {
    throw new Error(`expected atom "${recoilValue.key}" to have a value`);
  }
  return loadable.contents;
}

function getPromise<T>(recoilValue: RecoilValue<T>): Promise<T> {
  const loadable = getRecoilValueAsLoadable(store, recoilValue);
  if (loadable.state !== 'loading') {
    throw new Error(`expected atom "${recoilValue.key}" to be a promise`);
  }
  return loadable.toPromise();
}

let id = 0;
function asyncSelector<T, S>(
  dep?: RecoilValue<S>,
): [RecoilValue<T>, (T) => void, (Error) => void, () => boolean] {
  let resolve: T => void = () => invariant(false, 'bug in test code'); // make flow happy with initialization
  let reject: mixed => void = () => invariant(false, 'bug in test code');
  let evaluated = false;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // $FlowFixMe[incompatible-call]
  const sel = selector({
    key: `AsyncSelector${id++}`,
    get: ({get}) => {
      evaluated = true;
      if (dep != null) {
        get(dep);
      }
      return promise;
    },
  });
  return [sel, resolve, reject, () => evaluated];
}

/* eslint-disable jest/valid-expect */

testRecoil('noWait - resolve', async () => {
  const [dep, resolve] = asyncSelector<number, _>();

  const pTest = expect(getValue(noWait(dep)).toPromise()).resolves.toBe(42);

  expect(getValue(noWait(dep)).contents).toBeInstanceOf(Promise);
  resolve(42);
  await flushPromisesAndTimers();
  expect(getValue(noWait(dep)).contents).toBe(42);
  await pTest;
});

testRecoil('noWait - reject', async () => {
  const [dep, _resolve, reject] = asyncSelector<$FlowFixMe, _>();
  class MyError extends Error {}

  const pTest = expect(
    getValue(noWait(dep)).toPromise(),
  ).rejects.toBeInstanceOf(MyError);
  expect(getValue(noWait(dep)).contents).toBeInstanceOf(Promise);
  reject(new MyError());
  await flushPromisesAndTimers();
  expect(getValue(noWait(dep)).contents).toBeInstanceOf(MyError);
  await pTest;
});

// TRUTH TABLE
// Dependencies        waitForNone         waitForAny        waitForAll      waitForAllSettled
// [loading, loading]  [Promise, Promise]  Promise           Promise         Promise
// [value, loading]    [value, Promise]    [value, Promise]  Promise         Promise
// [value, value]      [value, value]      [value, value]    [value, value]  [value, value]
testRecoil('waitFor - resolve to values', async () => {
  const [depA, resolveA] = asyncSelector<$FlowFixMe | number, _>();
  const [depB, resolveB] = asyncSelector<$FlowFixMe | number, _>();
  const deps = [depA, depB];

  // Test for initial values
  // watiForNone returns loadables with promises that resolve to their values
  expect(getValue(waitForNone(deps)).every(r => r.state === 'loading')).toBe(
    true,
  );
  const depTest0 = expect(
    getValue(waitForNone(deps))[0].promiseMaybe(),
  ).resolves.toBe(0);
  const depTest1 = expect(
    getValue(waitForNone(deps))[1].promiseMaybe(),
  ).resolves.toBe(1);
  // waitForAny returns a promise that resolves to the state with the next
  // resolved value.  So, that includes the first value and a promise for the second.
  expect(getLoadable(waitForAny(deps))).toBeInstanceOf(Promise);

  const anyTest0 = expect(
    getPromise(waitForAny(deps)).then(value => {
      expect(value[0].valueMaybe()).toEqual(0);
      return value[0].valueMaybe();
    }),
  ).resolves.toEqual(0);

  const anyTest1 = expect(
    getPromise(waitForAny(deps)).then(value => {
      expect(value[1].promiseMaybe()).toBeInstanceOf(Promise);
      return value[1].promiseMaybe();
    }),
  ).resolves.toBe(1);

  // waitForAll returns a promise that resolves to the actual values
  expect(getLoadable(waitForAll(deps))).toBeInstanceOf(Promise);
  const allTest0 = expect(getPromise(waitForAll(deps))).resolves.toEqual([
    0, 1,
  ]);

  // Resolve the first dep
  resolveA(0);
  await flushPromisesAndTimers();
  expect(getValue(waitForNone(deps))[0].contents).toBe(0);
  expect(getValue(waitForNone(deps))[1].contents).toBeInstanceOf(Promise);
  expect(getValue(waitForAny(deps))[0].contents).toBe(0);
  expect(getValue(waitForAny(deps))[1].contents).toBeInstanceOf(Promise);
  expect(getLoadable(waitForAll(deps))).toBeInstanceOf(Promise);

  const allTest1 = expect(getPromise(waitForAll(deps))).resolves.toEqual([
    0, 1,
  ]);

  // Resolve the second dep
  resolveB(1);
  await flushPromisesAndTimers();
  expect(getValue(waitForNone(deps))[0].contents).toBe(0);
  expect(getValue(waitForNone(deps))[1].contents).toBe(1);
  expect(getValue(waitForAny(deps))[0].contents).toBe(0);
  expect(getValue(waitForAny(deps))[1].contents).toBe(1);
  expect(getValue(waitForAll(deps))[0]).toBe(0);
  expect(getValue(waitForAll(deps))[1]).toBe(1);

  await depTest0;
  await depTest1;
  await anyTest0;
  await anyTest1;
  await allTest0;
  await allTest1;
});

// TRUTH TABLE
// Dependencies        waitForNone         waitForAny        waitForAll    waitForAllSettled
// [loading, loading]  [Promise, Promise]  Promise           Promise       Promise
// [error, loading]    [Error, Promise]    [Error, Promise]  Error         Promise
// [error, error]      [Error, Error]      [Error, Error]    Error         [Error, Error]
testRecoil('waitFor - rejected', async () => {
  const [depA, _resolveA, rejectA] = asyncSelector<$FlowFixMe, _>();
  const [depB, _resolveB, rejectB] = asyncSelector<$FlowFixMe, _>();
  const deps = [depA, depB];

  class Error1 extends Error {}
  class Error2 extends Error {}

  // All deps Loading Tests
  expect(getState(waitForNone(deps))).toEqual('hasValue');
  expect(getLoadable(waitForNone(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForNone(deps))[0].contents).toBeInstanceOf(Promise);
  expect(getValue(waitForNone(deps))[1].contents).toBeInstanceOf(Promise);

  expect(getState(waitForAny(deps))).toEqual('loading');
  expect(getLoadable(waitForAny(deps))).toBeInstanceOf(Promise);
  const anyTest0 = expect(
    getPromise(waitForAny(deps)).then(res => {
      expect(res[0].contents).toBeInstanceOf(Error1);
      expect(res[1].contents).toBeInstanceOf(Promise);
      return 'success';
    }),
  ).resolves.toEqual('success');

  expect(getState(waitForAll(deps))).toEqual('loading');
  expect(getLoadable(waitForAll(deps))).toBeInstanceOf(Promise);
  const allTest0 = expect(
    getPromise(waitForAll(deps)).catch(err => {
      expect(err).toBeInstanceOf(Error1);
      return 'failure';
    }),
  ).resolves.toEqual('failure');

  expect(getState(waitForAllSettled(deps))).toEqual('loading');
  expect(getLoadable(waitForAllSettled(deps))).toBeInstanceOf(Promise);
  const allSettledTest0 = expect(
    getPromise(waitForAllSettled(deps)).then(res => {
      expect(res[0].contents).toBeInstanceOf(Error1);
      expect(res[1].contents).toBeInstanceOf(Error2);
      return 'success';
    }),
  ).resolves.toEqual('success');

  // depA Rejected tests
  rejectA(new Error1());
  await flushPromisesAndTimers();

  expect(getState(waitForNone(deps))).toEqual('hasValue');
  expect(getLoadable(waitForNone(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForNone(deps))[0].contents).toBeInstanceOf(Error1);
  expect(getValue(waitForNone(deps))[1].contents).toBeInstanceOf(Promise);

  expect(getState(waitForAny(deps))).toEqual('hasValue');
  expect(getLoadable(waitForAny(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForAny(deps))[0].contents).toBeInstanceOf(Error1);
  expect(getValue(waitForAny(deps))[1].contents).toBeInstanceOf(Promise);

  expect(getState(waitForAll(deps))).toEqual('hasError');
  expect(getLoadable(waitForAll(deps))).toBeInstanceOf(Error1);

  expect(getState(waitForAllSettled(deps))).toEqual('loading');
  expect(getLoadable(waitForAllSettled(deps))).toBeInstanceOf(Promise);
  const allSettledTest1 = expect(
    getPromise(waitForAllSettled(deps)).then(res => {
      expect(res[0].contents).toBeInstanceOf(Error1);
      expect(res[1].contents).toBeInstanceOf(Error2);
      return 'success';
    }),
  ).resolves.toEqual('success');

  // depB Rejected tests
  rejectB(new Error2());
  await flushPromisesAndTimers();

  expect(getState(waitForNone(deps))).toEqual('hasValue');
  expect(getLoadable(waitForNone(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForNone(deps))[0].contents).toBeInstanceOf(Error1);
  expect(getValue(waitForNone(deps))[1].contents).toBeInstanceOf(Error2);

  expect(getState(waitForAny(deps))).toEqual('hasValue');
  expect(getLoadable(waitForAny(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForAny(deps))[0].contents).toBeInstanceOf(Error1);
  expect(getValue(waitForAny(deps))[1].contents).toBeInstanceOf(Error2);

  expect(getState(waitForAll(deps))).toEqual('hasError');
  expect(getLoadable(waitForAll(deps))).toBeInstanceOf(Error1);

  expect(getState(waitForAllSettled(deps))).toEqual('hasValue');
  expect(getLoadable(waitForAllSettled(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForAllSettled(deps))[0].contents).toBeInstanceOf(Error1);
  expect(getValue(waitForAllSettled(deps))[1].contents).toBeInstanceOf(Error2);

  await anyTest0;
  await allTest0;
  await allSettledTest0;
  await allSettledTest1;
});

// TRUTH TABLE
// Dependencies        waitForNone         waitForAny        waitForAll    waitForAllSettled
// [loading, loading]  [Promise, Promise]  Promise           Promise       Promise
// [value, loading]    [value, Promise]    [value, Promise]  Promise       Promise
// [value, error]      [value, Error]      [value, Error]    Error         [value, Error]
testRecoil('waitFor - resolve then reject', async () => {
  const [depA, resolveA, _rejectA] = asyncSelector<$FlowFixMe | number, _>();
  const [depB, _resolveB, rejectB] = asyncSelector<$FlowFixMe | number, _>();
  const deps = [depA, depB];

  class Error2 extends Error {}

  // All deps Loading Tests
  expect(getState(waitForNone(deps))).toEqual('hasValue');
  expect(getLoadable(waitForNone(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForNone(deps))[0].contents).toBeInstanceOf(Promise);
  expect(getValue(waitForNone(deps))[1].contents).toBeInstanceOf(Promise);

  expect(getState(waitForAny(deps))).toEqual('loading');
  expect(getLoadable(waitForAny(deps))).toBeInstanceOf(Promise);
  const anyTest0 = expect(
    getPromise(waitForAny(deps)).then(res => {
      expect(res[0].contents).toEqual(1);
      expect(res[1].contents).toBeInstanceOf(Promise);
      return 'success';
    }),
  ).resolves.toEqual('success');

  expect(getState(waitForAll(deps))).toEqual('loading');
  expect(getLoadable(waitForAll(deps))).toBeInstanceOf(Promise);
  const allTest0 = expect(
    getPromise(waitForAll(deps)).catch(err => {
      expect(err).toBeInstanceOf(Error2);
      return 'failure';
    }),
  ).resolves.toEqual('failure');

  expect(getState(waitForAllSettled(deps))).toEqual('loading');
  expect(getLoadable(waitForAllSettled(deps))).toBeInstanceOf(Promise);
  const allSettledTest0 = expect(
    getPromise(waitForAllSettled(deps)).then(res => {
      expect(res[0].contents).toEqual(1);
      expect(res[1].contents).toBeInstanceOf(Error2);
      return 'success';
    }),
  ).resolves.toEqual('success');

  // depA Resolves tests
  resolveA(1);
  await flushPromisesAndTimers();

  expect(getState(waitForNone(deps))).toEqual('hasValue');
  expect(getLoadable(waitForNone(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForNone(deps))[0].contents).toEqual(1);
  expect(getValue(waitForNone(deps))[1].contents).toBeInstanceOf(Promise);

  expect(getState(waitForAny(deps))).toEqual('hasValue');
  expect(getLoadable(waitForAny(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForAny(deps))[0].contents).toEqual(1);
  expect(getValue(waitForAny(deps))[1].contents).toBeInstanceOf(Promise);

  expect(getState(waitForAll(deps))).toEqual('loading');
  expect(getLoadable(waitForAll(deps))).toBeInstanceOf(Promise);
  const allTest1 = expect(getPromise(waitForAll(deps))).rejects.toBeInstanceOf(
    Error2,
  );

  expect(getState(waitForAllSettled(deps))).toEqual('loading');
  expect(getLoadable(waitForAllSettled(deps))).toBeInstanceOf(Promise);
  const allSettledTest1 = expect(
    getPromise(waitForAllSettled(deps)).then(res => {
      expect(res[0].contents).toEqual(1);
      expect(res[1].contents).toBeInstanceOf(Error2);
      return 'success';
    }),
  ).resolves.toEqual('success');

  // depB Rejected tests
  rejectB(new Error2());
  await flushPromisesAndTimers();

  expect(getState(waitForNone(deps))).toEqual('hasValue');
  expect(getLoadable(waitForNone(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForNone(deps))[0].contents).toEqual(1);
  expect(getValue(waitForNone(deps))[1].contents).toBeInstanceOf(Error2);

  expect(getState(waitForAny(deps))).toEqual('hasValue');
  expect(getLoadable(waitForAny(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForAny(deps))[0].contents).toEqual(1);
  expect(getValue(waitForAny(deps))[1].contents).toBeInstanceOf(Error2);

  expect(getState(waitForAll(deps))).toEqual('hasError');
  expect(getLoadable(waitForAll(deps))).toBeInstanceOf(Error2);

  expect(getState(waitForAllSettled(deps))).toEqual('hasValue');
  expect(getLoadable(waitForAllSettled(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForAllSettled(deps))[0].contents).toEqual(1);
  expect(getValue(waitForAllSettled(deps))[1].contents).toBeInstanceOf(Error2);

  await anyTest0;
  await allTest0;
  await allTest1;
  await allSettledTest0;
  await allSettledTest1;
});

// TRUTH TABLE
// Dependencies        waitForNone         waitForAny        waitForAll    waitForAllSettled
// [loading, loading]  [Promise, Promise]  Promise           Promise       Promise
// [error, loading]    [Error, Promise]    [Error, Promsie]  Error         Promise
// [error, value]      [Error, value]      [Error, value]    Error         [Error, value]
testRecoil('waitFor - reject then resolve', async () => {
  const [depA, _resolveA, rejectA] = asyncSelector<$FlowFixMe | number, _>();
  const [depB, resolveB, _rejectB] = asyncSelector<$FlowFixMe | number, _>();
  const deps = [depA, depB];

  class Error1 extends Error {}

  // All deps Loading Tests
  expect(getState(waitForNone(deps))).toEqual('hasValue');
  expect(getLoadable(waitForNone(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForNone(deps))[0].contents).toBeInstanceOf(Promise);
  expect(getValue(waitForNone(deps))[1].contents).toBeInstanceOf(Promise);

  expect(getState(waitForAny(deps))).toEqual('loading');
  expect(getLoadable(waitForAny(deps))).toBeInstanceOf(Promise);
  const anyTest0 = expect(
    getPromise(waitForAny(deps)).then(res => {
      expect(res[0].contents).toBeInstanceOf(Error1);
      expect(res[1].contents).toBeInstanceOf(Promise);
      return 'success';
    }),
  ).resolves.toEqual('success');

  expect(getState(waitForAll(deps))).toEqual('loading');
  expect(getLoadable(waitForAll(deps))).toBeInstanceOf(Promise);
  const allTest0 = expect(
    getPromise(waitForAll(deps)).catch(err => {
      expect(err).toBeInstanceOf(Error1);
      return 'failure';
    }),
  ).resolves.toEqual('failure');

  expect(getState(waitForAllSettled(deps))).toEqual('loading');
  expect(getLoadable(waitForAllSettled(deps))).toBeInstanceOf(Promise);
  const allSettledTest0 = expect(
    getPromise(waitForAllSettled(deps)).then(res => {
      expect(res[0].contents).toBeInstanceOf(Error1);
      expect(res[1].contents).toEqual(1);
      return 'success';
    }),
  ).resolves.toEqual('success');

  // depA Rejects tests
  rejectA(new Error1());
  await flushPromisesAndTimers();

  expect(getState(waitForNone(deps))).toEqual('hasValue');
  expect(getLoadable(waitForNone(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForNone(deps))[0].contents).toBeInstanceOf(Error1);
  expect(getValue(waitForNone(deps))[1].contents).toBeInstanceOf(Promise);

  expect(getState(waitForAny(deps))).toEqual('hasValue');
  expect(getLoadable(waitForAny(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForAny(deps))[0].contents).toBeInstanceOf(Error1);
  expect(getValue(waitForAny(deps))[1].contents).toBeInstanceOf(Promise);

  expect(getState(waitForAll(deps))).toEqual('hasError');
  expect(getLoadable(waitForAll(deps))).toBeInstanceOf(Error1);

  expect(getState(waitForAllSettled(deps))).toEqual('loading');
  expect(getLoadable(waitForAllSettled(deps))).toBeInstanceOf(Promise);
  const allSettledTest1 = expect(
    getPromise(waitForAllSettled(deps)).then(res => {
      expect(res[0].contents).toBeInstanceOf(Error1);
      expect(res[1].contents).toEqual(1);
      return 'success';
    }),
  ).resolves.toEqual('success');

  // depB Resolves tests
  resolveB(1);
  await flushPromisesAndTimers();

  expect(getState(waitForNone(deps))).toEqual('hasValue');
  expect(getLoadable(waitForNone(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForNone(deps))[0].contents).toBeInstanceOf(Error1);
  expect(getValue(waitForNone(deps))[1].contents).toEqual(1);

  expect(getState(waitForAny(deps))).toEqual('hasValue');
  expect(getLoadable(waitForAny(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForAny(deps))[0].contents).toBeInstanceOf(Error1);
  expect(getValue(waitForAny(deps))[1].contents).toEqual(1);

  expect(getState(waitForAll(deps))).toEqual('hasError');
  expect(getLoadable(waitForAll(deps))).toBeInstanceOf(Error1);

  expect(getState(waitForAllSettled(deps))).toEqual('hasValue');
  expect(getLoadable(waitForAllSettled(deps))).toBeInstanceOf(Array);
  expect(getValue(waitForAllSettled(deps))[0].contents).toBeInstanceOf(Error1);
  expect(getValue(waitForAllSettled(deps))[1].contents).toEqual(1);

  await anyTest0;
  await allTest0;
  await allSettledTest0;
  await allSettledTest1;
});

// Similar as the first test that resolves both dependencies, but with named dependencies.
testRecoil('waitFor - named dependency version', async () => {
  const [depA, resolveA] = asyncSelector<$FlowFixMe | number, _>();
  const [depB, resolveB] = asyncSelector<$FlowFixMe | number, _>();
  const deps = {a: depA, b: depB};

  expect(getValue(waitForNone(deps)).a.promiseMaybe()).toBeInstanceOf(Promise);
  expect(getValue(waitForNone(deps)).b.promiseMaybe()).toBeInstanceOf(Promise);

  const depTest0 = expect(
    getValue(waitForNone(deps)).a.promiseMaybe(),
  ).resolves.toBe(0);

  const depTest1 = expect(
    getValue(waitForNone(deps)).b.promiseMaybe(),
  ).resolves.toBe(1);

  expect(getLoadable(waitForAny(deps))).toBeInstanceOf(Promise);

  const anyTest0 = expect(
    getPromise(waitForAny(deps)).then(value => {
      expect(value.a.valueMaybe()).toEqual(0);

      return value.a.valueMaybe();
    }),
  ).resolves.toEqual(0);

  const anyTest1 = expect(
    getPromise(waitForAny(deps)).then(value => {
      expect(value.b.promiseMaybe()).toBeInstanceOf(Promise);
      return value.b.promiseMaybe();
    }),
  ).resolves.toBe(1);

  expect(getLoadable(waitForAll(deps))).toBeInstanceOf(Promise);

  const allTest0 = expect(getPromise(waitForAll(deps))).resolves.toEqual({
    a: 0,
    b: 1,
  });

  resolveA(0);
  await flushPromisesAndTimers();
  expect(getValue(waitForNone(deps)).a.contents).toBe(0);
  expect(getValue(waitForNone(deps)).b.contents).toBeInstanceOf(Promise);
  expect(getValue(waitForAny(deps)).a.contents).toBe(0);
  expect(getValue(waitForAny(deps)).b.contents).toBeInstanceOf(Promise);
  expect(getLoadable(waitForAll(deps))).toBeInstanceOf(Promise);

  const allTest1 = expect(getPromise(waitForAll(deps))).resolves.toEqual({
    a: 0,
    b: 1,
  });

  resolveB(1);
  await flushPromisesAndTimers();
  expect(getValue(waitForNone(deps)).a.contents).toBe(0);
  expect(getValue(waitForNone(deps)).b.contents).toBe(1);
  expect(getValue(waitForAny(deps)).a.contents).toBe(0);
  expect(getValue(waitForAny(deps)).b.contents).toBe(1);
  expect(getValue(waitForAll(deps)).a).toBe(0);
  expect(getValue(waitForAll(deps)).b).toBe(1);

  await depTest0;
  await depTest1;
  await anyTest0;
  await anyTest1;
  await allTest0;
  await allTest1;
});

testRecoil('waitForAll - Evaluated concurrently', async () => {
  const [depA, resolveA, _rejectA, evaluatedA] = asyncSelector<
    $FlowFixMe | number,
    _,
  >();
  const [depB, _resolveB, _rejectB, evaluatedB] = asyncSelector<
    $FlowFixMe,
    _,
  >();
  const deps = [depA, depB];

  expect(evaluatedA()).toBe(false);
  expect(evaluatedB()).toBe(false);

  getPromise(waitForAll(deps));
  await flushPromisesAndTimers();

  // Confirm dependencies were evaluated in parallel
  expect(evaluatedA()).toBe(true);
  expect(evaluatedB()).toBe(true);

  resolveA(0);
  getPromise(waitForAll(deps));
  await flushPromisesAndTimers();

  expect(evaluatedA()).toBe(true);
  expect(evaluatedB()).toBe(true);
});

testRecoil('waitForAll - mixed sync and async deps', async () => {
  const [depA, resolveA] = asyncSelector<$FlowFixMe | number, _>();
  const depB = selector({
    key: 'mydepkeyB',
    get: () => 1,
  });

  const deps = [depA, depB];

  const allTest = expect(getPromise(waitForAll(deps))).resolves.toEqual([0, 1]);

  resolveA(0);
  await flushPromisesAndTimers();

  expect(getValue(waitForAll(deps))).toEqual([0, 1]);

  await allTest;
});

/* eslint-enable jest/valid-expect */
