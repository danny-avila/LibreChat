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
import type {Store} from '../../core/Recoil_State';
import type {NodeKey} from 'Recoil_Keys';
import type {RecoilState} from 'Recoil_RecoilValue';
import type {Node} from 'react';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let React,
  useState,
  act,
  getRecoilValueAsLoadable,
  setRecoilValue,
  subscribeToRecoilValue,
  useRecoilState,
  useSetUnvalidatedAtomValues,
  componentThatReadsAndWritesAtom,
  renderElements,
  atom,
  constSelector,
  store: Store;

let fallbackAtom: RecoilValue<number>, hasFallbackAtom: RecoilValue<number>;

let id = 0;

const testRecoil = getRecoilTestFn(() => {
  const {
    makeStore,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

  React = require('react');
  ({useState} = require('react'));
  ({act} = require('ReactTestUtils'));

  ({
    getRecoilValueAsLoadable,
    setRecoilValue,
    subscribeToRecoilValue,
  } = require('../../core/Recoil_RecoilValueInterface'));
  ({
    useRecoilState,
    useSetUnvalidatedAtomValues,
  } = require('../../hooks/Recoil_Hooks'));
  ({
    componentThatReadsAndWritesAtom,
    renderElements,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  atom = require('../Recoil_atom');
  constSelector = require('../Recoil_constSelector');

  store = makeStore();
  fallbackAtom = atom<number>({key: `fallback${id}`, default: 1});
  hasFallbackAtom = atom<number>({
    key: `hasFallback${id++}`,
    default: fallbackAtom,
  });
  subscribeToRecoilValue(store, hasFallbackAtom, () => undefined);
});

function get(
  recoilValue: RecoilState<string> | RecoilState<?string> | RecoilValue<number>,
) {
  return getRecoilValueAsLoadable(store, recoilValue).contents;
}

function set(
  recoilValue: RecoilState<?string> | RecoilValue<number>,
  value: ?(number | $TEMPORARY$string<'VALUE'>),
) {
  setRecoilValue(store, recoilValue, value);
}

testRecoil('atomWithFallback', () => {
  expect(get(hasFallbackAtom)).toBe(1);
  set(fallbackAtom, 2);
  expect(get(hasFallbackAtom)).toBe(2);
  set(hasFallbackAtom, 3);
  expect(get(hasFallbackAtom)).toBe(3);
});

describe('ReturnDefaultOrFallback', () => {
  testRecoil('Returns the default', () => {
    let theAtom = null;
    let setUnvalidatedAtomValues;
    function SetsUnvalidatedAtomValues() {
      setUnvalidatedAtomValues = useSetUnvalidatedAtomValues();
      return null;
    }
    let setVisible;
    function Switch({children}: $TEMPORARY$object<{children: Node}>) {
      const [visible, mySetVisible] = useState(false);
      setVisible = mySetVisible;
      return visible ? children : null;
    }
    function MyReadsAtom({
      getAtom,
    }: $TEMPORARY$object<{getAtom: () => null | RecoilState<number>}>) {
      // flowlint-next-line unclear-type:off
      const [value] = useRecoilState((getAtom(): any));
      return value;
    }
    const container = renderElements(
      <>
        <SetsUnvalidatedAtomValues />
        <Switch>
          <MyReadsAtom getAtom={() => theAtom} />
        </Switch>
      </>,
    );
    act(() => {
      setUnvalidatedAtomValues(
        new Map<NodeKey, mixed>().set('notDefinedYetAtomValidator', 123),
      );
    });
    theAtom = atom({
      key: 'notDefinedYetAtomValidator',
      default: 456,
      persistence_UNSTABLE: {
        type: 'url',
        validator: (_, returnFallback) => returnFallback,
      },
    });
    act(() => {
      setVisible(true);
    });
    expect(container.textContent).toBe('456');
  });

  testRecoil('Returns the fallback', () => {
    let theAtom = null;
    let setUnvalidatedAtomValues;
    function SetsUnvalidatedAtomValues() {
      setUnvalidatedAtomValues = useSetUnvalidatedAtomValues();
      return null;
    }
    let setVisible;
    function Switch({children}: $TEMPORARY$object<{children: Node}>) {
      const [visible, mySetVisible] = useState(false);
      setVisible = mySetVisible;
      return visible ? children : null;
    }
    function MyReadsAtom({
      getAtom,
    }: $TEMPORARY$object<{getAtom: () => null | RecoilState<number>}>) {
      // flowlint-next-line unclear-type:off
      const [value] = useRecoilState((getAtom(): any));
      return value;
    }
    const container = renderElements(
      <>
        <SetsUnvalidatedAtomValues />
        <Switch>
          <MyReadsAtom getAtom={() => theAtom} />
        </Switch>
      </>,
    );
    act(() => {
      setUnvalidatedAtomValues(
        new Map<NodeKey, mixed>().set('notDefinedYetAtomWithFallback', 123),
      );
    });
    const fallback = atom<number>({
      key: 'notDefinedYetAtomFallback',
      default: 222,
    });
    theAtom = atom({
      key: 'notDefinedYetAtomWithFallback',
      default: fallback,
      persistence_UNSTABLE: {
        type: 'url',
        validator: (_, returnFallback) => returnFallback,
      },
    });
    act(() => {
      setVisible(true);
    });
    expect(container.textContent).toBe('222');
  });
});

testRecoil('Atom with atom fallback can store null and undefined', () => {
  const myFallbackAtom = atom<?string>({
    key: 'fallback for null undefined',
    default: 'FALLBACK',
  });
  const myAtom = atom<?string>({
    key: 'fallback atom with undefined',
    default: myFallbackAtom,
  });
  expect(get(myAtom)).toBe('FALLBACK');
  act(() => set(myAtom, 'VALUE'));
  expect(get(myAtom)).toBe('VALUE');
  act(() => set(myAtom, null));
  expect(get(myAtom)).toBe(null);
  act(() => set(myAtom, undefined));
  expect(get(myAtom)).toBe(undefined);
  act(() => set(myAtom, 'VALUE'));
  expect(get(myAtom)).toBe('VALUE');
});

testRecoil('Atom with selector fallback can store null and undefined', () => {
  const fallbackSelector = constSelector('FALLBACK');
  const myAtom = atom<?string>({
    key: 'fallback selector with undefined',
    default: fallbackSelector,
  });
  expect(get(myAtom)).toBe('FALLBACK');
  act(() => set(myAtom, 'VALUE'));
  expect(get(myAtom)).toBe('VALUE');
  act(() => set(myAtom, null));
  expect(get(myAtom)).toBe(null);
  act(() => set(myAtom, undefined));
  expect(get(myAtom)).toBe(undefined);
  act(() => set(myAtom, 'VALUE'));
  expect(get(myAtom)).toBe('VALUE');
});

testRecoil('Effects', () => {
  let inited = false;
  const myFallbackAtom = atom({
    key: 'atom with fallback effects init fallback',
    default: 'FALLBACK',
  });
  const myAtom = atom<string>({
    key: 'atom with fallback effects init',
    default: myFallbackAtom,
    effects: [
      ({setSelf}) => {
        inited = true;
        setSelf('INIT');
      },
    ],
  });

  expect(get(myAtom)).toEqual('INIT');
  expect(inited).toEqual(true);

  const [ReadsWritesAtom, _, reset] = componentThatReadsAndWritesAtom(myAtom);
  const c = renderElements(<ReadsWritesAtom />);
  expect(c.textContent).toEqual('"INIT"');

  act(reset);
  expect(c.textContent).toEqual('"FALLBACK"');
});
