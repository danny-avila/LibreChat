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

import type {Snapshot} from '../Recoil_Snapshot';
import type {StateID} from 'Recoil_Keys';
import type {RecoilState, RecoilValueReadOnly} from 'Recoil_RecoilValue';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let React,
  act,
  useState,
  useGotoRecoilSnapshot,
  useRecoilTransactionObserver,
  atom,
  constSelector,
  selector,
  ReadsAtom,
  flushPromisesAndTimers,
  asyncSelector,
  componentThatReadsAndWritesAtom,
  renderElements,
  freshSnapshot,
  RecoilRoot;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({useState} = React);
  ({act} = require('ReactTestUtils'));

  ({
    useGotoRecoilSnapshot,
    useRecoilTransactionObserver,
  } = require('../../hooks/Recoil_SnapshotHooks'));
  atom = require('../../recoil_values/Recoil_atom');
  constSelector = require('../../recoil_values/Recoil_constSelector');
  selector = require('../../recoil_values/Recoil_selector');
  ({
    ReadsAtom,
    flushPromisesAndTimers,
    asyncSelector,
    componentThatReadsAndWritesAtom,
    renderElements,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  ({freshSnapshot} = require('../Recoil_Snapshot'));
  ({RecoilRoot} = require('../Recoil_RecoilRoot'));
});

// Use this to spread proxy results into an object for Jest's toMatchObject()
function getInfo(
  snapshot: Snapshot,
  node: RecoilState<string> | RecoilValueReadOnly<string>,
) {
  return {...snapshot.getInfo_UNSTABLE(node)};
}

// Test first since we are testing all registered nodes
testRecoil('getNodes', () => {
  const snapshot = freshSnapshot();
  const {getNodes_UNSTABLE} = snapshot;
  expect(Array.from(getNodes_UNSTABLE()).length).toEqual(0);
  expect(Array.from(getNodes_UNSTABLE({isInitialized: true})).length).toEqual(
    0,
  );
  // expect(Array.from(getNodes_UNSTABLE({isSet: true})).length).toEqual(0);

  // Test atoms
  const myAtom = atom({key: 'snapshot getNodes atom', default: 'DEFAULT'});
  expect(Array.from(getNodes_UNSTABLE()).length).toEqual(1);
  expect(Array.from(getNodes_UNSTABLE({isInitialized: true})).length).toEqual(
    0,
  );
  expect(snapshot.getLoadable(myAtom).contents).toEqual('DEFAULT');
  const nodesAfterGet = Array.from(getNodes_UNSTABLE());
  expect(nodesAfterGet.length).toEqual(1);
  expect(nodesAfterGet[0]).toBe(myAtom);
  expect(snapshot.getLoadable(nodesAfterGet[0]).contents).toEqual('DEFAULT');

  // Test selectors
  // $FlowFixMe[incompatible-call]
  const mySelector = selector({
    key: 'snapshot getNodes selector',
    get: ({get}) => get(myAtom) + '-SELECTOR',
  });
  expect(Array.from(getNodes_UNSTABLE()).length).toEqual(2);
  expect(Array.from(getNodes_UNSTABLE({isInitialized: true})).length).toEqual(
    1,
  );
  expect(snapshot.getLoadable(mySelector).contents).toEqual('DEFAULT-SELECTOR');
  expect(Array.from(getNodes_UNSTABLE({isInitialized: true})).length).toEqual(
    2,
  );
  // expect(Array.from(getNodes_UNSTABLE({types: ['atom']})).length).toEqual(1);
  // const selectorNodes = Array.from(getNodes_UNSTABLE({types: ['selector']}));
  // expect(selectorNodes.length).toEqual(1);
  // expect(selectorNodes[0]).toBe(mySelector);

  // Test dirty atoms
  expect(Array.from(getNodes_UNSTABLE()).length).toEqual(2);
  // expect(Array.from(getNodes_UNSTABLE({isSet: true})).length).toEqual(0);
  expect(
    Array.from(snapshot.getNodes_UNSTABLE({isModified: true})).length,
  ).toEqual(0);
  const updatedSnapshot = snapshot.map(({set}) => set(myAtom, 'SET'));
  expect(
    Array.from(snapshot.getNodes_UNSTABLE({isModified: true})).length,
  ).toEqual(0);
  expect(
    Array.from(updatedSnapshot.getNodes_UNSTABLE({isModified: true})).length,
  ).toEqual(1);
  // expect(
  //   Array.from(snapshot.getNodes_UNSTABLE({isSet: true})).length,
  // ).toEqual(0);
  // expect(
  //   Array.from(updatedSnapshot.getNodes_UNSTABLE({isSet: true})).length,
  // ).toEqual(1);
  const dirtyAtom = Array.from(
    updatedSnapshot.getNodes_UNSTABLE({isModified: true}),
  )[0];
  expect(snapshot.getLoadable(dirtyAtom).contents).toEqual('DEFAULT');
  expect(updatedSnapshot.getLoadable(dirtyAtom).contents).toEqual('SET');

  // Test reset
  const resetSnapshot = updatedSnapshot.map(({reset}) => reset(myAtom));
  expect(
    Array.from(resetSnapshot.getNodes_UNSTABLE({isModified: true})).length,
  ).toEqual(1);
  // expect(
  //   Array.from(resetSnapshot.getNodes_UNSTABLE({isSet: true})).length,
  // ).toEqual(0);

  // TODO Test dirty selectors
});

