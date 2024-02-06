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
import type {RecoilInterface} from 'Recoil_Hooks';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let React,
  useRef,
  useState,
  act,
  atom,
  counterAtom,
  renderElements,
  useRecoilInterface;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({useRef, useState} = require('react'));
  ({act} = require('ReactTestUtils'));

  atom = require('../../recoil_values/Recoil_atom');
  ({
    renderElements,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  ({useRecoilInterface} = require('../Recoil_Hooks'));

  counterAtom = atom({
    key: `counterAtom`,
    default: 0,
  });
});

testRecoil('Interface for non-react code - useRecoilState', () => {
  function nonReactCode(recoilInterface: RecoilInterface) {
    return recoilInterface.getRecoilState(counterAtom);
  }

  let updateValue;
  const Component = () => {
    const recoilInterface = useRecoilInterface();
    const [value, _updateValue] = nonReactCode(recoilInterface);
    updateValue = _updateValue;
    return value;
  };

  const container = renderElements(<Component />);
  expect(container.textContent).toEqual('0');
  act(() => updateValue(1));
  expect(container.textContent).toEqual('1');
});

testRecoil('Interface for non-react code - useRecoilStateNoThrow', () => {
  function nonReactCode(recoilInterface: RecoilInterface) {
    const [loadable, setValue] =
      recoilInterface.getRecoilStateLoadable(counterAtom);
    const value = loadable.state === 'hasValue' ? loadable.contents : null;
    return [value, setValue];
  }

  let updateValue;
  const Component = () => {
    const recoilInterface = useRecoilInterface();
    const [value, _updateValue] = nonReactCode(recoilInterface);
    updateValue = _updateValue;
    return value;
  };

  const container = renderElements(<Component />);
  expect(container.textContent).toEqual('0');
  act(() => updateValue(1));
  expect(container.textContent).toEqual('1');
});

testRecoil(
  'Interface for non-react code - useRecoilValue, useSetRecoilState',
  () => {
    function nonReactCode(recoilInterface: RecoilInterface) {
      return [
        recoilInterface.getRecoilValue(counterAtom),
        recoilInterface.getSetRecoilState(counterAtom),
      ];
    }

    let updateValue;
    const Component = () => {
      const recoilInterface = useRecoilInterface();
      const [value, _updateValue] = nonReactCode(recoilInterface);
      updateValue = _updateValue;
      return value;
    };

    const container = renderElements(<Component />);
    expect(container.textContent).toEqual('0');
    act(() => updateValue(1));
    expect(container.textContent).toEqual('1');
  },
);

testRecoil('Interface for non-react code - useRecoilValueNoThrow', () => {
  function nonReactCode(recoilInterface: RecoilInterface) {
    const value = recoilInterface
      .getRecoilValueLoadable(counterAtom)
      .valueMaybe();
    const setValue = recoilInterface.getSetRecoilState(counterAtom);
    return [value, setValue];
  }

  let updateValue;
  const Component = () => {
    const recoilInterface = useRecoilInterface();
    const [value, _updateValue] = nonReactCode(recoilInterface);
    updateValue = _updateValue;
    return value;
  };

  const container = renderElements(<Component />);
  expect(container.textContent).toEqual('0');
  act(() => updateValue(1));
  expect(container.textContent).toEqual('1');
});

// Test that we always get a consistent instance of the interface object and
// hooks from useRecoilInterface() (at least for a given <AppRoot> store)
testRecoil('Consistent interface object', () => {
  let setValue;
  const Component = () => {
    const [value, _setValue] = useState(0);
    const recoilInterface = useRecoilInterface();
    const recoilInterfaceRef = useRef(recoilInterface);
    expect(recoilInterface).toBe(recoilInterfaceRef.current);
    expect(recoilInterface.getRecoilState).toBe(recoilInterface.getRecoilState);
    setValue = _setValue;
    return value;
  };
  const out = renderElements(<Component />);
  expect(out.textContent).toBe('0');
  act(() => setValue(1)); // Force a re-render of the Component
  expect(out.textContent).toBe('1');
});
