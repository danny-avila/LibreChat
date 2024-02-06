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
/* eslint-disable fb-www/react-no-useless-fragment */

'use strict';

import type {
  RecoilState,
  RecoilValue,
  RecoilValueReadOnly,
} from '../../core/Recoil_RecoilValue';
import type {PersistenceSettings} from '../../recoil_values/Recoil_atom';
import type {Node} from 'react';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let React,
  useEffect,
  useState,
  Profiler,
  act,
  Queue,
  batchUpdates,
  atom,
  selector,
  selectorFamily,
  ReadsAtom,
  renderElements,
  renderUnwrappedElements,
  recoilComponentGetRecoilValueCount_FOR_TESTING,
  useRecoilState,
  useRecoilStateLoadable,
  useRecoilValue,
  useSetRecoilState,
  reactMode,
  invariant;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({useEffect, useState, Profiler} = require('react'));
  ({act} = require('ReactTestUtils'));

  Queue = require('../../adt/Recoil_Queue');
  ({batchUpdates} = require('../../core/Recoil_Batching'));
  atom = require('../../recoil_values/Recoil_atom');
  selector = require('../../recoil_values/Recoil_selector');
  selectorFamily = require('../../recoil_values/Recoil_selectorFamily');
  ({
    ReadsAtom,
    renderElements,
    renderUnwrappedElements,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  ({reactMode} = require('../../core/Recoil_ReactMode'));
  ({
    recoilComponentGetRecoilValueCount_FOR_TESTING,
    useRecoilState,
    useRecoilStateLoadable,
    useRecoilValue,
    useSetRecoilState,
  } = require('../Recoil_Hooks'));

  invariant = require('recoil-shared/util/Recoil_invariant');
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

function additionSelector(
  depA: RecoilValue<number>,
  depB: RecoilValue<number>,
) {
  const fn = jest.fn((a, b) => a + b);
  const sel = selector({
    key: `selector${nextID++}`,
    get: ({get}) => fn(get(depA), get(depB)),
  });
  return [sel, fn];
}

function componentThatReadsAndWritesAtom<T>(
  recoilState: RecoilState<T>,
): [React.AbstractComponent<{...}>, ((T => T) | T) => void] {
  let updateValue;
  const Component = jest.fn(() => {
    const [value, _updateValue] = useRecoilState(recoilState);
    updateValue = _updateValue;
    return value;
  });
  // flowlint-next-line unclear-type:off
  return [(Component: any), (...args) => updateValue(...args)];
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

function componentThatReadsTwoAtoms(
  one: RecoilState<number>,
  two: RecoilState<number> | RecoilValueReadOnly<number>,
) {
  return (jest.fn(function ReadTwoAtoms() {
    return `${useRecoilValue(one)},${useRecoilValue(two)}`;
  }): any); // flowlint-line unclear-type:off
}

function componentThatReadsAtomWithCommitCount(
  recoilState: RecoilState<number> | RecoilValueReadOnly<number>,
) {
  const commit = jest.fn(() => {});
  function ReadAtom() {
    return (
      // $FlowFixMe[invalid-tuple-arity]
      <Profiler id="test" onRender={commit}>
        {useRecoilValue(recoilState)}
      </Profiler>
    );
  }
  return [ReadAtom, commit];
}

function componentThatToggles(a: Node, b: null) {
  const toggle = {current: () => invariant(false, 'bug in test code')};
  const Toggle = () => {
    const [value, setValue] = useState(false);
    // $FlowFixMe[incompatible-type]
    toggle.current = () => setValue(v => !v);
    return value ? b : a;
  };
  return [Toggle, toggle];
}

function baseRenderCount(gks: Array<string>): number {
  return reactMode().mode === 'LEGACY' &&
    !gks.includes('recoil_suppress_rerender_in_callback')
    ? 1
    : 0;
}

testRecoil('Component throws error when passing invalid node', async () => {
  function Component() {
    try {
      // $FlowExpectedError[incompatible-call]
      useRecoilValue('foo');
    } catch (error) {
      expect(error.message).toEqual(expect.stringContaining('useRecoilValue'));
      return 'CAUGHT';
    }
    return 'INVALID';
  }

  const container = renderElements(<Component />);
  expect(container.textContent).toEqual('CAUGHT');
});

testRecoil('Components are re-rendered when atoms change', async () => {
  const anAtom = counterAtom();
  const [Component, updateValue] = componentThatReadsAndWritesAtom(anAtom);
  const container = renderElements(<Component />);
  expect(container.textContent).toEqual('0');
  act(() => updateValue(1));
  expect(container.textContent).toEqual('1');
});

describe('Render counts', () => {
  testRecoil(
    'Component subscribed to atom is rendered just once',
    ({gks, strictMode}) => {
      const BASE_CALLS = baseRenderCount(gks);
      const sm = strictMode ? 2 : 1;

      const anAtom = counterAtom();
      const [Component, updateValue] = componentThatReadsAndWritesAtom(anAtom);
      renderElements(
        <>
          <Component />
        </>,
      );

      expect(Component).toHaveBeenCalledTimes((BASE_CALLS + 1) * sm);
      act(() => updateValue(1));
      expect(Component).toHaveBeenCalledTimes((BASE_CALLS + 2) * sm);
    },
  );

  testRecoil('Write-only components are not subscribed', ({strictMode}) => {
    const anAtom = counterAtom();
    const [Component, updateValue] = componentThatWritesAtom(anAtom);
    renderElements(
      <>
        <Component />
      </>,
    );
    expect(Component).toHaveBeenCalledTimes(strictMode ? 2 : 1);
    act(() => updateValue(1));
    expect(Component).toHaveBeenCalledTimes(strictMode ? 2 : 1);
  });

  testRecoil(
    'Component that depends on atom in multiple ways is rendered just once',
    ({gks, strictMode}) => {
      const BASE_CALLS = baseRenderCount(gks);
      const sm = strictMode ? 2 : 1;

      const anAtom = counterAtom();
      const [aSelector, _] = plusOneSelector(anAtom);
      const [WriteComp, updateValue] = componentThatWritesAtom(anAtom);
      // $FlowFixMe[incompatible-call]
      const ReadComp = componentThatReadsTwoAtoms(anAtom, aSelector);
      renderElements(
        <>
          <WriteComp />
          <ReadComp />
        </>,
      );

      expect(ReadComp).toHaveBeenCalledTimes((BASE_CALLS + 1) * sm);
      act(() => updateValue(1));
      expect(ReadComp).toHaveBeenCalledTimes((BASE_CALLS + 2) * sm);
    },
  );

  testRecoil(
    'Component that depends on multiple atoms via selector is rendered just once',
    ({gks}) => {
      const BASE_CALLS = baseRenderCount(gks);

      const atomA = counterAtom();
      const atomB = counterAtom();
      const [aSelector, _] = additionSelector(atomA, atomB);
      const [ComponentA, updateValueA] = componentThatWritesAtom(atomA);
      const [ComponentB, updateValueB] = componentThatWritesAtom(atomB);
      const [ReadComp, commit] =
        // $FlowFixMe[incompatible-call]
        componentThatReadsAtomWithCommitCount(aSelector);
      renderElements(
        <>
          <ComponentA />
          <ComponentB />
          <ReadComp />
        </>,
      );

      expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 1);
      act(() => {
        batchUpdates(() => {
          updateValueA(1);
          updateValueB(1);
        });
      });
      expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 2);
    },
  );

  testRecoil(
    'Component that depends on multiple atoms directly is rendered just once',
    ({gks, strictMode}) => {
      const BASE_CALLS = baseRenderCount(gks);
      const sm = strictMode ? 2 : 1;

      const atomA = counterAtom();
      const atomB = counterAtom();
      const [ComponentA, updateValueA] = componentThatWritesAtom(atomA);
      const [ComponentB, updateValueB] = componentThatWritesAtom(atomB);
      const ReadComp = componentThatReadsTwoAtoms(atomA, atomB);
      renderElements(
        <>
          <ComponentA />
          <ComponentB />
          <ReadComp />
        </>,
      );

      expect(ReadComp).toHaveBeenCalledTimes((BASE_CALLS + 1) * sm);
      act(() => {
        batchUpdates(() => {
          updateValueA(1);
          updateValueB(1);
        });
      });
      expect(ReadComp).toHaveBeenCalledTimes((BASE_CALLS + 2) * sm);
    },
  );

  testRecoil(
    'Component is rendered just once when atom is changed twice',
    ({gks}) => {
      const BASE_CALLS = baseRenderCount(gks);

      const atomA = counterAtom();
      const [ComponentA, updateValueA] = componentThatWritesAtom(atomA);
      const [ReadComp, commit] = componentThatReadsAtomWithCommitCount(atomA);
      renderElements(
        <>
          <ComponentA />
          <ReadComp />
        </>,
      );

      expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 1);
      act(() => {
        batchUpdates(() => {
          updateValueA(1);
          updateValueA(2);
        });
      });
      expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 2);
    },
  );

  testRecoil(
    'Component does not re-read atom when rendered due to another atom changing, parent re-render, or other state change',
    () => {
      // useSyncExternalStore() will always call getSnapshot() to see if it has
      // mutated between render and commit.
      if (
        reactMode().mode === 'LEGACY' ||
        reactMode().mode === 'SYNC_EXTERNAL_STORE'
      ) {
        return;
      }

      const atomA = counterAtom();
      const atomB = counterAtom();

      let _, setLocal;
      let _a, setA;
      let _b, _setB;
      function Component() {
        [_, setLocal] = useState(0);
        [_a, setA] = useRecoilState(atomA);
        [_b, _setB] = useRecoilState(atomB);
        return null;
      }

      let __, setParentLocal;
      function Parent() {
        [__, setParentLocal] = useState(0);
        return <Component />;
      }

      renderElements(<Parent />);

      const initialCalls =
        recoilComponentGetRecoilValueCount_FOR_TESTING.current;
      expect(initialCalls).toBeGreaterThan(0);

      // No re-read when setting local state on the component:
      act(() => {
        setLocal(1);
      });
      expect(recoilComponentGetRecoilValueCount_FOR_TESTING.current).toBe(
        initialCalls,
      );

      // No re-read when setting local state on its parent causing it to re-render:
      act(() => {
        setParentLocal(1);
      });
      expect(recoilComponentGetRecoilValueCount_FOR_TESTING.current).toBe(
        initialCalls,
      );

      // Setting an atom causes a re-read for that atom only, not others:
      act(() => {
        setA(1);
      });
      expect(recoilComponentGetRecoilValueCount_FOR_TESTING.current).toBe(
        initialCalls + 1,
      );
    },
  );

  testRecoil(
    'Components re-render only one time if selectorFamily changed',
    ({gks, strictMode}) => {
      const BASE_CALLS = baseRenderCount(gks);
      const sm = strictMode ? 2 : 1;

      const atomA = counterAtom();

      const selectAFakeId = selectorFamily({
        key: 'selectItem',
        get:
          (_id: number) =>
          // $FlowFixMe[missing-local-annot]
          ({get}) =>
            get(atomA),
      });

      const Component = (jest.fn(function ReadFromSelector({id}) {
        return useRecoilValue(selectAFakeId(id));
      }): ({id: number}) => React.Node);

      let increment;

      const App = () => {
        const [state, setState] = useRecoilState(atomA);
        increment = () => setState(s => s + 1);
        return <Component id={state} />;
      };

      const container = renderElements(<App />);

      let baseCalls = BASE_CALLS;

      expect(container.textContent).toEqual('0');
      expect(Component).toHaveBeenCalledTimes((baseCalls + 1) * sm);

      act(() => increment());

      if (
        (reactMode().mode === 'LEGACY' &&
          !gks.includes('recoil_suppress_rerender_in_callback')) ||
        reactMode().mode === 'TRANSITION_SUPPORT'
      ) {
        baseCalls += 1;
      }

      expect(container.textContent).toEqual('1');
      expect(Component).toHaveBeenCalledTimes((baseCalls + 2) * sm);
    },
  );
});