testRecoil(
  'State ID after going to snapshot matches the ID of the snapshot',
  () => {
    const seenIDs = new Set<StateID>();
    const snapshots = [];
    let expectedSnapshotID = null;

    const myAtom = atom({key: 'Snapshot ID atom', default: 0});
    const mySelector = constSelector(myAtom); // For read-only testing below

    const transactionObserver = ({
      snapshot,
    }: {
      previousSnapshot: Snapshot,
      snapshot: Snapshot,
    }) => {
      const snapshotID = snapshot.getID();
      if (expectedSnapshotID != null) {
        expect(seenIDs.has(snapshotID)).toBe(true);
        expect(snapshotID).toBe(expectedSnapshotID);
      } else {
        expect(seenIDs.has(snapshotID)).toBe(false);
      }
      seenIDs.add(snapshotID);
      snapshot.retain();
      snapshots.push({snapshotID, snapshot});
    };
    function TransactionObserver() {
      useRecoilTransactionObserver(transactionObserver);
      return null;
    }

    let gotoSnapshot;
    function GotoSnapshot() {
      gotoSnapshot = useGotoRecoilSnapshot();
      return null;
    }

    const [WriteAtom, setAtom] = componentThatReadsAndWritesAtom(myAtom);
    const c = renderElements(
      <>
        <TransactionObserver />
        <GotoSnapshot />
        <WriteAtom />
        <ReadsAtom atom={mySelector} />
      </>,
    );
    expect(c.textContent).toBe('00');

    // Test changing state produces a new state version
    act(() => setAtom(1));
    act(() => setAtom(2));
    expect(snapshots.length).toBe(2);
    expect(seenIDs.size).toBe(2);

    // Test going to a previous snapshot re-uses the state ID
    expectedSnapshotID = snapshots[0].snapshotID;
    act(() => gotoSnapshot(snapshots[0].snapshot));

    // Test changing state after going to a previous snapshot uses a new version
    expectedSnapshotID = null;
    act(() => setAtom(3));

    // Test mutating a snapshot creates a new version
    const transactionSnapshot = snapshots[0].snapshot.map(({set}) => {
      set(myAtom, 4);
    });
    act(() => gotoSnapshot(transactionSnapshot));

    expect(seenIDs.size).toBe(4);
    expect(snapshots.length).toBe(5);

    // Test that added read-only selector doesn't cause an issue getting the
    // current version to see the current deps of the selector since we mutated a
    // state after going to a snapshot, so that version may not be known by the store.
    // If there was a problem, then the component may throw an error when evaluating the selector.
    expect(c.textContent).toBe('44');
  },
);

testRecoil('Read default loadable from snapshot', () => {
  const snapshot: Snapshot = freshSnapshot();

  const myAtom = atom({
    key: 'Snapshot Atom Default',
    default: 'DEFAULT',
  });

  const atomLoadable = snapshot.getLoadable(myAtom);
  expect(atomLoadable.state).toEqual('hasValue');
  expect(atomLoadable.contents).toEqual('DEFAULT');

  const mySelector = constSelector(myAtom);
  const selectorLoadable = snapshot.getLoadable(mySelector);
  expect(selectorLoadable.state).toEqual('hasValue');
  expect(selectorLoadable.contents).toEqual('DEFAULT');
});

