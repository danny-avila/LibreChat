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
  useEffect,
  useState,
  act,
  freshSnapshot,
  atom,
  constSelector,
  selector,
  ReadsAtom,
  asyncSelector,
  stringAtom,
  componentThatReadsAndWritesAtom,
  flushPromisesAndTimers,
  renderElements,
  useGotoRecoilSnapshot,
  useRecoilSnapshot;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({useEffect, useState} = React);
  ({act} = require('ReactTestUtils'));
  ({freshSnapshot} = require('../../core/Recoil_Snapshot'));
  atom = require('../../recoil_values/Recoil_atom');
  constSelector = require('../../recoil_values/Recoil_constSelector');
  selector = require('../../recoil_values/Recoil_selector');
  ({
    ReadsAtom,
    asyncSelector,
    stringAtom,
    componentThatReadsAndWritesAtom,
    flushPromisesAndTimers,
    renderElements,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  ({
    useGotoRecoilSnapshot,
    useRecoilSnapshot,
  } = require('../Recoil_SnapshotHooks'));
});

testRecoil('useRecoilSnapshot - subscribe to updates', ({strictMode}) => {
  if (strictMode) {
    return;
  }
  const myAtom = stringAtom();
  const [ReadsAndWritesAtom, setAtom, resetAtom] =
    componentThatReadsAndWritesAtom(myAtom);

  const mySelector = constSelector(myAtom);

  const snapshots = [];
  function RecoilSnapshotAndSubscribe() {
    const snapshot = useRecoilSnapshot();
    snapshot.retain();
    snapshots.push(snapshot);
    return null;
  }

  const c = renderElements(
    <>
      <ReadsAndWritesAtom />
      <ReadsAtom atom={mySelector} />
      <RecoilSnapshotAndSubscribe />
    </>,
  );

  expect(c.textContent).toEqual('"DEFAULT""DEFAULT"');

  act(() => setAtom('SET IN CURRENT'));
  expect(c.textContent).toEqual('"SET IN CURRENT""SET IN CURRENT"');

  act(resetAtom);
  expect(c.textContent).toEqual('"DEFAULT""DEFAULT"');

  expect(snapshots.length).toEqual(3);
  expect(snapshots[0].getLoadable(myAtom).contents).toEqual('DEFAULT');
  expect(snapshots[1].getLoadable(myAtom).contents).toEqual('SET IN CURRENT');
  expect(snapshots[1].getLoadable(mySelector).contents).toEqual(
    'SET IN CURRENT',
  );
  expect(snapshots[2].getLoadable(myAtom).contents).toEqual('DEFAULT');
});

testRecoil('useRecoilSnapshot - goto snapshots', ({strictMode}) => {
  if (strictMode) {
    return;
  }
  const atomA = atom({
    key: 'useRecoilSnapshot - goto A',
    default: 'DEFAULT',
  });
  const [ReadsAndWritesAtomA, setAtomA] =
    componentThatReadsAndWritesAtom(atomA);

  const atomB = atom<string | number>({
    key: 'useRecoilSnapshot - goto B',
    default: 'DEFAULT',
  });
  const [ReadsAndWritesAtomB, setAtomB] =
    componentThatReadsAndWritesAtom(atomB);

  const snapshots = [];
  let gotoSnapshot;
  function RecoilSnapshotAndSubscribe() {
    gotoSnapshot = useGotoRecoilSnapshot();
    const snapshot = useRecoilSnapshot();
    snapshot.retain();
    snapshots.push(snapshot);
    return null;
  }

  const c = renderElements(
    <>
      <ReadsAndWritesAtomA />
      <ReadsAndWritesAtomB />
      <RecoilSnapshotAndSubscribe />
    </>,
  );

  expect(c.textContent).toEqual('"DEFAULT""DEFAULT"');

  // $FlowFixMe[incompatible-call]
  act(() => setAtomA(1));
  expect(c.textContent).toEqual('1"DEFAULT"');

  act(() => setAtomB(2));
  expect(c.textContent).toEqual('12');

  expect(snapshots.length).toEqual(3);

  act(() => gotoSnapshot(snapshots[1]));
  expect(c.textContent).toEqual('1"DEFAULT"');

  act(() => gotoSnapshot(snapshots[0]));
  expect(c.textContent).toEqual('"DEFAULT""DEFAULT"');

  act(() => gotoSnapshot(snapshots[2].map(({set}) => set(atomB, 3))));
  expect(c.textContent).toEqual('13');
});

