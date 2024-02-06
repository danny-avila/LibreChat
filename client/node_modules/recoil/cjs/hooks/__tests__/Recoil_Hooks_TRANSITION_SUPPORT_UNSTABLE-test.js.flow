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

// Sanity tests for *_TRANSITION_SUPPORT_UNSTABLE() hooks.  The actual tests
// for useTransition() support are in Recoil_useTransition-test.js

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let React,
  act,
  selector,
  stringAtom,
  asyncSelector,
  flushPromisesAndTimers,
  renderElements,
  useRecoilState,
  useRecoilState_TRANSITION_SUPPORT_UNSTABLE,
  useRecoilValue,
  useRecoilValue_TRANSITION_SUPPORT_UNSTABLE,
  useRecoilValueLoadable,
  useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE,
  useSetRecoilState,
  reactMode;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({act} = require('ReactTestUtils'));

  selector = require('../../recoil_values/Recoil_selector');
  ({
    stringAtom,
    asyncSelector,
    flushPromisesAndTimers,
    renderElements,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  ({reactMode} = require('../../core/Recoil_ReactMode'));
  ({
    useRecoilState,
    useRecoilState_TRANSITION_SUPPORT_UNSTABLE,
    useRecoilValue,
    useRecoilValue_TRANSITION_SUPPORT_UNSTABLE,
    useRecoilValueLoadable,
    useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE,
    useSetRecoilState,
  } = require('../Recoil_Hooks'));
});

testRecoil('useRecoilValue_TRANSITION_SUPPORT_UNSTABLE', async () => {
  if (!reactMode().early) {
    return;
  }
  const myAtom = stringAtom();
  const [mySelector, resolve] = asyncSelector<string, _>();
  let setAtom;
  function Component() {
    setAtom = useSetRecoilState(myAtom);
    return [
      useRecoilValue(myAtom),
      useRecoilValue_TRANSITION_SUPPORT_UNSTABLE(myAtom),
      useRecoilValue(mySelector),
      useRecoilValue_TRANSITION_SUPPORT_UNSTABLE(mySelector),
    ].join(' ');
  }
  const c = renderElements(<Component />);
  expect(c.textContent).toBe('loading');

  act(() => resolve('RESOLVE'));
  await flushPromisesAndTimers();
  expect(c.textContent).toBe('DEFAULT DEFAULT RESOLVE RESOLVE');

  act(() => setAtom('SET'));
  expect(c.textContent).toBe('SET SET RESOLVE RESOLVE');
});

testRecoil('useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE', async () => {
  if (!reactMode().early) {
    return;
  }
  const myAtom = stringAtom();
  const [mySelector, resolve] = asyncSelector<string, _>();
  let setAtom;
  function Component() {
    setAtom = useSetRecoilState(myAtom);
    return [
      useRecoilValueLoadable(myAtom).getValue(),
      useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE(myAtom).getValue(),
      useRecoilValueLoadable(mySelector).getValue(),
      useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE(mySelector).getValue(),
    ].join(' ');
  }
  const c = renderElements(<Component />);
  expect(c.textContent).toBe('loading');

  act(() => resolve('RESOLVE'));
  await flushPromisesAndTimers();
  expect(c.textContent).toBe('DEFAULT DEFAULT RESOLVE RESOLVE');

  act(() => setAtom('SET'));
  expect(c.textContent).toBe('SET SET RESOLVE RESOLVE');
});

testRecoil('useRecoilState_TRANSITION_SUPPORT_UNSTABLE', async () => {
  if (!reactMode().early) {
    return;
  }
  const myAtom = stringAtom();
  const [myAsyncSelector, resolve] = asyncSelector<string, _>();
  // $FlowFixMe[incompatible-call]
  const mySelector = selector({
    key: 'useRecoilState_TRANSITION_SUPPORT_UNSTABLE selector',
    get: () => myAsyncSelector,
    // $FlowFixMe[incompatible-call]
    set: ({set}, newValue) => set(myAtom, newValue),
  });
  let setAtom, setSelector;
  function Component() {
    const [v1] = useRecoilState(myAtom);
    const [v2, setAtomValue] =
      useRecoilState_TRANSITION_SUPPORT_UNSTABLE(myAtom);
    setAtom = setAtomValue;
    const [v3] = useRecoilState(mySelector);
    const [v4, setSelectorValue] =
      useRecoilState_TRANSITION_SUPPORT_UNSTABLE(mySelector);
    setSelector = setSelectorValue;
    return [v1, v2, v3, v4].join(' ');
  }
  const c = renderElements(<Component />);
  expect(c.textContent).toBe('loading');

  act(() => resolve('RESOLVE'));
  await flushPromisesAndTimers();
  expect(c.textContent).toBe('DEFAULT DEFAULT RESOLVE RESOLVE');

  act(() => setAtom('SET'));
  expect(c.textContent).toBe('SET SET RESOLVE RESOLVE');

  act(() => setSelector('SETS'));
  expect(c.textContent).toBe('SETS SETS RESOLVE RESOLVE');
});