testRecoil('Read async selector from snapshot', async () => {
  const snapshot = freshSnapshot();
  const otherA = freshSnapshot();
  const otherB = freshSnapshot();

  const [asyncSel, resolve] = asyncSelector<string, _>();
  const nestSel = constSelector(asyncSel);

  expect(snapshot.getLoadable(asyncSel).state).toEqual('loading');
  expect(snapshot.getLoadable(nestSel).state).toEqual('loading');
  expect(otherA.getLoadable(nestSel).state).toEqual('loading');
  const otherC = snapshot.map(() => {});

  // eslint-disable-next-line jest/valid-expect
  const ptest = expect(snapshot.getPromise(asyncSel)).resolves.toEqual(
    'SET VALUE',
  );

  act(() => resolve('SET VALUE'));
  await ptest;
  await expect(snapshot.getPromise(asyncSel)).resolves.toEqual('SET VALUE');
  expect(snapshot.getLoadable(asyncSel).contents).toEqual('SET VALUE');
  await expect(snapshot.getPromise(nestSel)).resolves.toEqual('SET VALUE');
  await expect(otherA.getPromise(nestSel)).resolves.toEqual('SET VALUE');
  await expect(otherB.getPromise(nestSel)).resolves.toEqual('SET VALUE');
  await expect(otherC.getPromise(nestSel)).resolves.toEqual('SET VALUE');
});

testRecoil('Sync map of snapshot', () => {
  const snapshot = freshSnapshot();

  const myAtom = atom({
    key: 'Snapshot Map Sync',
    default: 'DEFAULT',
  });
  const mySelector = constSelector(myAtom);

  const atomLoadable = snapshot.getLoadable(myAtom);
  expect(atomLoadable.state).toEqual('hasValue');
  expect(atomLoadable.contents).toEqual('DEFAULT');
  const selectorLoadable = snapshot.getLoadable(mySelector);
  expect(selectorLoadable.state).toEqual('hasValue');
  expect(selectorLoadable.contents).toEqual('DEFAULT');

  const setSnapshot = snapshot.map(({set}) => {
    set(myAtom, 'SET');
  });
  const setAtomLoadable = setSnapshot.getLoadable(myAtom);
  expect(setAtomLoadable.state).toEqual('hasValue');
  expect(setAtomLoadable.contents).toEqual('SET');
  const setSelectorLoadable = setSnapshot.getLoadable(myAtom);
  expect(setSelectorLoadable.state).toEqual('hasValue');
  expect(setSelectorLoadable.contents).toEqual('SET');

  const resetSnapshot = snapshot.map(({reset}) => {
    reset(myAtom);
  });
  const resetAtomLoadable = resetSnapshot.getLoadable(myAtom);
  expect(resetAtomLoadable.state).toEqual('hasValue');
  expect(resetAtomLoadable.contents).toEqual('DEFAULT');
  const resetSelectorLoadable = resetSnapshot.getLoadable(myAtom);
  expect(resetSelectorLoadable.state).toEqual('hasValue');
  expect(resetSelectorLoadable.contents).toEqual('DEFAULT');
});

testRecoil('Async map of snapshot', async () => {
  const snapshot = freshSnapshot();

  const myAtom = atom({
    key: 'Snapshot Map Async',
    default: 'DEFAULT',
  });
  const [beforeAsyncSel, resolveBeforeMap] = asyncSelector<string, _>();
  const [duringAsyncSel, resolveDuringMap] = asyncSelector<string, _>();
  const [afterAsyncSel, resolveAfterMap] = asyncSelector<string, _>();
  const depAsyncSel = selector({
    key: 'snapshot asyncMap dep selector',
    get: () => afterAsyncSel,
  });

  resolveBeforeMap('BEFORE');

  const newSnapshotPromise = snapshot.asyncMap(async ({getPromise, set}) => {
    await expect(getPromise(beforeAsyncSel)).resolves.toBe('BEFORE');
    await expect(getPromise(duringAsyncSel)).resolves.toBe('DURING');

    // Test that depAsyncSel is first used while mapping the snapshot.
    // If the snapshot is auto-released too early the async selector will be
    // canceled.
    getPromise(depAsyncSel);
    // Test that mapped snapshot is not auto-released too early
    await flushPromisesAndTimers();

    set(myAtom, 'VALUE');
  });

  resolveDuringMap('DURING');
  const newSnapshot = await newSnapshotPromise;
  expect(newSnapshot.isRetained()).toBe(true);
  resolveAfterMap('AFTER');

  await expect(newSnapshot.getPromise(myAtom)).resolves.toBe('VALUE');
  await expect(newSnapshot.getPromise(beforeAsyncSel)).resolves.toBe('BEFORE');
  await expect(newSnapshot.getPromise(duringAsyncSel)).resolves.toBe('DURING');
  await expect(newSnapshot.getPromise(afterAsyncSel)).resolves.toBe('AFTER');
  await expect(newSnapshot.getPromise(depAsyncSel)).resolves.toBe('AFTER');
});

