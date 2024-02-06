/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall perf_viz
 */

'use strict';

import type {Snapshot} from 'Recoil_Snapshot';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let React,
  act,
  freshSnapshot,
  atom,
  atomFamily,
  selector,
  ReadsAtom,
  asyncSelector,
  componentThatReadsAndWritesAtom,
  renderElements,
  useRecoilTransactionObserver;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({act} = require('ReactTestUtils'));

  ({freshSnapshot} = require('../../core/Recoil_Snapshot'));
  atom = require('../../recoil_values/Recoil_atom');
  atomFamily = require('../../recoil_values/Recoil_atomFamily');
  selector = require('../../recoil_values/Recoil_selector');
  ({
    ReadsAtom,
    asyncSelector,
    componentThatReadsAndWritesAtom,
    renderElements,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  ({useRecoilTransactionObserver} = require('../Recoil_SnapshotHooks'));
});

function TransactionObserver({
  callback,
}: $TEMPORARY$object<{
  callback: ({previousSnapshot: Snapshot, snapshot: Snapshot}) => void,
}>) {
  useRecoilTransactionObserver(callback);
  return null;
}

// Run test first since it deals with all registered atoms
testRecoil('getNodes', () => {
  let snapshot = freshSnapshot();
  function UseRecoilTransactionObserver() {
    useRecoilTransactionObserver(p => {
      p.snapshot.retain();
      snapshot = p.snapshot;
    });
    return null;
  }

  const atoms = atomFamily<string, string>({
    key: 'useRecoilTransactionObserver getNodes atom',
    default: x => x,
  });
  const [ReadsAtomA, setAtomA, resetAtomA] = componentThatReadsAndWritesAtom(
    atoms('A'),
  );
  const [ReadsAtomB, setAtomB] = componentThatReadsAndWritesAtom(atoms('B'));
  // $FlowFixMe[incompatible-call]
  const selectorA = selector({
    key: 'useRecoilTransactionObserver getNodes selector',
    get: ({get}) => get(atoms('A')) + '-SELECTOR',
  });
  const c = renderElements(
    <>
      <ReadsAtomA />
      <ReadsAtomB />
      <ReadsAtom atom={selectorA} />
      <UseRecoilTransactionObserver />
    </>,
  );
  expect(c.textContent).toEqual('"A""B""A-SELECTOR"');

  expect(
    Array.from(snapshot.getNodes_UNSTABLE({isInitialized: true})).length,
  ).toEqual(0);
  act(() => setAtomA('A'));
  // >= 3 because we expect at least nodes for atom's A and B from
  // the family and selectorA.  In reality we could get more due to internal
  // helper selectors and default fallback atoms.
  expect(
    Array.from(snapshot.getNodes_UNSTABLE({isInitialized: true})).length,
  ).toBeGreaterThanOrEqual(3);
  const nodes = Array.from(snapshot.getNodes_UNSTABLE({isInitialized: true}));
  expect(nodes).toEqual(
    expect.arrayContaining([atoms('A'), atoms('B'), selectorA]),
  );

  // Test atom A is set
  const aDirty = Array.from(snapshot.getNodes_UNSTABLE({isModified: true}));
  expect(aDirty.length).toEqual(1);
  expect(snapshot.getLoadable(aDirty[0]).contents).toEqual('A');

  // Test atom B is set
  act(() => setAtomB('B'));
  const bDirty = Array.from(snapshot.getNodes_UNSTABLE({isModified: true}));
  expect(bDirty.length).toEqual(1);
  expect(snapshot.getLoadable(bDirty[0]).contents).toEqual('B');

  // Test atoms
  const atomNodes = Array.from(
    snapshot.getNodes_UNSTABLE({isInitialized: true}),
  );
  expect(atomNodes.map(atom => snapshot.getLoadable(atom).contents)).toEqual(
    expect.arrayContaining(['A', 'B']),
  );

  // Test selector
  const selectorNodes = Array.from(
    snapshot.getNodes_UNSTABLE({isInitialized: true}),
  );
  expect(
    selectorNodes.map(atom => snapshot.getLoadable(atom).contents),
  ).toEqual(expect.arrayContaining(['A-SELECTOR']));

  // Test Reset
  act(resetAtomA);
  const resetDirty = Array.from(snapshot.getNodes_UNSTABLE({isModified: true}));
  expect(resetDirty.length).toEqual(1);
  expect(resetDirty[0]).toBe(aDirty[0]);

  // TODO Test dirty selectors
});

