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
  useState,
  flushSync,
  act,
  atom,
  renderElements,
  useRecoilState,
  reactMode;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({useState} = require('react'));
  // @fb-only: ({flushSync} = require('ReactDOMComet'));
  ({flushSync} = require('react-dom')); // @oss-only
  ({act} = require('ReactTestUtils'));

  atom = require('../../recoil_values/Recoil_atom');
  ({
    renderElements,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  ({reactMode} = require('../../core/Recoil_ReactMode'));
  ({useRecoilState} = require('../Recoil_Hooks'));
});

testRecoil('Sync React and Recoil state changes', ({gks}) => {
  if (
    reactMode().mode === 'MUTABLE_SOURCE' &&
    !gks.includes('recoil_suppress_rerender_in_callback')
  ) {
    return;
  }

  const myAtom = atom({key: 'sync react recoil', default: 0});

  let setReact, setRecoil;
  function Component() {
    const [reactState, setReactState] = useState(0);
    const [recoilState, setRecoilState] = useRecoilState(myAtom);
    setReact = setReactState;
    setRecoil = setRecoilState;

    expect(reactState).toBe(recoilState);

    return `${reactState} - ${recoilState}`;
  }

  const c = renderElements(<Component />);
  expect(c.textContent).toBe('0 - 0');

  // Set both React and Recoil state in the same batch and ensure the component
  // render always seems consistent picture of both state changes.
  act(() => {
    flushSync(() => {
      setReact(1);
      setRecoil(1);
    });
  });
  expect(c.textContent).toBe('1 - 1');
});

testRecoil('React and Recoil state change ordering', ({gks}) => {
  if (
    reactMode().mode === 'MUTABLE_SOURCE' &&
    !gks.includes('recoil_suppress_rerender_in_callback')
  ) {
    return;
  }

  const myAtom = atom({key: 'sync react recoil', default: 0});

  let setReact, setRecoil;
  function Component() {
    const [reactState, setReactState] = useState(0);
    const [recoilState, setRecoilState] = useRecoilState(myAtom);
    setReact = setReactState;
    setRecoil = setRecoilState;

    // State changes may not be atomic.  However, render functions should
    // still see state changes in the order in which they were made.
    expect(reactState).toBeGreaterThanOrEqual(recoilState);

    return `${reactState} - ${recoilState}`;
  }

  const c = renderElements(<Component />);
  expect(c.textContent).toBe('0 - 0');

  // Test that changing React state before Recoil is seen in order
  act(() => {
    setReact(1);
    setRecoil(1);
  });
  expect(c.textContent).toBe('1 - 1');

  // Test that changing Recoil state before React is seen in order
  act(() => {
    setRecoil(0);
    setReact(0);
  });
  expect(c.textContent).toBe('0 - 0');
});