testRecoil('getInfo', () => {
  const snapshot = freshSnapshot();

  const myAtom = atom<string>({
    key: 'snapshot getInfo atom',
    default: 'DEFAULT',
  });
  // $FlowFixMe[incompatible-call]
  const selectorA = selector({
    key: 'getInfo A',
    get: ({get}) => get(myAtom),
  });
  const selectorB = selector({
    key: 'getInfo B',
    get: ({get}) => get(selectorA) + get(myAtom),
  });

  // Initial status
  expect(getInfo(snapshot, myAtom)).toMatchObject({
    loadable: expect.objectContaining({state: 'hasValue', contents: 'DEFAULT'}),
    isActive: false,
    isSet: false,
    isModified: false,
    type: 'atom',
  });
  expect(Array.from(getInfo(snapshot, myAtom).deps)).toEqual([]);
  expect(Array.from(getInfo(snapshot, myAtom).subscribers.nodes)).toEqual([]);
  expect(getInfo(snapshot, selectorA)).toMatchObject({
    loadable: undefined,
    isActive: false,
    isSet: false,
    isModified: false,
    type: 'selector',
  });
  expect(Array.from(getInfo(snapshot, selectorA).deps)).toEqual([]);
  expect(Array.from(getInfo(snapshot, selectorA).subscribers.nodes)).toEqual(
    [],
  );
  // $FlowFixMe[incompatible-call]
  expect(getInfo(snapshot, selectorB)).toMatchObject({
    loadable: undefined,
    isActive: false,
    isSet: false,
    isModified: false,
    type: 'selector',
  });
  // $FlowFixMe[incompatible-call]
  expect(Array.from(getInfo(snapshot, selectorB).deps)).toEqual([]);
  // $FlowFixMe[incompatible-call]
  expect(Array.from(getInfo(snapshot, selectorB).subscribers.nodes)).toEqual(
    [],
  );

  // After reading values
  snapshot.getLoadable(selectorB);
  expect(getInfo(snapshot, myAtom)).toMatchObject({
    loadable: expect.objectContaining({state: 'hasValue', contents: 'DEFAULT'}),
    isActive: true,
    isSet: false,
    isModified: false,
    type: 'atom',
  });
  expect(Array.from(getInfo(snapshot, myAtom).deps)).toEqual([]);
  expect(Array.from(getInfo(snapshot, myAtom).subscribers.nodes)).toEqual(
    expect.arrayContaining([selectorA, selectorB]),
  );
  expect(getInfo(snapshot, selectorA)).toMatchObject({
    loadable: expect.objectContaining({state: 'hasValue', contents: 'DEFAULT'}),
    isActive: true,
    isSet: false,
    isModified: false,
    type: 'selector',
  });
  expect(Array.from(getInfo(snapshot, selectorA).deps)).toEqual(
    expect.arrayContaining([myAtom]),
  );
  expect(Array.from(getInfo(snapshot, selectorA).subscribers.nodes)).toEqual(
    expect.arrayContaining([selectorB]),
  );
  // $FlowFixMe[incompatible-call]
  expect(getInfo(snapshot, selectorB)).toMatchObject({
    loadable: expect.objectContaining({
      state: 'hasValue',
      contents: 'DEFAULTDEFAULT',
    }),
    isActive: true,
    isSet: false,
    isModified: false,
    type: 'selector',
  });
  // $FlowFixMe[incompatible-call]
  expect(Array.from(getInfo(snapshot, selectorB).deps)).toEqual(
    expect.arrayContaining([myAtom, selectorA]),
  );
  // $FlowFixMe[incompatible-call]
  expect(Array.from(getInfo(snapshot, selectorB).subscribers.nodes)).toEqual(
    [],
  );

  // After setting a value
  const setSnapshot = snapshot.map(({set}) => set(myAtom, 'SET'));
  setSnapshot.getLoadable(selectorB); // Read value to prime
  expect(getInfo(setSnapshot, myAtom)).toMatchObject({
    loadable: expect.objectContaining({state: 'hasValue', contents: 'SET'}),
    isActive: true,
    isSet: true,
    isModified: true,
    type: 'atom',
  });
  expect(Array.from(getInfo(setSnapshot, myAtom).deps)).toEqual([]);
  expect(Array.from(getInfo(setSnapshot, myAtom).subscribers.nodes)).toEqual(
    expect.arrayContaining([selectorA, selectorB]),
  );
  expect(getInfo(setSnapshot, selectorA)).toMatchObject({
    loadable: expect.objectContaining({state: 'hasValue', contents: 'SET'}),
    isActive: true,
    isSet: false,
    isModified: false,
    type: 'selector',
  });
  expect(Array.from(getInfo(setSnapshot, selectorA).deps)).toEqual(
    expect.arrayContaining([myAtom]),
  );
  expect(Array.from(getInfo(setSnapshot, selectorA).subscribers.nodes)).toEqual(
    expect.arrayContaining([selectorB]),
  );
  // $FlowFixMe[incompatible-call]
  expect(getInfo(setSnapshot, selectorB)).toMatchObject({
    loadable: expect.objectContaining({state: 'hasValue', contents: 'SETSET'}),
    isActive: true,
    isSet: false,
    isModified: false,
    type: 'selector',
  });
  // $FlowFixMe[incompatible-call]
  expect(Array.from(getInfo(setSnapshot, selectorB).deps)).toEqual(
    expect.arrayContaining([myAtom, selectorA]),
  );
  // $FlowFixMe[incompatible-call]
  expect(Array.from(getInfo(setSnapshot, selectorB).subscribers.nodes)).toEqual(
    [],
  );

  // After reseting a value
  const resetSnapshot = setSnapshot.map(({reset}) => reset(myAtom));
  resetSnapshot.getLoadable(selectorB); // prime snapshot
  expect(getInfo(resetSnapshot, myAtom)).toMatchObject({
    loadable: expect.objectContaining({state: 'hasValue', contents: 'DEFAULT'}),
    isActive: true,
    isSet: false,
    isModified: true,
    type: 'atom',
  });
  expect(Array.from(getInfo(resetSnapshot, myAtom).deps)).toEqual([]);
  expect(Array.from(getInfo(resetSnapshot, myAtom).subscribers.nodes)).toEqual(
    expect.arrayContaining([selectorA, selectorB]),
  );
  expect(getInfo(resetSnapshot, selectorA)).toMatchObject({
    loadable: expect.objectContaining({state: 'hasValue', contents: 'DEFAULT'}),
    isActive: true,
    isSet: false,
    isModified: false,
    type: 'selector',
  });
  expect(Array.from(getInfo(resetSnapshot, selectorA).deps)).toEqual(
    expect.arrayContaining([myAtom]),
  );
  expect(
    Array.from(getInfo(resetSnapshot, selectorA).subscribers.nodes),
  ).toEqual(expect.arrayContaining([selectorB]));
  // $FlowFixMe[incompatible-call]
  expect(getInfo(resetSnapshot, selectorB)).toMatchObject({
    loadable: expect.objectContaining({
      state: 'hasValue',
      contents: 'DEFAULTDEFAULT',
    }),
    isActive: true,
    isSet: false,
    isModified: false,
    type: 'selector',
  });
  // $FlowFixMe[incompatible-call]
  expect(Array.from(getInfo(resetSnapshot, selectorB).deps)).toEqual(
    expect.arrayContaining([myAtom, selectorA]),
  );
  expect(
    // $FlowFixMe[incompatible-call]
    Array.from(getInfo(resetSnapshot, selectorB).subscribers.nodes),
  ).toEqual([]);
});

