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

import type {
  RecoilState,
  RecoilValue,
  RecoilValueReadOnly,
} from '../../core/Recoil_RecoilValue';
import type {PersistenceSettings} from '../../recoil_values/Recoil_atom';
import type {NodeKey} from 'Recoil_Keys';
import type {Node} from 'react';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let React,
  useState,
  act,
  atom,
  selector,
  ReadsAtom,
  flushPromisesAndTimers,
  renderElements,
  renderUnwrappedElements,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
  useSetUnvalidatedAtomValues,
  useTransactionObservation_DEPRECATED;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({useState} = require('react'));
  ({act} = require('ReactTestUtils'));

  atom = require('../../recoil_values/Recoil_atom');
  selector = require('../../recoil_values/Recoil_selector');
  ({
    ReadsAtom,
    flushPromisesAndTimers,
    renderElements,
    renderUnwrappedElements,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  ({
    useRecoilState,
    useRecoilValue,
    useSetRecoilState,
    useSetUnvalidatedAtomValues,
  } = require('../Recoil_Hooks'));
  ({useTransactionObservation_DEPRECATED} = require('../Recoil_SnapshotHooks'));
});

let nextID = 0;

function counterAtom(persistence?: PersistenceSettings<number>) {
  return atom({
    key: `atom${nextID++}`,
    default: 0,
    persistence_UNSTABLE: persistence,
  });
}

function plusOneSelector(dep: RecoilValue<number>) {
  const fn = jest.fn(x => x + 1);
  const sel = selector({
    key: `selector${nextID++}`,
    get: ({get}) => fn(get(dep)),
  });
  return [sel, fn];
}

function plusOneAsyncSelector(
  dep: RecoilValue<number>,
): [RecoilValueReadOnly<number>, (number) => void] {
  let nextTimeoutAmount = 100;
  const fn = jest.fn(x => {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(x + 1);
      }, nextTimeoutAmount);
    });
  });
  const sel = selector({
    key: `selector${nextID++}`,
    get: ({get}) => fn(get(dep)),
  });
  return [
    // $FlowFixMe[incompatible-return]
    sel,
    x => {
      nextTimeoutAmount = x;
    },
  ];
}

function componentThatWritesAtom<T>(
  recoilState: RecoilState<T>,
  // flowlint-next-line unclear-type:off
): [any, ((T => T) | T) => void] {
  let updateValue;
  const Component = jest.fn(() => {
    updateValue = useSetRecoilState(recoilState);
    return null;
  });
  // flowlint-next-line unclear-type:off
  return [(Component: any), x => updateValue(x)];
}

/* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
 * LTI update could not be added via codemod */
function ObservesTransactions({fn}) {
  useTransactionObservation_DEPRECATED(fn);
  return null;
}

testRecoil(
  'useTransactionObservation_DEPRECATED: Transaction dirty atoms are set',
  async () => {
    const anAtom = counterAtom({
      type: 'url',
      validator: x => (x: any), // flowlint-line unclear-type:off
    });
    const [aSelector, _] = plusOneSelector(anAtom);
    // $FlowFixMe[incompatible-call]
    const [anAsyncSelector, __] = plusOneAsyncSelector(aSelector);
    const [Component, updateValue] = componentThatWritesAtom(anAtom);
    const modifiedAtomsList = [];
    renderElements(
      <>
        <Component />
        <ReadsAtom atom={aSelector} />
        <React.Suspense fallback="loading">
          <ReadsAtom atom={anAsyncSelector} />
        </React.Suspense>
        <ObservesTransactions
          fn={({modifiedAtoms}) => {
            modifiedAtomsList.push(modifiedAtoms);
          }}
        />
      </>,
    );

    await flushPromisesAndTimers();
    await flushPromisesAndTimers();
    act(() => updateValue(1));
    await flushPromisesAndTimers();
    expect(modifiedAtomsList.length).toBe(3);
    expect(modifiedAtomsList[1].size).toBe(1);
    expect(modifiedAtomsList[1].has(anAtom.key)).toBe(true);
    for (const modifiedAtoms of modifiedAtomsList) {
      expect(modifiedAtoms.has(aSelector.key)).toBe(false);
      expect(modifiedAtoms.has(anAsyncSelector.key)).toBe(false);
    }
  },
);

testRecoil(
  'Can restore persisted values before atom def code is loaded',
  () => {
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
      const [value] = useRecoilState((getAtom(): any)); // flowlint-line unclear-type:off
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
        new Map<NodeKey, mixed>().set('notDefinedYetAtom', 123),
      );
    });
    const validator = jest.fn(() => 789);
    // $FlowFixMe[incompatible-call]
    theAtom = atom({
      key: 'notDefinedYetAtom',
      default: 456,
      persistence_UNSTABLE: {
        type: 'url',
        validator,
      },
    });
    act(() => {
      setVisible(true);
    });
    // $FlowFixMe[invalid-tuple-index]
    expect(validator.mock.calls[0][0]).toBe(123);
    expect(container.textContent).toBe('789');
  },
);

testRecoil(
  'useTransactionObservation_DEPRECATED: Nonvalidated atoms are included in transaction observation',
  () => {
    const anAtom = counterAtom({
      type: 'url',
      validator: x => (x: any), // flowlint-line unclear-type:off
    });

    const [Component, updateValue] = componentThatWritesAtom(anAtom);

    let setUnvalidatedAtomValues;
    function SetsUnvalidatedAtomValues() {
      setUnvalidatedAtomValues = useSetUnvalidatedAtomValues();
      return null;
    }

    let values: Map<NodeKey, mixed> = new Map();
    renderElements(
      <>
        <Component />
        <SetsUnvalidatedAtomValues />
        <ObservesTransactions
          fn={({atomValues}) => {
            values = atomValues;
          }}
        />
      </>,
    );
    act(() => {
      setUnvalidatedAtomValues(
        new Map<NodeKey, mixed>().set('someNonvalidatedAtom', 123),
      );
    });
    values = new Map();
    act(() => updateValue(1));
    expect(values.size).toBe(2);
    expect(values.get('someNonvalidatedAtom')).toBe(123);
  },
);

testRecoil('Hooks cannot be used outside of RecoilRoot', () => {
  const myAtom = atom({key: 'hook outside RecoilRoot', default: 'INVALID'});
  function Test() {
    useRecoilValue(myAtom);
    return 'TEST';
  }

  // Make sure there is a friendly error message mentioning <RecoilRoot>
  expect(() => renderUnwrappedElements(<Test />)).toThrow('<RecoilRoot>');
});