testRecoil(
  'useRecoilSnapshot - async selector',
  async ({strictMode, concurrentMode}) => {
    const [mySelector, resolve] = asyncSelector<string, _>();

    const snapshots = [];
    function RecoilSnapshotAndSubscribe() {
      const snapshot = useRecoilSnapshot();
      snapshot.retain();
      useEffect(() => {
        snapshots.push(snapshot);
      }, [snapshot]);
      return null;
    }

    renderElements(<RecoilSnapshotAndSubscribe />);
    expect(snapshots.length).toEqual(strictMode && concurrentMode ? 2 : 1);

    act(() => resolve('RESOLVE'));
    expect(snapshots.length).toEqual(strictMode && concurrentMode ? 2 : 1);

    // On the first request the selector is unresolved and returns the promise
    await expect(
      snapshots[0].getLoadable(mySelector).contents,
    ).resolves.toEqual('RESOLVE');

    // On the second request the resolved value is cached.
    expect(snapshots[0].getLoadable(mySelector).contents).toEqual('RESOLVE');
  },
);

testRecoil(
  'useRecoilSnapshot - cloned async selector',
  async ({strictMode, concurrentMode}) => {
    const [mySelector, resolve] = asyncSelector<string, _>();

    const snapshots = [];
    function RecoilSnapshotAndSubscribe() {
      const snapshot = useRecoilSnapshot();
      snapshot.retain();
      useEffect(() => {
        snapshots.push(snapshot);
      });
      return null;
    }

    const c = renderElements(
      <>
        <React.Suspense fallback="loading">
          <ReadsAtom atom={mySelector} />
        </React.Suspense>
        <RecoilSnapshotAndSubscribe />
      </>,
    );

    expect(c.textContent).toEqual('loading');
    expect(snapshots.length).toEqual(strictMode && concurrentMode ? 2 : 1);

    act(() => resolve('RESOLVE'));
    await flushPromisesAndTimers();
    await flushPromisesAndTimers();
    expect(c.textContent).toEqual('"RESOLVE"');

    expect(snapshots.length).toEqual(strictMode && concurrentMode ? 3 : 2);
    // Snapshot contains cached result since it was cloned after resolved
    expect(snapshots[0].getLoadable(mySelector).contents).toEqual('RESOLVE');
  },
);

