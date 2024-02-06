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
  act,
  freshSnapshot,
  useGotoRecoilSnapshot,
  useRecoilCallback,
  useRecoilValue,
  atom,
  constSelector,
  selector,
  ReadsAtom,
  asyncSelector,
  componentThatReadsAndWritesAtom,
  flushPromisesAndTimers,
  renderElements;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({useState} = require('react'));
  ({act} = require('ReactTestUtils'));

  ({freshSnapshot} = require('../../core/Recoil_Snapshot'));
  ({useRecoilValue} = require('../../hooks/Recoil_Hooks'));
  ({useGotoRecoilSnapshot} = require('../../hooks/Recoil_SnapshotHooks'));
  ({useRecoilCallback} = require('../../hooks/Recoil_useRecoilCallback'));
  atom = require('../../recoil_values/Recoil_atom');
  constSelector = require('../../recoil_values/Recoil_constSelector');
  selector = require('../../recoil_values/Recoil_selector');
  ({
    ReadsAtom,
    asyncSelector,
    componentThatReadsAndWritesAtom,
    flushPromisesAndTimers,
    renderElements,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
});

testRecoil('Goto mapped snapshot', async () => {
  const snapshot = freshSnapshot();
  snapshot.retain();

  const myAtom = atom({
    key: 'Goto Snapshot Atom',
    default: 'DEFAULT',
  });
  const [ReadsAndWritesAtom, setAtom] = componentThatReadsAndWritesAtom(myAtom);

  const mySelector = constSelector(myAtom);

  const updatedSnapshot = snapshot.map(({set}) => {
    set(myAtom, 'SET IN SNAPSHOT');
  });
  updatedSnapshot.retain();

  let gotoRecoilSnapshot;
  function GotoRecoilSnapshot() {
    gotoRecoilSnapshot = useGotoRecoilSnapshot();
    return null;
  }

  const c = renderElements(
    <>
      <ReadsAndWritesAtom />
      <ReadsAtom atom={mySelector} />
      <GotoRecoilSnapshot />
    </>,
  );

  expect(c.textContent).toEqual('"DEFAULT""DEFAULT"');

  act(() => setAtom('SET IN CURRENT'));
  expect(c.textContent).toEqual('"SET IN CURRENT""SET IN CURRENT"');

  await expect(updatedSnapshot.getPromise(myAtom)).resolves.toEqual(
    'SET IN SNAPSHOT',
  );

  act(() => gotoRecoilSnapshot(updatedSnapshot));
  expect(c.textContent).toEqual('"SET IN SNAPSHOT""SET IN SNAPSHOT"');

  act(() => setAtom('SET AGAIN IN CURRENT'));
  expect(c.textContent).toEqual('"SET AGAIN IN CURRENT""SET AGAIN IN CURRENT"');

  // Test that atoms set after snapshot were created are reset
  act(() => gotoRecoilSnapshot(snapshot));
  expect(c.textContent).toEqual('"DEFAULT""DEFAULT"');
});

testRecoil('Goto callback snapshot', () => {
  const myAtom = atom({
    key: 'Goto Snapshot From Callback',
    default: 'DEFAULT',
  });
  const [ReadsAndWritesAtom, setAtom] = componentThatReadsAndWritesAtom(myAtom);

  const mySelector = constSelector(myAtom);

  let cb;
  function RecoilCallback() {
    const gotoSnapshot = useGotoRecoilSnapshot();
    cb = useRecoilCallback(({snapshot}) => () => {
      const updatedSnapshot = snapshot.map(({set}) => {
        set(myAtom, 'SET IN SNAPSHOT');
      });
      gotoSnapshot(updatedSnapshot);
    });
    return null;
  }

  const c = renderElements(
    <>
      <ReadsAndWritesAtom />
      <ReadsAtom atom={mySelector} />
      <RecoilCallback />
    </>,
  );

  expect(c.textContent).toEqual('"DEFAULT""DEFAULT"');

  act(() => setAtom('SET IN CURRENT'));
  expect(c.textContent).toEqual('"SET IN CURRENT""SET IN CURRENT"');

  act(cb);
  expect(c.textContent).toEqual('"SET IN SNAPSHOT""SET IN SNAPSHOT"');
});

