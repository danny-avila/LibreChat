/**
 * (c) Meta Platforms, Inc. and affiliates. Confidential and proprietary.
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
  atom,
  selector,
  renderElements,
  useRecoilValue,
  useSetRecoilState,
  useRecoilRefresher;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({act} = require('ReactTestUtils'));
  atom = require('../../recoil_values/Recoil_atom');
  selector = require('../../recoil_values/Recoil_selector');
  ({
    renderElements,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  useRecoilRefresher = require('../Recoil_useRecoilRefresher');
  ({useRecoilValue, useSetRecoilState} = require('../Recoil_Hooks'));
});

testRecoil('useRecoilRefresher - no-op for atom', async () => {
  const myAtom = atom({
    key: 'useRecoilRefresher no-op',
    default: 'default',
  });

  let refresh;
  function Component() {
    const value = useRecoilValue(myAtom);
    refresh = useRecoilRefresher(myAtom);
    return value;
  }

  const container = renderElements(<Component />);
  expect(container.textContent).toBe('default');
  act(() => refresh());
  expect(container.textContent).toBe('default');
});

testRecoil('useRecoilRefresher - re-executes selector', async () => {
  let i = 0;
  const myselector = selector({
    key: 'useRecoilRefresher re-execute',
    get: () => i++,
  });

  let refresh;
  function Component() {
    const value = useRecoilValue(myselector);
    refresh = useRecoilRefresher(myselector);
    return value;
  }

  const container = renderElements(<Component />);
  expect(container.textContent).toBe('0');
  act(() => refresh());
  expect(container.textContent).toBe('1');
});

testRecoil('useRecoilRefresher - clears entire cache', async () => {
  const myatom = atom({
    key: 'useRecoilRefresher entire cache atom',
    default: 'a',
  });

  let i = 0;
  // $FlowFixMe[incompatible-call]
  const myselector = selector({
    key: 'useRecoilRefresher entire cache selector',
    get: ({get}) => [get(myatom), i++],
  });

  let setMyAtom;
  let refresh;
  function Component() {
    const [atomValue, iValue] = useRecoilValue(myselector);
    refresh = useRecoilRefresher(myselector);
    setMyAtom = useSetRecoilState(myatom);
    return `${atomValue}-${iValue}`;
  }

  const container = renderElements(<Component />);
  expect(container.textContent).toBe('a-0');

  act(() => setMyAtom('b'));
  expect(container.textContent).toBe('b-1');

  act(() => refresh());
  expect(container.textContent).toBe('b-2');

  act(() => setMyAtom('a'));
  expect(container.textContent).toBe('a-3');
});

testRecoil('useRecoilRefresher - clears ancestor selectors', async () => {
  const getA = jest.fn(() => 'A');
  // $FlowFixMe[incompatible-call]
  const selectorA = selector({
    key: 'useRecoilRefresher ancestors A',
    get: getA,
  });

  const getB = jest.fn(({get}) => get(selectorA) + 'B');
  const selectorB = selector({
    key: 'useRecoilRefresher ancestors B',
    get: getB,
  });

  const getC = jest.fn(({get}) => get(selectorB) + 'C');
  const selectorC = selector({
    key: 'useRecoilRefresher ancestors C',
    get: getC,
  });

  let refresh;
  function Component() {
    refresh = useRecoilRefresher(selectorC);
    return useRecoilValue(selectorC);
  }

  const container = renderElements(<Component />);
  expect(container.textContent).toBe('ABC');
  expect(getC).toHaveBeenCalledTimes(1);
  expect(getB).toHaveBeenCalledTimes(1);
  expect(getA).toHaveBeenCalledTimes(1);

  act(() => refresh());
  expect(container.textContent).toBe('ABC');
  expect(getC).toHaveBeenCalledTimes(2);
  expect(getB).toHaveBeenCalledTimes(2);
  expect(getA).toHaveBeenCalledTimes(2);
});