describe('Component Subscriptions', () => {
  testRecoil(
    'Can subscribe to and also change an atom in the same batch',
    () => {
      const anAtom = counterAtom();

      let setVisible;
      function Switch({children}: $TEMPORARY$object<{children: Node}>) {
        const [visible, mySetVisible] = useState(false);
        setVisible = mySetVisible;
        return visible ? children : null;
      }

      const [Component, updateValue] = componentThatWritesAtom(anAtom);
      const container = renderElements(
        <>
          <Component />
          <Switch>
            <ReadsAtom atom={anAtom} />
          </Switch>
        </>,
      );

      expect(container.textContent).toEqual('');

      act(() => {
        batchUpdates(() => {
          setVisible(true);
          updateValue(1337);
        });
      });
      expect(container.textContent).toEqual('1337');
    },
  );

  testRecoil('Atom values are retained when atom has no subscribers', () => {
    const anAtom = counterAtom();

    let setVisible;
    function Switch({children}: $TEMPORARY$object<{children: Node}>) {
      const [visible, mySetVisible] = useState(true);
      setVisible = mySetVisible;
      return visible ? children : null;
    }

    const [Component, updateValue] = componentThatWritesAtom(anAtom);
    const container = renderElements(
      <>
        <Component />
        <Switch>
          <ReadsAtom atom={anAtom} />
        </Switch>
      </>,
    );

    act(() => updateValue(1337));
    expect(container.textContent).toEqual('1337');
    act(() => setVisible(false));
    expect(container.textContent).toEqual('');
    act(() => setVisible(true));
    expect(container.textContent).toEqual('1337');
  });

  testRecoil(
    'Components unsubscribe from atoms when rendered without using them',
    ({gks, strictMode}) => {
      const BASE_CALLS = baseRenderCount(gks);
      const sm = strictMode ? 2 : 1;

      const atomA = counterAtom();
      const atomB = counterAtom();
      const [WriteA, updateValueA] = componentThatWritesAtom(atomA);
      const [WriteB, updateValueB] = componentThatWritesAtom(atomB);

      const Component = (jest.fn(function Read({state}) {
        const [value] = useRecoilState<mixed>(state);
        return value;
      }): any); // flowlint-line unclear-type:off

      let toggleSwitch;
      const Switch = () => {
        const [value, setValue] = useState(false);
        toggleSwitch = () => setValue(true);
        return value ? (
          <Component state={atomB} />
        ) : (
          <Component state={atomA} />
        );
      };

      const container = renderElements(
        <>
          <Switch />
          <WriteA />
          <WriteB />
        </>,
      );

      let baseCalls = BASE_CALLS;

      expect(container.textContent).toEqual('0');
      expect(Component).toHaveBeenCalledTimes((baseCalls + 1) * sm);

      act(() => updateValueA(1));
      expect(container.textContent).toEqual('1');
      expect(Component).toHaveBeenCalledTimes((baseCalls + 2) * sm);

      if (
        (reactMode().mode === 'LEGACY' &&
          !gks.includes('recoil_suppress_rerender_in_callback')) ||
        reactMode().mode === 'TRANSITION_SUPPORT'
      ) {
        baseCalls += 1;
      }

      act(() => toggleSwitch());
      expect(container.textContent).toEqual('0');
      expect(Component).toHaveBeenCalledTimes((baseCalls + 3) * sm);

      // Now update the atom that it used to be subscribed to but should be no longer:
      act(() => updateValueA(2));
      expect(container.textContent).toEqual('0');

      expect(Component).toHaveBeenCalledTimes((baseCalls + 3) * sm); // Important part: same as before

      // It is subscribed to the atom that it switched to:
      act(() => updateValueB(3));
      expect(container.textContent).toEqual('3');
      expect(Component).toHaveBeenCalledTimes((baseCalls + 4) * sm);
    },
  );

  testRecoil(
    'Selectors unsubscribe from upstream when they have no subscribers',
    () => {
      const atomA = counterAtom();
      const atomB = counterAtom();
      const [WriteA, updateValueA] = componentThatWritesAtom(atomA);

      // Do two layers of selectors to test that the unsubscribing is recursive:
      const selectorMapFn1 = jest.fn(x => x);
      const sel1 = selector({
        key: 'selUpstream',
        get: ({get}) => selectorMapFn1(get(atomA)),
      });

      const selectorMapFn2 = jest.fn(x => x);
      const sel2 = selector({
        key: 'selDownstream',
        get: ({get}) => selectorMapFn2(get(sel1)),
      });

      let toggleSwitch;
      const Switch = () => {
        const [value, setValue] = useState(false);
        toggleSwitch = () => setValue(true);
        return value ? <ReadsAtom atom={atomB} /> : <ReadsAtom atom={sel2} />;
      };

      const container = renderElements(
        <>
          <Switch />
          <WriteA />
        </>,
      );
      expect(container.textContent).toEqual('0');
      expect(selectorMapFn1).toHaveBeenCalledTimes(1);
      expect(selectorMapFn2).toHaveBeenCalledTimes(1);

      act(() => updateValueA(1));
      expect(container.textContent).toEqual('1');
      expect(selectorMapFn1).toHaveBeenCalledTimes(2);
      expect(selectorMapFn2).toHaveBeenCalledTimes(2);

      act(() => toggleSwitch());
      expect(container.textContent).toEqual('0');
      expect(selectorMapFn1).toHaveBeenCalledTimes(2);
      expect(selectorMapFn2).toHaveBeenCalledTimes(2);

      act(() => updateValueA(2));
      expect(container.textContent).toEqual('0');
      expect(selectorMapFn1).toHaveBeenCalledTimes(2);
      expect(selectorMapFn2).toHaveBeenCalledTimes(2);
    },
  );

  testRecoil(
    'Unsubscribes happen in case of unmounting of a suspended component',
    () => {
      const anAtom = counterAtom();
      const [aSelector, _selFn] = plusOneSelector(anAtom);
      // $FlowFixMe[incompatible-call]
      const [_asyncSel, _adjustTimeout] = plusOneAsyncSelector(aSelector);
      // FIXME to implement
    },
  );

  testRecoil(
    'Selectors stay up to date if deps are changed while they have no subscribers',
    () => {
      const anAtom = counterAtom();
      const [aSelector, _] = plusOneSelector(anAtom);

      let setVisible;
      function Switch({children}: $TEMPORARY$object<{children: Node}>) {
        const [visible, mySetVisible] = useState(true);
        setVisible = mySetVisible;
        return visible ? children : null;
      }

      const [Component, updateValue] = componentThatWritesAtom(anAtom);
      const container = renderElements(
        <>
          <Component />
          <Switch>
            <ReadsAtom atom={aSelector} />
          </Switch>
        </>,
      );

      act(() => updateValue(1));
      expect(container.textContent).toEqual('2');
      act(() => setVisible(false));
      expect(container.textContent).toEqual('');
      act(() => updateValue(2));
      expect(container.textContent).toEqual('');
      act(() => setVisible(true));
      expect(container.textContent).toEqual('3');
    },
  );

  testRecoil(
    'Selector subscriptions are correct when a selector is unsubscribed the second time',
    async () => {
      // This regression test would fail by an exception being thrown because subscription refcounts
      // would would fall below zero.
      const anAtom = counterAtom();
      const [sel, _] = plusOneSelector(anAtom);
      const [Toggle, toggle] = componentThatToggles(
        <ReadsAtom atom={sel} />,
        null,
      );
      const container = renderElements(
        <>
          <Toggle />
        </>,
      );

      expect(container.textContent).toEqual('1');

      act(() => toggle.current());
      expect(container.textContent).toEqual('');

      act(() => toggle.current());
      expect(container.textContent).toEqual('1');

      act(() => toggle.current());
      expect(container.textContent).toEqual('');
    },
  );
});