describe('Retention', () => {
  testRecoil('auto-release', async () => {
    const snapshot = freshSnapshot();
    expect(snapshot.isRetained()).toBe(true);

    await flushPromisesAndTimers();
    expect(snapshot.isRetained()).toBe(false);

    const devStatus = window.__DEV__;
    window.__DEV__ = true;
    expect(() => snapshot.retain()).toThrow('released');
    window.__DEV__ = false;
    expect(() => snapshot.retain()).not.toThrow('released');
    window.__DEV__ = devStatus;

    // TODO enable when recoil_memory_managament_2020 is enforced
    // expect(() => snapshot.getID()).toThrow('release');
  });

  testRecoil('retain()', async () => {
    const snapshot = freshSnapshot();
    expect(snapshot.isRetained()).toBe(true);
    const release2 = snapshot.retain();

    await flushPromisesAndTimers();
    expect(snapshot.isRetained()).toBe(true);

    release2();
    expect(snapshot.isRetained()).toBe(false);
  });
});

describe('Atom effects', () => {
  testRecoil('Standalone snapshot', async ({gks}) => {
    let effectsRefCount = 0;
    const myAtom = atom({
      key: 'snapshot effects standalone',
      default: 'DEFAULT',
      effects: [
        ({setSelf}) => {
          effectsRefCount++;
          setSelf('INIT');
          return () => {
            effectsRefCount--;
          };
        },
      ],
    });

    expect(effectsRefCount).toBe(0);

    const fresh = freshSnapshot();
    expect(fresh.getLoadable(myAtom).getValue()).toBe('INIT');
    expect(effectsRefCount).toBe(1);

    // Auto-release snapshot
    await flushPromisesAndTimers();
    expect(effectsRefCount).toBe(0);
  });

  testRecoil('RecoilRoot Snapshot', () => {
    let effectsRefCount = 0;
    const myAtom = atom({
      key: 'snapshot effects RecoilRoot',
      default: 'DEFAULT',
      effects: [
        ({setSelf}) => {
          effectsRefCount++;
          setSelf('INIT');
          return () => {
            effectsRefCount--;
          };
        },
      ],
    });

    let setMount: boolean => void = () => {
      throw new Error('Test Error');
    };
    function Component() {
      const [mount, setState] = useState(false);
      setMount = setState;
      return mount ? (
        <RecoilRoot>
          <ReadsAtom atom={myAtom} />
        </RecoilRoot>
      ) : (
        'UNMOUNTED'
      );
    }

    const c = renderElements(<Component />);
    expect(c.textContent).toBe('UNMOUNTED');
    expect(effectsRefCount).toBe(0);

    act(() => setMount(true));
    expect(c.textContent).toBe('"INIT"');
    expect(effectsRefCount).toBe(1);

    act(() => setMount(false));
    expect(c.textContent).toBe('UNMOUNTED');
    expect(effectsRefCount).toBe(0);
  });

  testRecoil('getStoreID()', () => {
    const myAtom = atom({
      key: 'snapshot effects storeID',
      default: 'DEFAULT',
      effects: [
        ({setSelf, storeID}) => {
          // $FlowFixMe[incompatible-call]
          setSelf(storeID);
        },
      ],
    });

    const testSnapshot = freshSnapshot();
    expect(testSnapshot.getLoadable(myAtom).getValue()).toBe(
      testSnapshot.getStoreID(),
    );
  });

  testRecoil('Parent StoreID', () => {
    const myAtom = atom({
      key: 'snapshot effects parentStoreID',
      effects: [
        // $FlowFixMe[missing-local-annot]
        ({storeID, parentStoreID_UNSTABLE, setSelf}) => {
          setSelf({storeID, parentStoreID: parentStoreID_UNSTABLE});
        },
      ],
    });

    const testSnapshot = freshSnapshot();
    const mappedSnapshot = testSnapshot.map(() => {});

    expect(mappedSnapshot.getLoadable(myAtom).getValue().storeID).toBe(
      mappedSnapshot.getStoreID(),
    );
    expect(mappedSnapshot.getLoadable(myAtom).getValue().parentStoreID).toBe(
      testSnapshot.getStoreID(),
    );
  });
});