testRecoil('Can observe atom value', async () => {
  const atomA = atom({
    key: 'Observe Atom A',
    default: 'DEFAULT A',
  });

  const atomB = atom({
    key: 'Observe Atom B',
    default: 'DEFAULT B',
  });

  const [WriteAtomA, setAtomA, resetA] = componentThatReadsAndWritesAtom(atomA);
  const [WriteAtomB, setAtomB] = componentThatReadsAndWritesAtom(atomB);

  const transactions = [];
  renderElements(
    <>
      <TransactionObserver
        callback={({snapshot, previousSnapshot}) => {
          snapshot.retain();
          previousSnapshot.retain();
          transactions.push({snapshot, previousSnapshot});
        }}
      />
      <WriteAtomA />
      <WriteAtomB />
    </>,
  );

  act(() => setAtomB('SET B'));

  expect(transactions.length).toEqual(1);
  await expect(transactions[0].snapshot.getPromise(atomA)).resolves.toEqual(
    'DEFAULT A',
  );
  await expect(
    transactions[0].previousSnapshot.getPromise(atomA),
  ).resolves.toEqual('DEFAULT A');
  await expect(transactions[0].snapshot.getPromise(atomB)).resolves.toEqual(
    'SET B',
  );
  await expect(
    transactions[0].previousSnapshot.getPromise(atomB),
  ).resolves.toEqual('DEFAULT B');

  act(() => setAtomA('SET A'));

  expect(transactions.length).toEqual(2);
  await expect(transactions[1].snapshot.getPromise(atomA)).resolves.toEqual(
    'SET A',
  );
  await expect(
    transactions[1].previousSnapshot.getPromise(atomA),
  ).resolves.toEqual('DEFAULT A');
  await expect(transactions[1].snapshot.getPromise(atomB)).resolves.toEqual(
    'SET B',
  );
  await expect(
    transactions[1].previousSnapshot.getPromise(atomB),
  ).resolves.toEqual('SET B');

  act(() => resetA());

  expect(transactions.length).toEqual(3);
  await expect(transactions[2].snapshot.getPromise(atomA)).resolves.toEqual(
    'DEFAULT A',
  );
  await expect(
    transactions[2].previousSnapshot.getPromise(atomA),
  ).resolves.toEqual('SET A');
  await expect(transactions[2].snapshot.getPromise(atomB)).resolves.toEqual(
    'SET B',
  );
  await expect(
    transactions[2].previousSnapshot.getPromise(atomB),
  ).resolves.toEqual('SET B');
});

testRecoil('Can observe selector value', async () => {
  const atomA = atom({
    key: 'Observe Atom for Selector',
    default: 'DEFAULT',
  });

  // $FlowFixMe[incompatible-call]
  const selectorA = selector({
    key: 'Observer Selector As',
    get: ({get}) => `SELECTOR ${get(atomA)}`,
  });

  const [WriteAtom, setAtom] = componentThatReadsAndWritesAtom(atomA);

  const transactions = [];
  renderElements(
    <>
      <TransactionObserver
        callback={({snapshot, previousSnapshot}) => {
          snapshot.retain();
          previousSnapshot.retain();
          transactions.push({snapshot, previousSnapshot});
        }}
      />
      <WriteAtom />
    </>,
  );

  act(() => setAtom('SET'));

  expect(transactions.length).toEqual(1);
  await expect(transactions[0].snapshot.getPromise(atomA)).resolves.toEqual(
    'SET',
  );
  await expect(
    transactions[0].previousSnapshot.getPromise(atomA),
  ).resolves.toEqual('DEFAULT');
  await expect(transactions[0].snapshot.getPromise(selectorA)).resolves.toEqual(
    'SELECTOR SET',
  );
  await expect(
    transactions[0].previousSnapshot.getPromise(selectorA),
  ).resolves.toEqual('SELECTOR DEFAULT');
});

testRecoil('Can observe async selector value', async () => {
  const atomA = atom({
    key: 'Observe Atom for Async Selector',
    default: 'DEFAULT',
  });
  const [WriteAtom, setAtom] = componentThatReadsAndWritesAtom(atomA);

  const [selectorA, resolveA] = asyncSelector<string, _>();

  const transactions = [];
  renderElements(
    <>
      <TransactionObserver
        callback={({snapshot, previousSnapshot}) => {
          snapshot.retain();
          previousSnapshot.retain();
          transactions.push({snapshot, previousSnapshot});
        }}
      />
      <WriteAtom />
    </>,
  );

  act(() => setAtom('SET'));

  expect(transactions.length).toEqual(1);
  expect(transactions[0].snapshot.getLoadable(selectorA).state).toEqual(
    'loading',
  );

  act(() => resolveA('RESOLVE'));

  expect(transactions.length).toEqual(1);
  await expect(transactions[0].snapshot.getPromise(selectorA)).resolves.toEqual(
    'RESOLVE',
  );
});