testRecoil('Can set an atom during rendering', () => {
  const anAtom = counterAtom();

  function SetsDuringRendering() {
    const [value, setValue] = useRecoilState(anAtom);
    if (value !== 1) {
      setValue(1);
    }
    return null;
  }

  const container = renderElements(
    <>
      <SetsDuringRendering />
      <ReadsAtom atom={anAtom} />
    </>,
  );

  expect(container.textContent).toEqual('1');
});

testRecoil(
  'Does not re-create "setter" function after setting a value',
  ({strictMode, concurrentMode}) => {
    const sm = strictMode && concurrentMode ? 2 : 1;

    const anAtom = counterAtom();
    const anotherAtom = counterAtom();
    let useRecoilStateCounter = 0;
    let useRecoilStateErrorStatesCounter = 0;
    let useTwoAtomsCounter = 0;

    function Component1() {
      const [_, setValue] = useRecoilState(anAtom);
      useEffect(() => {
        setValue(1);
        useRecoilStateCounter += 1;
      }, [setValue]);
      return null;
    }

    function Component2() {
      const [_, setValue] = useRecoilStateLoadable(anAtom);
      useEffect(() => {
        setValue(2);
        useRecoilStateErrorStatesCounter += 1;
      }, [setValue]);
      return null;
    }

    // It is important to test here that the component will re-render with the
    // new setValue() function for a new atom, even if the value of the new
    // atom is the same as the previous value of the previous atom.
    function Component3() {
      const a = useTwoAtomsCounter > 0 ? anotherAtom : anAtom;
      // setValue fn should change when we use a different atom.
      const [, setValue] = useRecoilState(a);
      useEffect(() => {
        setValue(1);
        useTwoAtomsCounter += 1;
      }, [setValue]);
      return null;
    }

    renderElements(
      <>
        <Component1 />
        <Component2 />
        <Component3 />
      </>,
    );

    expect(useRecoilStateCounter).toBe(1 * sm);
    expect(useRecoilStateErrorStatesCounter).toBe(1 * sm);

    // Component3's effect is ran twice because the atom changes and we get a new setter.
    // StrictMode renders twice, but we only change atoms once.  So, only one extra count.
    expect(useTwoAtomsCounter).toBe(strictMode && concurrentMode ? 3 : 2);
  },
);