testRecoil('Goto snapshot with dependent async selector', async () => {
  const snapshot = freshSnapshot();
  snapshot.retain();

  const myAtom = atom({
    key: 'atom for dep async snapshot',
    default: 'DEFAULT',
  });
  const [ReadsAndWritesAtom, setAtom] = componentThatReadsAndWritesAtom(myAtom);
  // $FlowFixMe[incompatible-call]
  const mySelector = selector({
    key: 'selector for async snapshot',
    get: ({get}) => {
      const dep = get(myAtom);
      return Promise.resolve(dep);
    },
  });

  const updatedSnapshot = snapshot.map(({set}) => {
    set(myAtom, 'SET IN SNAPSHOT');
  });
  updatedSnapshot.retain();

  let gotoRecoilSnapshot;
  function GotoRecoilSnapshot() {
    gotoRecoilSnapshot = useGotoRecoilSnapshot();
    return null;
  }

  const c = renderElements(
    <>
      <ReadsAndWritesAtom />
      <ReadsAtom atom={mySelector} />
      <GotoRecoilSnapshot />
    </>,
  );

  expect(c.textContent).toEqual('loading');
  await flushPromisesAndTimers();
  await flushPromisesAndTimers();
  expect(c.textContent).toEqual('"DEFAULT""DEFAULT"');

  act(() => setAtom('SET IN CURRENT'));

  await flushPromisesAndTimers();
  expect(c.textContent).toEqual('"SET IN CURRENT""SET IN CURRENT"');

  await expect(updatedSnapshot.getPromise(myAtom)).resolves.toEqual(
    'SET IN SNAPSHOT',
  );
  act(() => gotoRecoilSnapshot(updatedSnapshot));
  await flushPromisesAndTimers();
  expect(c.textContent).toEqual('"SET IN SNAPSHOT""SET IN SNAPSHOT"');
});

testRecoil('Goto snapshot with async selector', async () => {
  const snapshot = freshSnapshot();
  snapshot.retain();

  const [mySelector, resolve] = asyncSelector<string, _>();

  let gotoRecoilSnapshot;
  function GotoRecoilSnapshot() {
    gotoRecoilSnapshot = useGotoRecoilSnapshot();
    return null;
  }

  const c = renderElements(
    <>
      <ReadsAtom atom={mySelector} />
      <GotoRecoilSnapshot />
    </>,
  );

  expect(c.textContent).toEqual('loading');

  act(() => resolve('RESOLVE'));
  await flushPromisesAndTimers();
  await flushPromisesAndTimers();
  expect(c.textContent).toEqual('"RESOLVE"');

  act(() => gotoRecoilSnapshot(snapshot));
  expect(c.textContent).toEqual('"RESOLVE"');
});

// Test that going to a snapshot where an atom was not yet initialized will
// not cause the atom to be re-initialized when used again.
testRecoil(
  'Effects going to previous snapshot',
  ({strictMode, concurrentMode}) => {
    const sm = strictMode && concurrentMode ? 2 : 1;

    let init = 0;
    const myAtom = atom({
      key: 'gotoSnapshot effect',
      default: 'DEFAULT',
      effects: [
        () => {
          init++;
        },
      ],
    });

    let forceUpdate;
    function ReadAtom() {
      const [_, setValue] = useState<{}>({});
      forceUpdate = () => setValue({});
      return useRecoilValue(myAtom);
    }

    let gotoRecoilSnapshot;
    function GotoRecoilSnapshot() {
      gotoRecoilSnapshot = useGotoRecoilSnapshot();
      return null;
    }

    expect(init).toEqual(0);

    renderElements(
      <>
        <ReadAtom />
        <GotoRecoilSnapshot />
      </>,
    );

    expect(init).toEqual(1 * sm);
    act(forceUpdate);
    expect(init).toEqual(1 * sm);

    act(() => gotoRecoilSnapshot?.(freshSnapshot()));
    expect(init).toEqual(1 * sm);
    act(forceUpdate);
    expect(init).toEqual(1 * sm);

    act(forceUpdate);
    expect(init).toEqual(1 * sm);
  },
);
