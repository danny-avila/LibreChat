/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * @flow strict-local
 * @format
 * @oncall recoil
 */

'use strict';

import type {Store} from '../Recoil_State';
import type {MutableSnapshot} from 'Recoil_Snapshot';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let React,
  useState,
  act,
  useSetRecoilState,
  atom,
  constSelector,
  selector,
  asyncSelector,
  ReadsAtom,
  componentThatReadsAndWritesAtom,
  flushPromisesAndTimers,
  renderElements,
  renderUnwrappedElements,
  RecoilRoot,
  useStoreRef;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({useState} = require('react'));
  ({act} = require('ReactTestUtils'));

  ({useSetRecoilState} = require('../../hooks/Recoil_Hooks'));
  atom = require('../../recoil_values/Recoil_atom');
  constSelector = require('../../recoil_values/Recoil_constSelector');
  selector = require('../../recoil_values/Recoil_selector');
  ({
    asyncSelector,
    ReadsAtom,
    componentThatReadsAndWritesAtom,
    flushPromisesAndTimers,
    renderElements,
    renderUnwrappedElements,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  ({RecoilRoot, useStoreRef} = require('../Recoil_RecoilRoot'));
});

describe('initializeState', () => {
  testRecoil('initialize atom', () => {
    const myAtom = atom({
      key: 'RecoilRoot - initializeState - atom',
      default: 'DEFAULT',
    });
    const mySelector = constSelector(myAtom);

    function initializeState({set, getLoadable}: MutableSnapshot) {
      expect(getLoadable(myAtom).contents).toEqual('DEFAULT');
      expect(getLoadable(mySelector).contents).toEqual('DEFAULT');
      set(myAtom, 'INITIALIZE');
      expect(getLoadable(myAtom).contents).toEqual('INITIALIZE');
      expect(getLoadable(mySelector).contents).toEqual('INITIALIZE');
    }

    const container = renderElements(
      <RecoilRoot initializeState={initializeState}>
        <ReadsAtom atom={myAtom} />
        <ReadsAtom atom={mySelector} />
      </RecoilRoot>,
    );

    expect(container.textContent).toEqual('"INITIALIZE""INITIALIZE"');
  });

  testRecoil('initialize selector', () => {
    const myAtom = atom({
      key: 'RecoilRoot - initializeState - selector',
      default: 'DEFAULT',
    });
    // $FlowFixMe[incompatible-call]
    const mySelector = selector({
      key: 'RecoilRoot - initializeState - selector selector',
      get: ({get}) => get(myAtom),
      // $FlowFixMe[incompatible-call]
      set: ({set}, newValue) => set(myAtom, newValue),
    });

    function initializeState({set, getLoadable}: MutableSnapshot) {
      expect(getLoadable(myAtom).contents).toEqual('DEFAULT');
      expect(getLoadable(mySelector).contents).toEqual('DEFAULT');
      set(mySelector, 'INITIALIZE');
      expect(getLoadable(myAtom).contents).toEqual('INITIALIZE');
      expect(getLoadable(mySelector).contents).toEqual('INITIALIZE');
    }

    const container = renderElements(
      <RecoilRoot initializeState={initializeState}>
        <ReadsAtom atom={myAtom} />
        <ReadsAtom atom={mySelector} />
      </RecoilRoot>,
    );

    expect(container.textContent).toEqual('"INITIALIZE""INITIALIZE"');
  });

  testRecoil(
    'Atom Effects run with global initialization',
    async ({strictMode, concurrentMode}) => {
      let effectRan = 0;
      let effectCleanup = 0;
      const myAtom = atom<string>({
        key: 'RecoilRoot - initializeState - atom effects',
        default: 'DEFAULT',
        effects: [
          ({setSelf}) => {
            effectRan++;
            setSelf('EFFECT');
            return () => {
              effectCleanup++;
            };
          },
        ],
      });

      function initializeState({set}: MutableSnapshot) {
        set(myAtom, current => {
          // Effects are run first
          expect(current).toEqual('EFFECT');
          return 'INITIALIZE';
        });
      }

      expect(effectRan).toEqual(0);

      const container1 = renderElements(
        <RecoilRoot initializeState={initializeState}>NO READ</RecoilRoot>,
      );
      // Effects are run when initialized with initializeState, even if not read.
      // Effects are run twice, once before initializeState, then again when rendering.
      expect(container1.textContent).toEqual('NO READ');
      expect(effectRan).toEqual(strictMode ? (concurrentMode ? 4 : 3) : 2);

      // Auto-release of the initializing snapshot
      await flushPromisesAndTimers();
      expect(effectCleanup).toEqual(strictMode ? (concurrentMode ? 3 : 2) : 1);

      // Test again when atom is actually used by the root
      effectRan = 0;
      effectCleanup = 0;
      const container2 = renderElements(
        <RecoilRoot initializeState={initializeState}>
          <ReadsAtom atom={myAtom} />
        </RecoilRoot>,
      );

      // Effects takes precedence
      expect(container2.textContent).toEqual('"EFFECT"');
      expect(effectRan).toEqual(strictMode ? (concurrentMode ? 4 : 3) : 2);
      await flushPromisesAndTimers();
      expect(effectCleanup).toEqual(strictMode ? (concurrentMode ? 3 : 2) : 1);
    },
  );

  testRecoil(
    'onSet() called when atom initialized with initializeState',
    () => {
      const setValues = [];
      const myAtom = atom({
        key: 'RecoilRoot - initializeState - onSet',
        default: 0,
        effects: [
          ({onSet, setSelf}) => {
            onSet(value => {
              setValues.push(value);
              // Confirm setSelf() works when initialized with initializeState
              setSelf(value + 1);
            });
          },
        ],
      });

      const [MyAtom, setAtom] = componentThatReadsAndWritesAtom(myAtom);

      const c = renderElements(
        <RecoilRoot initializeState={({set}) => set(myAtom, 1)}>
          <MyAtom />
        </RecoilRoot>,
      );

      expect(c.textContent).toBe('1');
      expect(setValues).toEqual([]);

      act(() => setAtom(2));
      expect(setValues).toEqual([2]);
      expect(c.textContent).toBe('3');
    },
  );

  testRecoil(
    'Selectors from global initialization are not canceled',
    async () => {
      const [asyncSel, resolve] = asyncSelector<string, _>();
      // $FlowFixMe[incompatible-call]
      const depSel = selector({
        key: 'RecoilRoot - initializeSTate - async selector',
        get: ({get}) => get(asyncSel),
      });

      const container = renderUnwrappedElements(
        <RecoilRoot
          // Call initializeState to force a snapshot to be mapped
          initializeState={({getLoadable}) => {
            getLoadable(asyncSel);
            getLoadable(depSel);
          }}>
          <React.Suspense fallback="loading">
            <ReadsAtom atom={asyncSel} />
            <ReadsAtom atom={depSel} />
          </React.Suspense>
        </RecoilRoot>,
      );
      expect(container.textContent).toEqual('loading');

      // Wait for any potential auto-release of initializing snapshot
      await flushPromisesAndTimers();

      // Ensure that async selectors resolve and are not canceled
      act(() => resolve('RESOLVE'));
      await flushPromisesAndTimers();
      expect(container.textContent).toEqual('"RESOLVE""RESOLVE"');
    },
  );

  testRecoil('initialize with nested store', () => {
    const GetStore = ({children}: {children: Store => React.Node}) => {
      return children(useStoreRef().current);
    };

    const container = renderElements(
      <RecoilRoot>
        <GetStore>
          {storeA => (
            <RecoilRoot store_INTERNAL={storeA}>
              <GetStore>
                {storeB => {
                  expect(storeA === storeB).toBe(true);
                  return 'NESTED_ROOT/';
                }}
              </GetStore>
            </RecoilRoot>
          )}
        </GetStore>
        ROOT
      </RecoilRoot>,
    );

    expect(container.textContent).toEqual('NESTED_ROOT/ROOT');
  });

  testRecoil('initializeState is only called once', ({strictMode}) => {
    if (strictMode) {
      return;
    }
    const myAtom = atom({
      key: 'RecoilRoot/override/atom',
      default: 'DEFAULT',
    });
    const [ReadsWritesAtom, setAtom] = componentThatReadsAndWritesAtom(myAtom);

    const initializeState = jest.fn(({set}) => set(myAtom, 'INIT'));
    let forceUpdate: () => void = () => {
      throw new Error('not rendered');
    };
    let setRootKey: number => void = _ => {
      throw new Error('');
    };
    function MyRoot() {
      const [counter, setCounter] = useState(0);
      forceUpdate = () => setCounter(counter + 1);
      const [key, setKey] = useState(0);
      setRootKey = setKey;
      return (
        <RecoilRoot key={key} initializeState={initializeState}>
          {counter}
          <ReadsWritesAtom />
        </RecoilRoot>
      );
    }
    const container = renderElements(<MyRoot />);

    expect(container.textContent).toEqual('0"INIT"');

    act(forceUpdate);
    expect(initializeState).toHaveBeenCalledTimes(1);
    expect(container.textContent).toEqual('1"INIT"');

    act(() => setAtom('SET'));
    expect(initializeState).toHaveBeenCalledTimes(1);
    expect(container.textContent).toEqual('1"SET"');

    act(forceUpdate);
    expect(initializeState).toHaveBeenCalledTimes(1);
    expect(container.textContent).toEqual('2"SET"');

    act(() => setRootKey(1));
    expect(initializeState).toHaveBeenCalledTimes(2);
    expect(container.textContent).toEqual('2"INIT"');
  });
});

