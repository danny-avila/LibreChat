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

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let React,
  act,
  selector,
  constSelector,
  errorSelector,
  asyncSelector,
  renderElements,
  useRecoilValueLoadable,
  flushPromisesAndTimers;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({act} = require('ReactTestUtils'));
  constSelector = require('../../recoil_values/Recoil_constSelector');
  errorSelector = require('../../recoil_values/Recoil_errorSelector');
  selector = require('../../recoil_values/Recoil_selector');
  ({
    asyncSelector,
    renderElements,
    flushPromisesAndTimers,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  ({useRecoilValueLoadable} = require('../Recoil_Hooks'));
});

// These tests should cover the Loadable interface returned by useRecoilValueLoadable.
// It is also used by useRecoilStateNoThrow, waitForNone, and waitForAny

testRecoil('useRecoilValueLoadable - loadable with value', async () => {
  const valueSel = constSelector('VALUE');
  let promise;
  function ReadLoadable() {
    const loadable = useRecoilValueLoadable(valueSel);
    expect(loadable.state).toBe('hasValue');
    expect(loadable.contents).toBe('VALUE');
    expect(loadable.getValue()).toBe('VALUE');
    // eslint-disable-next-line jest/valid-expect
    promise = expect(loadable.toPromise()).resolves.toBe('VALUE');
    expect(loadable.valueMaybe()).toBe('VALUE');
    expect(loadable.valueOrThrow()).toBe('VALUE');
    expect(loadable.errorMaybe()).toBe(undefined);
    expect(() => loadable.errorOrThrow()).toThrow(Error);
    expect(loadable.promiseMaybe()).toBe(undefined);
    expect(() => loadable.promiseOrThrow()).toThrow(Error);
    return loadable.valueOrThrow();
  }
  const c = renderElements(<ReadLoadable />);
  expect(c.textContent).toEqual('VALUE');
  await promise;
});

testRecoil('useRecoilValueLoadable - loadable with error', async () => {
  const valueSel = errorSelector<$FlowFixMe>('ERROR');
  let promise;
  function ReadLoadable() {
    const loadable = useRecoilValueLoadable(valueSel);
    expect(loadable.state).toBe('hasError');
    expect(loadable.contents).toBeInstanceOf(Error);
    expect(() => loadable.getValue()).toThrow('ERROR');
    // eslint-disable-next-line jest/valid-expect
    promise = expect(loadable.toPromise()).rejects.toBeInstanceOf(Error);
    expect(loadable.valueMaybe()).toBe(undefined);
    expect(() => loadable.valueOrThrow()).toThrow(Error);
    expect(String(loadable.errorMaybe() ?? {})).toContain('ERROR');
    expect(loadable.errorOrThrow()).toBeInstanceOf(Error);
    expect(String(loadable.errorOrThrow())).toContain('ERROR');
    expect(loadable.promiseMaybe()).toBe(undefined);
    expect(() => loadable.promiseOrThrow()).toThrow(Error);
    return 'VALUE';
  }
  const c = renderElements(<ReadLoadable />);
  expect(c.textContent).toEqual('VALUE');
  await promise;
});

testRecoil('useRecoilValueLoadable - loading loadable', async () => {
  const [valueSel, resolve] = asyncSelector<string, _>();
  let resolved = false;
  const promises = [];
  function ReadLoadable() {
    const loadable = useRecoilValueLoadable(valueSel);
    if (!resolved) {
      expect(loadable.state).toBe('loading');
      expect(loadable.contents).toBeInstanceOf(Promise);
      expect(() => loadable.getValue()).toThrow();
      try {
        loadable.getValue();
      } catch (promise) {
        promises.push(promise);
      }
      promises.push(loadable.toPromise());
      expect(loadable.valueMaybe()).toBe(undefined);
      expect(() => loadable.valueOrThrow()).toThrow(Error);
      expect(loadable.errorMaybe()).toBe(undefined);
      expect(() => loadable.errorOrThrow()).toThrow(Error);
      expect(loadable.promiseMaybe()).toBeInstanceOf(Promise);
      promises.push(loadable.promiseMaybe());
      return 'LOADING';
    } else {
      expect(loadable.state).toBe('hasValue');
      expect(loadable.contents).toBe('VALUE');
      expect(loadable.getValue()).toBe('VALUE');
      promises.push(loadable.toPromise());
      expect(loadable.valueMaybe()).toBe('VALUE');
      expect(loadable.valueOrThrow()).toBe('VALUE');
      expect(loadable.errorMaybe()).toBe(undefined);
      expect(() => loadable.errorOrThrow()).toThrow(Error);
      expect(loadable.promiseMaybe()).toBe(undefined);
      expect(() => loadable.promiseOrThrow()).toThrow(Error);
      return loadable.valueOrThrow();
    }
  }
  const c = renderElements(<ReadLoadable />);
  expect(c.textContent).toEqual('LOADING');
  resolve('VALUE');
  resolved = true;
  act(() => jest.runAllTimers());
  expect(c.textContent).toEqual('VALUE');
  await Promise.all(
    promises.map(async promise => {
      if (!(promise instanceof Promise)) {
        // for flow
        throw new Error('Expected a promise');
      }

      const res = await promise;
      const val = typeof res === 'string' ? res : res.__value;

      expect(val).toBe('VALUE');
    }),
  );
});

testRecoil(
  'useRecoilValueLoadable() with an async throwing selector results in a loadable in error state',
  async () => {
    const asyncError = selector<mixed>({
      key: 'asyncError',
      get: async () => {
        throw new Error('Test Error');
      },
    });

    const Test = () => {
      const loadable = useRecoilValueLoadable(asyncError);
      return (
        <h1>{loadable?.state === 'hasError' ? 'Has error' : 'No error'}</h1>
      );
    };

    const c = renderElements(<Test />);

    await act(() => flushPromisesAndTimers());

    expect(c.textContent).toEqual('Has error');
  },
);

// Test that an async selector can depend on an async selector dependency
// and include async post-processing.
testRecoil('two level async', async () => {
  const level2 = selector({
    key: 'useRecoilValueLoadable async level2',
    // $FlowFixMe[incompatible-call]
    get: () => new Promise(resolve => setTimeout(() => resolve('level2'))),
  });

  // $FlowFixMe[incompatible-call]
  const level1 = selector({
    key: 'useRecoilValueLoadable async level1',
    get: async ({get}) => {
      const level2Value = get(level2);
      return await new Promise(resolve =>
        // $FlowFixMe[incompatible-call]
        // $FlowFixMe[incompatible-type]
        setTimeout(() => resolve(`level1 + ${level2Value}`)),
      );
    },
  });

  const promises = [];
  function ReadPromise() {
    const loadable = useRecoilValueLoadable(level1);
    promises.push(loadable.toPromise());
    return loadable.getValue();
  }
  const c = renderElements(<ReadPromise />);
  expect(c.textContent).toEqual('loading');

  await flushPromisesAndTimers();
  await flushPromisesAndTimers();
  await flushPromisesAndTimers();
  await flushPromisesAndTimers();

  expect(c.textContent).toEqual('level1 + level2');
  await Promise.all(
    promises.map(promise => expect(promise).resolves.toBe('level1 + level2')),
  );
});