testRecoil('Subscriptions', async () => {
  const myAtom = atom<string>({
    key: 'useRecoilSnapshot Subscriptions atom',
    default: 'ATOM',
  });
  // $FlowFixMe[incompatible-call]
  const selectorA = selector({
    key: 'useRecoilSnapshot Subscriptions A',
    get: ({get}) => get(myAtom),
  });
  const selectorB = selector({
    key: 'useRecoilSnapshot Subscriptions B',
    get: ({get}) => get(selectorA) + get(myAtom),
  });
  const selectorC = selector({
    key: 'useRecoilSnapshot Subscriptions C',
    get: async ({get}) => {
      const ret = get(selectorA) + get(selectorB);
      await Promise.resolve();
      return ret;
    },
  });

  let snapshot = freshSnapshot();
  function RecoilSnapshot() {
    snapshot = useRecoilSnapshot();
    return null;
  }
  const c = renderElements(
    <>
      <ReadsAtom atom={selectorC} />
      <RecoilSnapshot />
    </>,
  );

  await flushPromisesAndTimers();

  expect(c.textContent).toBe('"ATOMATOMATOM"');

  expect(
    Array.from(snapshot.getInfo_UNSTABLE(myAtom).subscribers.nodes).length,
  ).toBe(3);
  expect(
    Array.from(snapshot.getInfo_UNSTABLE(myAtom).subscribers.nodes),
  ).toEqual(expect.arrayContaining([selectorA, selectorB, selectorC]));
  expect(
    Array.from(snapshot.getInfo_UNSTABLE(selectorA).subscribers.nodes).length,
  ).toBe(2);
  expect(
    Array.from(snapshot.getInfo_UNSTABLE(selectorA).subscribers.nodes),
  ).toEqual(expect.arrayContaining([selectorB, selectorC]));
  expect(
    Array.from(snapshot.getInfo_UNSTABLE(selectorB).subscribers.nodes).length,
  ).toBe(1);
  expect(
    Array.from(snapshot.getInfo_UNSTABLE(selectorB).subscribers.nodes),
  ).toEqual(expect.arrayContaining([selectorC]));
  expect(
    Array.from(snapshot.getInfo_UNSTABLE(selectorC).subscribers.nodes).length,
  ).toBe(0);
  expect(
    Array.from(snapshot.getInfo_UNSTABLE(selectorC).subscribers.nodes),
  ).toEqual(expect.arrayContaining([]));
});

describe('Snapshot Retention', () => {
  testRecoil('Retained for duration component is mounted', async () => {
    let retainedDuringEffect = false;
    let setMount;
    let checkRetention;
    function UseRecoilSnapshot() {
      const snapshot = useRecoilSnapshot();
      expect(snapshot.isRetained()).toBe(true);

      useEffect(() => {
        retainedDuringEffect = snapshot.isRetained();
      });

      checkRetention = () => snapshot.isRetained();

      return null;
    }
    function Component() {
      const [mount, setMountState] = useState(false);
      setMount = setMountState;
      return mount ? <UseRecoilSnapshot /> : null;
    }

    renderElements(<Component />);
    expect(retainedDuringEffect).toBe(false);

    act(() => setMount(true));
    expect(retainedDuringEffect).toBe(true);
    expect(checkRetention?.()).toBe(true);

    act(() => setMount(false));
    await flushPromisesAndTimers();
    expect(checkRetention?.()).toBe(false);
  });

  testRecoil('Snapshot auto-release', async ({gks}) => {
    let rootFirstCnt = 0;
    const rootFirstAtom = atom({
      key: 'useRecoilSnapshot auto-release root-first',
      default: 'DEFAULT',
      effects: [
        ({setSelf}) => {
          rootFirstCnt++;
          setSelf('ROOT');
          return () => {
            rootFirstCnt--;
          };
        },
      ],
    });

    let snapshotFirstCnt = 0;
    const snapshotFirstAtom = atom({
      key: 'useRecoilSnapshot auto-release snapshot-first',
      default: 'DEFAULT',
      effects: [
        ({setSelf}) => {
          snapshotFirstCnt++;
          setSelf('SNAPSHOT FIRST');
          return () => {
            snapshotFirstCnt--;
          };
        },
      ],
    });

    let snapshotOnlyCnt = 0;
    const snapshotOnlyAtom = atom({
      key: 'useRecoilSnapshot auto-release snapshot-only',
      default: 'DEFAULT',
      effects: [
        ({setSelf}) => {
          snapshotOnlyCnt++;
          setSelf('SNAPSHOT ONLY');
          return () => {
            snapshotOnlyCnt--;
          };
        },
      ],
    });

    let rootOnlyCnt = 0;
    const rootOnlyAtom = atom({
      key: 'useRecoilSnapshot auto-release root-only',
      default: 'DEFAULT',
      effects: [
        ({setSelf}) => {
          rootOnlyCnt++;
          setSelf('RETAIN');
          return () => {
            rootOnlyCnt--;
          };
        },
      ],
    });

    let setMount: boolean => void = () => {
      throw new Error('Test Error');
    };
    function UseRecoilSnapshot() {
      const snapshot = useRecoilSnapshot();
      return (
        snapshot.getLoadable(snapshotFirstAtom).getValue() +
        snapshot.getLoadable(snapshotOnlyAtom).getValue()
      );
    }
    function Component() {
      const [mount, setState] = useState(false);
      setMount = setState;
      return mount ? (
        <>
          <ReadsAtom atom={rootOnlyAtom} />
          <ReadsAtom atom={rootFirstAtom} />
          <UseRecoilSnapshot />
          <ReadsAtom atom={snapshotFirstAtom} />
        </>
      ) : (
        <ReadsAtom atom={rootOnlyAtom} />
      );
    }

    const c = renderElements(<Component />);
    expect(c.textContent).toBe('"RETAIN"');
    expect(rootOnlyCnt).toBe(1);
    expect(snapshotOnlyCnt).toBe(0);
    expect(rootFirstCnt).toBe(0);
    expect(snapshotFirstCnt).toBe(0);

    act(() => setMount(true));
    expect(c.textContent).toBe(
      '"RETAIN""ROOT"SNAPSHOT FIRSTSNAPSHOT ONLY"SNAPSHOT FIRST"',
    );
    await flushPromisesAndTimers();
    expect(rootOnlyCnt).toBe(1);
    expect(snapshotOnlyCnt).toBe(1);
    expect(rootFirstCnt).toBe(1);
    expect(snapshotFirstCnt).toBe(2);

    // Confirm snapshot isn't released until component is unmounted
    await flushPromisesAndTimers();
    expect(rootOnlyCnt).toBe(1);
    expect(snapshotOnlyCnt).toBe(1);
    expect(rootFirstCnt).toBe(1);
    expect(snapshotFirstCnt).toBe(2);

    // Auto-release snapshot
    act(() => setMount(false));
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"RETAIN"');
    expect(rootOnlyCnt).toBe(1);
    expect(snapshotOnlyCnt).toBe(0);
    if (gks.includes('recoil_memory_management_2020')) {
      expect(rootFirstCnt).toBe(0);
      expect(snapshotFirstCnt).toBe(0);
    }
  });
});