testRecoil(
  'Impure state updater functions that trigger atom updates are detected',
  () => {
    // This test ensures that we throw a clean error rather than mysterious breakage
    // if the user supplies a state updater function that triggers another update
    // within its execution. These state updater functions are supposed to be pure.
    // We can't detect all forms of impurity but this one in particular will make
    // Recoil break, so we detect it and throw an error.

    const atomA = atom({
      key: 'RecoilRoot/impureUpdater/a',
      default: 0,
    });
    const atomB = atom({
      key: 'RecoilRoot/impureUpdater/b',
      default: 0,
    });

    let update;
    function Component() {
      const updateA = useSetRecoilState(atomA);
      const updateB = useSetRecoilState(atomB);
      update = () => {
        updateA(() => {
          updateB(1);
          return 1;
        });
      };
      return null;
    }

    renderElements(<Component />);
    expect(() =>
      act(() => {
        update();
      }),
    ).toThrow('pure function');
  },
);

describe('override prop', () => {
  testRecoil(
    'RecoilRoots create a new Recoil scope when override is true or undefined',
    () => {
      const myAtom = atom({
        key: 'RecoilRoot/override/atom',
        default: 'DEFAULT',
      });

      const [ReadsWritesAtom, setAtom] =
        componentThatReadsAndWritesAtom(myAtom);

      const container = renderElements(
        <RecoilRoot>
          <ReadsAtom atom={myAtom} />
          <RecoilRoot>
            <ReadsWritesAtom />
          </RecoilRoot>
        </RecoilRoot>,
      );

      expect(container.textContent).toEqual('"DEFAULT""DEFAULT"');

      act(() => setAtom('SET'));
      expect(container.textContent).toEqual('"DEFAULT""SET"');
    },
  );

  testRecoil(
    'A RecoilRoot performs no function if override is false and it has an ancestor RecoilRoot',
    () => {
      const myAtom = atom({
        key: 'RecoilRoot/override/atom',
        default: 'DEFAULT',
      });

      const [ReadsWritesAtom, setAtom] =
        componentThatReadsAndWritesAtom(myAtom);

      const container = renderElements(
        <RecoilRoot>
          <ReadsAtom atom={myAtom} />
          <RecoilRoot override={false}>
            <ReadsAtom atom={myAtom} />
            <RecoilRoot override={false}>
              <ReadsWritesAtom />
            </RecoilRoot>
          </RecoilRoot>
        </RecoilRoot>,
      );

      expect(container.textContent).toEqual('"DEFAULT""DEFAULT""DEFAULT"');

      act(() => setAtom('SET'));
      expect(container.textContent).toEqual('"SET""SET""SET"');
    },
  );

  testRecoil(
    'Unmounting a nested RecoilRoot with override set to false does not clean up ancestor Recoil atoms',
    () => {
      const myAtom = atom({
        key: 'RecoilRoot/override/atom',
        default: 'DEFAULT',
      });

      const [ReadsWritesAtom, setAtom] =
        componentThatReadsAndWritesAtom(myAtom);

      let setRenderNestedRoot;
      const NestedRootContainer = () => {
        const [renderNestedRoot, _setRenderNestedRoot] = useState(true);
        setRenderNestedRoot = _setRenderNestedRoot;
        return (
          renderNestedRoot && (
            <RecoilRoot override={false}>
              <ReadsWritesAtom />
            </RecoilRoot>
          )
        );
      };

      const container = renderElements(
        <RecoilRoot>
          <ReadsAtom atom={myAtom} />
          <NestedRootContainer />
        </RecoilRoot>,
      );

      expect(container.textContent).toEqual('"DEFAULT""DEFAULT"');

      act(() => setAtom('SET'));
      act(() => setRenderNestedRoot(false));
      expect(container.textContent).toEqual('"SET"');
    },
  );

  testRecoil(
    'A RecoilRoot functions normally if override is false and it does not have an ancestor RecoilRoot',
    () => {
      const myAtom = atom({
        key: 'RecoilRoot/override/atom',
        default: 'DEFAULT',
      });

      const [ReadsWritesAtom, setAtom] =
        componentThatReadsAndWritesAtom(myAtom);

      const container = renderElements(
        <RecoilRoot override={false}>
          <ReadsWritesAtom />
        </RecoilRoot>,
      );

      expect(container.textContent).toEqual('"DEFAULT"');

      act(() => setAtom('SET'));
      expect(container.textContent).toEqual('"SET"');
    },
  );
});