testRecoil(
  'Can set atom during post-atom-setting effect (NOT during initial render)',
  async () => {
    const anAtom = counterAtom();

    let done = false;
    function SetsDuringEffect() {
      const setValue = useSetRecoilState(anAtom);
      useEffect(() => {
        Queue.enqueueExecution('SetsDuringEffect', () => {
          if (!done) {
            setValue(1);
            done = true;
          }
        });
      });
      return null;
    }

    const container = renderElements(
      <>
        <SetsDuringEffect />
        <ReadsAtom atom={anAtom} />
      </>,
    );

    expect(container.textContent).toEqual('1');
  },
);

testRecoil(
  'Can set atom during post-atom-setting effect regardless of effect order',
  async ({concurrentMode}) => {
    // TODO Test doesn't work in ConcurrentMode.  Haven't investigated why,
    // but it seems fragile with the Queue for enforcing order.
    if (concurrentMode) {
      return;
    }

    function testWithOrder(
      order: $TEMPORARY$array<
        $TEMPORARY$string<'Batcher'> | $TEMPORARY$string<'SetsDuringEffect'>,
      >,
    ) {
      const anAtom = counterAtom();

      let q: Array<[string, () => mixed]> = [];
      let seen = false;
      const original = Queue.enqueueExecution;
      try {
        Queue.enqueueExecution = (s, f) => {
          if (s === order[0] || seen) {
            seen = true;
            f();
            q.forEach(([_, g]) => g());
          } else {
            q.push([s, f]);
          }
        };

        function SetsDuringEffect() {
          const [value, setValue] = useRecoilState(anAtom);
          useEffect(() => {
            Queue.enqueueExecution('SetsDuringEffect', () => {
              if (value !== 1) {
                setValue(1);
              }
            });
          });
          return null;
        }

        const [Comp, updateValue] = componentThatWritesAtom(anAtom);
        const container = renderElements(
          <>
            <SetsDuringEffect />
            <ReadsAtom atom={anAtom} />
            <Comp />
          </>,
        );
        q = [];
        seen = false;

        // Thus it appears that it only breaks on the initial render.
        act(() => {
          updateValue(0);
        });

        expect(container.textContent).toEqual('1');
      } finally {
        Queue.enqueueExecution = original;
      }
    }

    testWithOrder(['SetsDuringEffect', 'Batcher']);
    testWithOrder(['Batcher', 'SetsDuringEffect']);
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