testRecoil('useRecoilSnapshot - re-render', () => {
  const myAtom = stringAtom();
  const [ReadsAndWritesAtom, setAtom, resetAtom] =
    componentThatReadsAndWritesAtom(myAtom);

  const snapshots = [];
  let forceUpdate;
  function RecoilSnapshotAndSubscribe() {
    const [, setState] = useState(([]: Array<$FlowFixMe>));
    forceUpdate = () => setState([]);

    const snapshot = useRecoilSnapshot();
    snapshots.push(snapshot);
    return null;
  }

  const c = renderElements(
    <>
      <ReadsAndWritesAtom />
      <RecoilSnapshotAndSubscribe />
    </>,
  );

  expect(c.textContent).toEqual('"DEFAULT"');
  expect(snapshots[snapshots.length - 1].getLoadable(myAtom).contents).toBe(
    'DEFAULT',
  );

  act(forceUpdate);
  expect(snapshots[snapshots.length - 1].getLoadable(myAtom).contents).toBe(
    'DEFAULT',
  );

  act(() => setAtom('SET'));
  expect(c.textContent).toEqual('"SET"');
  expect(snapshots[snapshots.length - 1].getLoadable(myAtom).contents).toBe(
    'SET',
  );

  act(forceUpdate);
  expect(c.textContent).toEqual('"SET"');
  expect(snapshots[snapshots.length - 1].getLoadable(myAtom).contents).toBe(
    'SET',
  );

  act(resetAtom);
  expect(c.textContent).toEqual('"DEFAULT"');
  expect(snapshots[snapshots.length - 1].getLoadable(myAtom).contents).toBe(
    'DEFAULT',
  );

  act(forceUpdate);
  expect(c.textContent).toEqual('"DEFAULT"');
  expect(snapshots[snapshots.length - 1].getLoadable(myAtom).contents).toBe(
    'DEFAULT',
  );
});
