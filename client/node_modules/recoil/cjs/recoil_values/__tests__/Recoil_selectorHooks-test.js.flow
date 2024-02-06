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
import type {Loadable} from 'Recoil_Loadable';
import type {WrappedValue} from 'Recoil_Wrapper';
import type {Node} from 'react';

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let React,
  useEffect,
  useState,
  Profiler,
  act,
  batchUpdates,
  RecoilRoot,
  atom,
  constSelector,
  errorSelector,
  selector,
  noWait,
  ReadsAtom,
  asyncSelector,
  loadingAsyncSelector,
  resolvingAsyncSelector,
  errorThrowingAsyncSelector,
  stringAtom,
  flushPromisesAndTimers,
  renderElements,
  renderUnwrappedElements,
  renderElementsWithSuspenseCount,
  componentThatReadsAndWritesAtom,
  useRecoilState,
  useRecoilValue,
  useRecoilValueLoadable,
  useSetRecoilState,
  useResetRecoilState,
  useRecoilCallback,
  reactMode,
  invariant,
  nullthrows;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({useEffect, useState, Profiler} = require('react'));
  ({act} = require('ReactTestUtils'));

  ({batchUpdates} = require('../../core/Recoil_Batching'));
  ({RecoilRoot} = require('../../core/Recoil_RecoilRoot'));
  atom = require('../../recoil_values/Recoil_atom');
  constSelector = require('../../recoil_values/Recoil_constSelector');
  errorSelector = require('../../recoil_values/Recoil_errorSelector');
  ({noWait} = require('../../recoil_values/Recoil_WaitFor'));
  selector = require('../../recoil_values/Recoil_selector');
  ({
    ReadsAtom,
    asyncSelector,
    loadingAsyncSelector,
    resolvingAsyncSelector,
    errorThrowingAsyncSelector,
    stringAtom,
    flushPromisesAndTimers,
    renderElements,
    renderUnwrappedElements,
    renderElementsWithSuspenseCount,
    componentThatReadsAndWritesAtom,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  ({reactMode} = require('../../core/Recoil_ReactMode'));
  ({
    useRecoilState,
    useRecoilValue,
    useRecoilValueLoadable,
    useSetRecoilState,
    useResetRecoilState,
  } = require('../../hooks/Recoil_Hooks'));
  ({useRecoilCallback} = require('../../hooks/Recoil_useRecoilCallback'));

  invariant = require('recoil-shared/util/Recoil_invariant');
  nullthrows = require('recoil-shared/util/Recoil_nullthrows');
});

let nextID = 0;

function counterAtom(persistence?: PersistenceSettings<number>) {
  return atom({
    key: `atom${nextID++}`,
    default: 0,
    persistence_UNSTABLE: persistence,
  });
}

function booleanAtom(persistence?: PersistenceSettings<boolean>) {
  return atom<boolean>({
    key: `atom${nextID++}`,
    default: false,
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

function asyncSelectorThatPushesPromisesOntoArray<T, S>(
  dep: RecoilValue<S>,
): [RecoilValue<T>, $ReadOnlyArray<[(T) => void, (mixed) => void]>] {
  const promises: Array<[(T) => void, (mixed) => void]> = [];
  // $FlowFixMe[incompatible-call]
  const sel = selector<T>({
    key: `selector${nextID++}`,
    get: ({get}) => {
      get(dep);
      let resolve: T => void = () => invariant(false, 'bug in test code'); // make flow happy with initialization
      let reject: mixed => void = () => invariant(false, 'bug in test code');
      const p = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      promises.push([resolve, reject]);
      return p;
    },
  });
  return [sel, promises];
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

function componentThatReadsAtomWithCommitCount(
  recoilState: RecoilValueReadOnly<number>,
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

function advanceTimersBy(ms: number) {
  // Jest does the right thing for runAllTimers but not advanceTimersByTime:
  act(() => {
    jest.runAllTicks();
    jest.runAllImmediates();
    jest.advanceTimersByTime(ms);
    jest.runAllImmediates(); // order seems backwards but matches jest.runAllTimers().
    jest.runAllTicks();
  });
}

function baseRenderCount(gks: Array<string>): number {
  return reactMode().mode === 'LEGACY' &&
    !gks.includes('recoil_suppress_rerender_in_callback')
    ? 1
    : 0;
}

testRecoil('static selector', () => {
  const staticSel = constSelector('HELLO');
  const c = renderElements(<ReadsAtom atom={staticSel} />);
  expect(c.textContent).toEqual('"HELLO"');
});

describe('Updates', () => {
  testRecoil('Selectors are updated when upstream atoms change', () => {
    const anAtom = counterAtom();
    const [aSelector, _] = plusOneSelector(anAtom);
    const [Component, updateValue] = componentThatWritesAtom(anAtom);
    const container = renderElements(
      <>
        <Component />
        <ReadsAtom atom={aSelector} />
      </>,
    );
    expect(container.textContent).toEqual('1');
    act(() => updateValue(1));
    expect(container.textContent).toEqual('2');
  });

  testRecoil('Selectors can depend on other selectors', () => {
    const anAtom = counterAtom();
    const [selectorA, _] = plusOneSelector(anAtom);
    // $FlowFixMe[incompatible-call]
    const [selectorB, __] = plusOneSelector(selectorA);
    const [Component, updateValue] = componentThatWritesAtom(anAtom);
    const container = renderElements(
      <>
        <Component />
        <ReadsAtom atom={selectorB} />
      </>,
    );
    expect(container.textContent).toEqual('2');
    act(() => updateValue(1));
    expect(container.textContent).toEqual('3');
  });

  testRecoil('Selectors can depend on async selectors', async () => {
    jest.useFakeTimers();
    const anAtom = counterAtom();
    const [selectorA, _] = plusOneAsyncSelector(anAtom);
    const [selectorB, __] = plusOneSelector(selectorA);
    const [Component, updateValue] = componentThatWritesAtom(anAtom);
    const container = renderElements(
      <>
        <Component />
        <ReadsAtom atom={selectorB} />
      </>,
    );
    expect(container.textContent).toEqual('loading');

    act(() => jest.runAllTimers());
    await flushPromisesAndTimers();
    expect(container.textContent).toEqual('2');

    act(() => updateValue(1));

    expect(container.textContent).toEqual('loading');

    act(() => jest.runAllTimers());
    await flushPromisesAndTimers();
    expect(container.textContent).toEqual('3');
  });

  testRecoil('Async selectors can depend on async selectors', async () => {
    jest.useFakeTimers();
    const anAtom = counterAtom();
    const [selectorA, _] = plusOneAsyncSelector(anAtom);
    const [selectorB, __] = plusOneAsyncSelector(selectorA);
    const [Component, updateValue] = componentThatWritesAtom(anAtom);
    const container = renderElements(
      <>
        <Component />
        <ReadsAtom atom={selectorB} />
      </>,
    );

    if (reactMode().mode !== 'LEGACY') {
      await flushPromisesAndTimers();
      expect(container.textContent).toEqual('2');

      act(() => updateValue(1));
      expect(container.textContent).toEqual('loading');

      await flushPromisesAndTimers();
      expect(container.textContent).toEqual('3');
    } else {
      // we need to test the useRecoilValueLoadable_LEGACY method

      expect(container.textContent).toEqual('loading');

      act(() => jest.runAllTimers());
      await flushPromisesAndTimers();
      expect(container.textContent).toEqual('2');

      act(() => updateValue(1));
      expect(container.textContent).toEqual('loading');

      act(() => jest.runAllTimers());
      await flushPromisesAndTimers();
      expect(container.textContent).toEqual('3');
    }
  });

  testRecoil('Dep of upstream selector can change while pending', async () => {
    const anAtom = counterAtom();
    const [upstreamSel, upstreamResolvers] =
      asyncSelectorThatPushesPromisesOntoArray<$FlowFixMe | number, _>(anAtom);
    const [downstreamSel, downstreamResolvers] =
      asyncSelectorThatPushesPromisesOntoArray<$FlowFixMe | number, _>(
        upstreamSel,
      );

    const [Component, updateValue] = componentThatWritesAtom(anAtom);
    const container = renderElements(
      <>
        <Component />
        <ReadsAtom atom={downstreamSel} />
      </>,
    );

    // Initially, upstream has returned a promise so there is one upstream resolver.
    // Downstream is waiting on upstream so it hasn't returned anything yet.
    expect(container.textContent).toEqual('loading');
    expect(upstreamResolvers.length).toEqual(1);
    expect(downstreamResolvers.length).toEqual(0);

    // Resolve upstream; downstream should now have returned a new promise:
    upstreamResolvers[0][0](123);
    await flushPromisesAndTimers();
    expect(downstreamResolvers.length).toEqual(1);

    // Update atom to a new value while downstream is pending:
    act(() => updateValue(1));
    await flushPromisesAndTimers();

    // Upstream returns a new promise for the new atom value.
    // Downstream is once again waiting on upstream so it hasn't returned a new
    // promise for the new value.
    expect(upstreamResolvers.length).toEqual(2);
    expect(downstreamResolvers.length).toEqual(1);

    // Resolve the new upstream promise:
    upstreamResolvers[1][0](123);
    await flushPromisesAndTimers();

    // Downstream can now return its new promise:
    expect(downstreamResolvers.length).toEqual(2);

    // If we resolve downstream's new promise we should see the result:
    downstreamResolvers[1][0](123);
    await flushPromisesAndTimers();
    expect(container.textContent).toEqual('123');
  });

  testRecoil('Errors are propogated through selectors', () => {
    const errorThrower = errorSelector<number>('ERROR');
    const [downstreamSelector] = plusOneSelector(errorThrower);
    const container = renderElements(
      <>
        <ReadsAtom atom={downstreamSelector} />
      </>,
    );
    expect(container.textContent).toEqual('error');
  });

  testRecoil(
    'Rejected promises are propogated through selectors (immediate rejection)',
    async () => {
      const anAtom = counterAtom();
      const errorThrower = errorThrowingAsyncSelector<number, _>(
        'ERROR',
        anAtom,
      );
      const [downstreamSelector] = plusOneAsyncSelector(errorThrower);
      const container = renderElements(
        <>
          <ReadsAtom atom={downstreamSelector} />
        </>,
      );
      expect(container.textContent).toEqual('loading');
      await flushPromisesAndTimers();
      await flushPromisesAndTimers(); // Double flush for open source environment
      expect(container.textContent).toEqual('error');
    },
  );

  testRecoil(
    'Rejected promises are propogated through selectors (later rejection)',
    async () => {
      const anAtom = counterAtom();
      const [errorThrower, _resolve, reject] = asyncSelector<number, _>(anAtom);
      const [downstreamSelector] = plusOneAsyncSelector(errorThrower);
      const container = renderElements(
        <>
          <ReadsAtom atom={downstreamSelector} />
        </>,
      );
      expect(container.textContent).toEqual('loading');
      act(() => reject(new Error()));
      await flushPromisesAndTimers();
      await flushPromisesAndTimers(); // Double flush for open source environment
      expect(container.textContent).toEqual('error');
    },
  );
});

testRecoil('Selectors can be invertible', () => {
  const anAtom = counterAtom();
  // $FlowFixMe[incompatible-call]
  const aSelector = selector({
    key: 'invertible1',
    get: ({get}) => get(anAtom),
    // $FlowFixMe[incompatible-call]
    set: ({set}, newValue) => set(anAtom, newValue),
  });

  const [Component, updateValue] = componentThatWritesAtom(aSelector);
  const container = renderElements(
    <>
      <Component />
      <ReadsAtom atom={anAtom} />
    </>,
  );

  expect(container.textContent).toEqual('0');
  act(() => updateValue(1));
  expect(container.textContent).toEqual('1');
});

describe('Dynamic Dependencies', () => {
  testRecoil('Selector dependencies can change over time', () => {
    const atomA = counterAtom();
    const atomB = counterAtom();
    // $FlowFixMe[incompatible-call]
    const aSelector = selector({
      key: 'depsChange',
      get: ({get}) => {
        const a = get(atomA);
        if (a === 1337) {
          const b = get(atomB);
          return b;
        } else {
          return a;
        }
      },
    });

    const [ComponentA, updateValueA] = componentThatWritesAtom(atomA);
    const [ComponentB, updateValueB] = componentThatWritesAtom(atomB);

    const container = renderElements(
      <>
        <ComponentA />
        <ComponentB />
        <ReadsAtom atom={aSelector} />
      </>,
    );

    expect(container.textContent).toEqual('0');
    act(() => updateValueA(1337));
    expect(container.textContent).toEqual('0');
    act(() => updateValueB(1));

    expect(container.textContent).toEqual('1');
    act(() => updateValueA(2));
    expect(container.textContent).toEqual('2');
  });

  testRecoil('Selectors can gain and lose depnedencies', ({gks}) => {
    const BASE_CALLS = baseRenderCount(gks);

    const switchAtom = booleanAtom();
    const inputAtom = counterAtom();

    // Depends on inputAtom only when switchAtom is true:
    // $FlowFixMe[incompatible-call]
    const aSelector = selector<number>({
      key: 'gainsDeps',
      get: ({get}) => {
        if (get(switchAtom)) {
          return get(inputAtom);
        } else {
          return Infinity;
        }
      },
    });

    const [ComponentA, setSwitch] = componentThatWritesAtom(switchAtom);
    const [ComponentB, setInput] = componentThatWritesAtom(inputAtom);
    const [ComponentC, commit] =
      componentThatReadsAtomWithCommitCount(aSelector);
    const container = renderElements(
      <>
        <ComponentA />
        <ComponentB />
        <ComponentC />
      </>,
    );

    expect(container.textContent).toEqual('Infinity');
    expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 1);

    // Input is not a dep yet, so this has no effect:
    act(() => setInput(1));
    expect(container.textContent).toEqual('Infinity');
    expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 1);

    // Flip switch:
    act(() => setSwitch(true));
    expect(container.textContent).toEqual('1');
    expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 2);

    // Now changing input causes a re-render:
    act(() => setInput(2));
    expect(container.textContent).toEqual('2');
    expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 3);

    // Now that we've added the dep, we can remove it...
    act(() => setSwitch(false));
    expect(container.textContent).toEqual('Infinity');
    expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 4);

    // ... and again changing input will not cause a re-render:
    act(() => setInput(3));
    expect(container.textContent).toEqual('Infinity');
    expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 4);
  });

  testRecoil('Selector depedencies are updated transactionally', () => {
    const atomA = counterAtom();
    const atomB = counterAtom();
    const atomC = counterAtom();

    const [observedSelector, selectorFn] = plusOneSelector(atomC);

    // $FlowFixMe[incompatible-call]
    const aSelector = selector({
      key: 'transactionally',
      get: ({get}) => {
        const a = get(atomA);
        const b = get(atomB);
        return a !== 0 && b === 0
          ? get(observedSelector) // We want to test this never happens
          : null;
      },
    });

    const [ComponentA, updateValueA] = componentThatWritesAtom(atomA);
    const [ComponentB, updateValueB] = componentThatWritesAtom(atomB);
    const [ComponentC, updateValueC] = componentThatWritesAtom(atomC);
    renderElements(
      <>
        <ComponentA />
        <ComponentB />
        <ComponentC />
        <ReadsAtom atom={aSelector} />
      </>,
    );

    act(() => {
      batchUpdates(() => {
        updateValueA(1);
        updateValueB(1);
      });
    });

    // observedSelector wasn't evaluated:
    expect(selectorFn).toHaveBeenCalledTimes(0);

    // nor were any subscriptions created for it:
    act(() => {
      updateValueC(1);
    });
    expect(selectorFn).toHaveBeenCalledTimes(0);
  });

  testRecoil(
    'selector is able to track dependencies discovered asynchronously',
    async () => {
      const anAtom = atom({
        key: 'atomTrackedAsync',
        default: 'Async Dep Value',
      });

      // $FlowFixMe[incompatible-call]
      const selectorWithAsyncDeps = selector({
        key: 'selectorTrackDepsIncrementally',
        get: async ({get}) => {
          await Promise.resolve(); // needed to simulate discovering a dependency asynchronously
          return get(anAtom);
        },
      });

      let setAtom;

      function Component() {
        [, setAtom] = useRecoilState(anAtom);
        const selVal = useRecoilValue(selectorWithAsyncDeps);

        return selVal;
      }

      const container = renderElements(<Component />);

      expect(container.textContent).toEqual('loading');

      await flushPromisesAndTimers();
      await flushPromisesAndTimers(); // Double flush for open source environment
      expect(container.textContent).toEqual('Async Dep Value');

      act(() => setAtom('CHANGED Async Dep'));
      expect(container.textContent).toEqual('loading');

      await flushPromisesAndTimers();
      expect(container.textContent).toEqual('CHANGED Async Dep');
    },
  );

  /**
   * This test is an extension of the 'selector is able to track dependencies
   * discovered asynchronously' test: in addition to testing that a selector
   * responds to changes in dependencies that were discovered asynchronously, the
   * selector should run through the entire selector in response to those changes.
   */
  testRecoil(
    'selector should rerun entire selector when a dep changes',
    async () => {
      const resolvingSel1 = resolvingAsyncSelector(1);
      const resolvingSel2 = resolvingAsyncSelector(2);
      const anAtom3 = atom({key: 'atomTrackedAsync3', default: 3});

      // $FlowFixMe[incompatible-call]
      const selectorWithAsyncDeps = selector({
        key: 'selectorNotCacheIncDeps',
        get: async ({get}) => {
          const val1 = get(resolvingSel1);

          await Promise.resolve();

          const val2 = get(resolvingSel2);

          await Promise.resolve();

          const val3 = get(anAtom3);

          return val1 + val2 + val3;
        },
      });

      let setAtom;

      function Component() {
        [, setAtom] = useRecoilState(anAtom3);
        const selVal = useRecoilValue(selectorWithAsyncDeps);

        return selVal;
      }

      const container = renderElements(<Component />);

      expect(container.textContent).toEqual('loading');

      await flushPromisesAndTimers();

      // HACK: not sure why but these are needed in OSS
      await flushPromisesAndTimers();
      await flushPromisesAndTimers();
      await flushPromisesAndTimers();
      await flushPromisesAndTimers();

      expect(container.textContent).toEqual('6');

      act(() => setAtom(4));

      expect(container.textContent).toEqual('loading');

      await flushPromisesAndTimers();
      await flushPromisesAndTimers();
      await flushPromisesAndTimers();

      expect(container.textContent).toEqual('7');
    },
  );

  testRecoil(
    'async selector with changing dependencies finishes execution using original state',
    async () => {
      const [asyncDep, resolveAsyncDep] = asyncSelector<string, _>();
      const anAtom = atom({key: 'atomChangingDeps', default: 3});

      // $FlowFixMe[incompatible-call]
      const anAsyncSelector = selector({
        key: 'selectorWithChangingDeps',
        get: ({get}) => {
          const atomValueBefore = get(anAtom);

          get(asyncDep);

          const atomValueAfter = get(anAtom);

          expect(atomValueBefore).toBe(atomValueAfter);

          return atomValueBefore + atomValueAfter;
        },
      });

      let loadableSoFar;
      let setAtom;

      const MyComponent = () => {
        const setAtomLocal = useSetRecoilState(anAtom);
        const asyncSelLoadable = useRecoilValueLoadable(anAsyncSelector);

        setAtom = setAtomLocal;
        loadableSoFar = asyncSelLoadable;

        return asyncSelLoadable.state;
      };

      renderElements(<MyComponent />);

      const loadableBeforeChangingAnything = nullthrows(loadableSoFar);
      expect(loadableBeforeChangingAnything.contents).toBeInstanceOf(Promise);

      act(() => setAtom(10));

      const loadableAfterChangingAtom = nullthrows(loadableSoFar);
      expect(loadableAfterChangingAtom.contents).toBeInstanceOf(Promise);
      expect(loadableBeforeChangingAnything.contents).not.toBe(
        loadableAfterChangingAtom.contents,
      );

      act(() => resolveAsyncDep(''));

      await flushPromisesAndTimers();

      await Promise.all([
        expect(loadableBeforeChangingAnything.toPromise()).resolves.toBe(3 + 3),
        expect(loadableAfterChangingAtom.toPromise()).resolves.toBe(10 + 10),
      ]);
    },
  );

  testRecoil(
    'Selector deps are saved when a component mounts due to a non-recoil change at the same time that a selector is first read',
    () => {
      // Regression test for an issue where selector dependencies were not saved
      // in this circumstance. In this situation dependencies are discovered for
      // a selector when reading from a non-latest graph. This tests that these deps
      // are carried forward instead of being forgotten.
      let show, setShow, setAnotherAtom;
      function Parent() {
        [show, setShow] = useState(false);
        setAnotherAtom = useSetRecoilState(anotherAtom);
        if (show) {
          return <SelectorUser />;
        } else {
          return null;
        }
      }

      const anAtom = atom<number>({key: 'anAtom', default: 0});
      const anotherAtom = atom<number>({key: 'anotherAtom', default: 0});

      // $FlowFixMe[incompatible-call]
      const aSelector = selector({
        key: 'aSelector',
        get: ({get}) => {
          return get(anAtom);
        },
      });

      function SelectorUser() {
        const setter = useSetRecoilState(anAtom);
        useEffect(() => {
          setter(1);
        });
        return useRecoilValue(aSelector);
      }

      const c = renderElements(<Parent />);

      expect(c.textContent).toEqual('');

      act(() => {
        setShow(true);
        setAnotherAtom(1);
      });

      expect(c.textContent).toEqual('1');
    },
  );

  testRecoil('Dynamic deps will refresh', async () => {
    const myAtom = atom({
      key: 'selector dynamic deps atom',
      default: 'DEFAULT',
    });
    const myAtomA = atom({
      key: 'selector dynamic deps atom A',
      default: new Promise(() => {}),
    });
    const myAtomB = atom({
      key: 'selector dynamic deps atom B',
      default: 'B',
    });
    const myAtomC = atom({
      key: 'selector dynamic deps atom C',
      default: new Promise(() => {}),
    });

    let selectorEvaluations = 0;
    // $FlowFixMe[incompatible-call]
    const mySelector = selector({
      key: 'selector dynamic deps selector',
      get: async ({get}) => {
        selectorEvaluations++;
        await Promise.resolve();
        const sw = get(myAtom);
        if (sw === 'A') {
          // $FlowFixMe[unsafe-addition]
          return 'RESOLVED_' + get(myAtomA);
        }
        if (sw === 'B') {
          return 'RESOLVED_' + get(myAtomB);
        }
        if (sw === 'C') {
          // $FlowFixMe[unsafe-addition]
          return 'RESOLVED_' + get(myAtomC);
        }
        await new Promise(() => {});
      },
    });

    // This wrapper selector is important so that the subscribing component
    // doesn't suspend while the selector is pending async results.
    // Otherwise the component may trigger re-evaluations when it wakes up
    // and provide a false-positive.
    // $FlowFixMe[incompatible-call]
    const wrapperSelector = selector({
      key: 'selector dynamic deps wrapper',
      get: ({get}) => {
        const loadable = get(noWait(mySelector));
        return loadable.state === 'loading' ? 'loading' : loadable.contents;
      },
    });

    let setAtom, setAtomA, setAtomB;
    function ComponentSetter() {
      setAtom = useSetRecoilState(myAtom);
      setAtomA = useSetRecoilState(myAtomA);
      setAtomB = useSetRecoilState(myAtomB);
      return null;
    }
    const c = renderElements(
      <>
        <ComponentSetter />
        <ReadsAtom atom={wrapperSelector} />
      </>,
    );
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"loading"');
    expect(selectorEvaluations).toBe(1);

    // Cause re-evaluation to pending state
    act(() => setAtom('TMP'));
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"loading"');
    expect(selectorEvaluations).toBe(2);

    // Add atomA dependency, which is pending
    act(() => setAtom('A'));
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"loading"');
    expect(selectorEvaluations).toBe(3);

    // change to atomB dependency
    act(() => setAtom('B'));
    await flushPromisesAndTimers();
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"RESOLVED_B"');
    expect(selectorEvaluations).toBe(4);

    // Set atomB
    act(() => setAtomB('SETB-0'));
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"RESOLVED_SETB-0"');
    expect(selectorEvaluations).toBe(5);

    // Change back to atomA dependency
    act(() => setAtom('A'));
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"loading"');
    expect(selectorEvaluations).toBe(6);

    // Setting B is currently ignored
    act(() => setAtomB('SETB-IGNORE'));
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"loading"');
    expect(selectorEvaluations).toBe(6);

    // Set atomA
    act(() => setAtomA('SETA'));
    await flushPromisesAndTimers();
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"RESOLVED_SETA"');
    expect(selectorEvaluations).toBe(7);

    // Setting atomB is ignored
    act(() => setAtomB('SETB-LATER'));
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"RESOLVED_SETA"');
    expect(selectorEvaluations).toBe(7);

    // Change to atomC, which is pending
    act(() => setAtom('C'));
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"loading"');
    expect(selectorEvaluations).toBe(8);

    // Setting atomA is ignored
    act(() => setAtomA('SETA-LATER'));
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"loading"');
    expect(selectorEvaluations).toBe(8);

    // change back to atomA for new value
    act(() => setAtom('A'));
    await flushPromisesAndTimers();
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"RESOLVED_SETA-LATER"');
    expect(selectorEvaluations).toBe(9);

    // Change back to atomB
    act(() => setAtom('B'));
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"RESOLVED_SETB-LATER"');
    expect(selectorEvaluations).toBe(10);

    // Set atomB
    act(() => setAtomB('SETB-1'));
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"RESOLVED_SETB-1"');
    expect(selectorEvaluations).toBe(11);
  });
});

describe('Catching Deps', () => {
  testRecoil('selector catching exceptions', () => {
    const throwingSel = errorSelector<
      | RecoilValue<string>
      | Promise<string>
      | Loadable<string>
      | WrappedValue<string>
      | string,
    >('MY ERROR');
    const c1 = renderElements(<ReadsAtom atom={throwingSel} />);
    expect(c1.textContent).toEqual('error');

    // $FlowFixMe[incompatible-call]
    const catchingSelector = selector({
      key: 'useRecoilState/catching selector',
      get: ({get}) => {
        try {
          return get(throwingSel);
        } catch (e) {
          expect(e instanceof Error).toBe(true);
          expect(e.message).toContain('MY ERROR');
          return 'CAUGHT';
        }
      },
    });
    const c2 = renderElements(<ReadsAtom atom={catchingSelector} />);
    expect(c2.textContent).toEqual('"CAUGHT"');
  });

  testRecoil('selector catching exceptions (non Errors)', () => {
    const throwingSel = selector<
      | RecoilValue<string>
      | Promise<string>
      | Loadable<string>
      | WrappedValue<string>
      | string,
    >({
      key: '__error/non Error thrown',
      get: () => {
        // eslint-disable-next-line no-throw-literal
        throw 'MY ERROR';
      },
    });

    const c1 = renderElements(<ReadsAtom atom={throwingSel} />);
    expect(c1.textContent).toEqual('error');

    // $FlowFixMe[incompatible-call]
    const catchingSelector = selector({
      key: 'useRecoilState/catching selector',
      get: ({get}) => {
        try {
          return get(throwingSel);
        } catch (e) {
          expect(e).toBe('MY ERROR');
          return 'CAUGHT';
        }
      },
    });

    const c2 = renderElements(<ReadsAtom atom={catchingSelector} />);
    expect(c2.textContent).toEqual('"CAUGHT"');
  });

  testRecoil('selector catching loads', async () => {
    const resolvingSel = resolvingAsyncSelector('READY');
    // $FlowFixMe[incompatible-call]
    const bypassSelector = selector({
      key: 'useRecoilState/bypassing selector',
      get: ({get}) => {
        try {
          const value = get(resolvingSel);
          expect(value).toBe('READY');
          return value;
        } catch (promise) {
          expect(promise instanceof Promise).toBe(true);
          return 'BYPASS';
        }
      },
    });

    // On first read the dependency is not yet available, but the
    // selector catches and bypasses it.
    const c3 = renderElements(<ReadsAtom atom={bypassSelector} />);
    expect(c3.textContent).toEqual('"BYPASS"');

    // When the dependency does resolve, the selector re-evaluates
    // with the new data.
    act(() => jest.runAllTimers());
    expect(c3.textContent).toEqual('"READY"');
  });

  testRecoil('selector catching all of 2 loads', async () => {
    const [resolvingSel1, res1] = asyncSelector<string, _>();
    const [resolvingSel2, res2] = asyncSelector<string, _>();

    // $FlowFixMe[incompatible-call]
    const bypassSelector = selector({
      key: 'useRecoilState/bypassing selector all',
      get: ({get}) => {
        let ready = 0;
        try {
          const value1 = get(resolvingSel1);
          expect(value1).toBe('READY1');
          ready++;
          const value2 = get(resolvingSel2);
          expect(value2).toBe('READY2');
          ready++;
          return ready;
        } catch (promise) {
          expect(promise instanceof Promise).toBe(true);
          return ready;
        }
      },
    });

    // On first read the dependency is not yet available, but the
    // selector catches and bypasses it.
    const c3 = renderElements(<ReadsAtom atom={bypassSelector} />);
    expect(c3.textContent).toEqual('0');

    // After the first resolution, we're still waiting on the second
    res1('READY1');
    act(() => jest.runAllTimers());
    expect(c3.textContent).toEqual('1');

    // When both are available, we are done!
    res2('READY2');
    act(() => jest.runAllTimers());
    expect(c3.textContent).toEqual('2');
  });

  testRecoil('selector catching any of 2 loads', async () => {
    const resolvingSel1 = resolvingAsyncSelector('READY');
    const resolvingSel2 = resolvingAsyncSelector('READY');
    // $FlowFixMe[incompatible-call]
    const bypassSelector = selector({
      key: 'useRecoilState/bypassing selector any',
      get: ({get}) => {
        let ready = 0;
        for (const resolvingSel of [resolvingSel1, resolvingSel2]) {
          try {
            const value = get(resolvingSel);
            expect(value).toBe('READY');
            ready++;
          } catch (promise) {
            expect(promise instanceof Promise).toBe(true);
            ready = ready;
          }
        }
        return ready;
      },
    });

    // On first read the dependency is not yet available, but the
    // selector catches and bypasses it.
    const c3 = renderElements(<ReadsAtom atom={bypassSelector} />);
    expect(c3.textContent).toEqual('0');

    // Because both dependencies are tried, they should both resolve
    // in parallel after one event loop.
    act(() => jest.runAllTimers());
    expect(c3.textContent).toEqual('2');
  });

  // Test the ability to catch a promise for a pending dependency that we can
  // then handle by returning an async promise.
  testRecoil(
    'selector catching promise and resolving asynchronously',
    async () => {
      const [originalDep, resolveOriginal] = asyncSelector<string, _>();
      const [bypassDep, resolveBypass] = asyncSelector<string, _>();
      // $FlowFixMe[incompatible-call]
      const catchPromiseSelector = selector({
        key: 'useRecoilState/catch then async',
        get: ({get}) => {
          try {
            return get(originalDep);
          } catch (promise) {
            expect(promise instanceof Promise).toBe(true);
            return bypassDep;
          }
        },
      });
      const c = renderElements(<ReadsAtom atom={catchPromiseSelector} />);

      expect(c.textContent).toEqual('loading');
      act(() => jest.runAllTimers());
      expect(c.textContent).toEqual('loading');
      resolveBypass('BYPASS');
      act(() => jest.runAllTimers());
      await flushPromisesAndTimers();
      expect(c.textContent).toEqual('"BYPASS"');
      resolveOriginal('READY');
      act(() => jest.runAllTimers());
      await flushPromisesAndTimers();
      expect(c.textContent).toEqual('"READY"');
    },
  );

  // This tests ability to catch a pending result as a promise and
  // that the promise resolves to the dependency's value and it is handled
  // as an asynchronous selector
  testRecoil('selector catching promise 2', async () => {
    let dependencyPromiseTest;
    const resolvingSel = resolvingAsyncSelector('READY');
    // $FlowFixMe[incompatible-call]
    const catchPromiseSelector = selector({
      key: 'useRecoilState/catch then async 2',
      get: ({get}) => {
        try {
          return get(resolvingSel);
        } catch (promise) {
          expect(promise instanceof Promise).toBe(true);
          // eslint-disable-next-line jest/valid-expect
          dependencyPromiseTest = expect(promise).resolves.toBe('READY');

          return promise.then(pending => {
            const result = pending.value;
            expect(result).toBe('READY');
            return result.value + ' NOW';
          });
        }
      },
    });
    const c = renderElements(<ReadsAtom atom={catchPromiseSelector} />);

    expect(c.textContent).toEqual('loading');

    await flushPromisesAndTimers();

    // NOTE!!!
    // The output here may be "READY NOW" if we optimize the selector to
    // cache the result of the async evaluation when the dependency is available
    // in the cache key with the dependency being available.  Currently it does not
    // So, when the dependency is ready and the component re-renders it will
    // re-evaluate.  At that point the dependency is now READY and thus we only
    // get READY and not READY NOW.
    // expect(c.textContent).toEqual('"READY NOW"');
    expect(c.textContent).toEqual('"READY"');

    // Test that the promise for the dependency that we got actually resolved
    // to the dependency's value.
    await dependencyPromiseTest;
  });
});

describe('Async Selectors', () => {
  testRecoil('Resolving async selector', async () => {
    const resolvingSel = resolvingAsyncSelector('READY');

    // On first read it is blocked on the async selector
    const c1 = renderElements(<ReadsAtom atom={resolvingSel} />);
    expect(c1.textContent).toEqual('loading');

    // When that resolves the data is ready
    act(() => jest.runAllTimers());
    await flushPromisesAndTimers();
    expect(c1.textContent).toEqual('"READY"');
  });

  testRecoil('Blocked on dependency', async () => {
    const resolvingSel = resolvingAsyncSelector('READY');
    // $FlowFixMe[incompatible-call]
    const blockedSelector = selector({
      key: 'useRecoilState/blocked selector',
      get: ({get}) => get(resolvingSel),
    });

    // On first read, the selectors dependency is still loading
    const c2 = renderElements(<ReadsAtom atom={blockedSelector} />);
    expect(c2.textContent).toEqual('loading');

    // When the dependency resolves, the data is ready
    act(() => jest.runAllTimers());
    await flushPromisesAndTimers();
    expect(c2.textContent).toEqual('"READY"');
  });

  testRecoil('Basic async selector test', async () => {
    jest.useFakeTimers();
    const anAtom = counterAtom();
    const [aSelector, _] = plusOneAsyncSelector(anAtom);
    const [Component, updateValue] = componentThatWritesAtom(anAtom);
    const container = renderElements(
      <>
        <Component />
        <ReadsAtom atom={aSelector} />
      </>,
    );
    // Begins in loading state, then shows initial value:
    expect(container.textContent).toEqual('loading');
    act(() => jest.runAllTimers());
    await flushPromisesAndTimers();
    expect(container.textContent).toEqual('1');
    // Changing dependency makes it go back to loading, then to show new value:
    act(() => updateValue(1));
    expect(container.textContent).toEqual('loading');
    act(() => jest.runAllTimers());
    expect(container.textContent).toEqual('2');
    // Returning to a seen value does not cause the loading state:
    act(() => updateValue(0));
    expect(container.textContent).toEqual('1');
  });

  testRecoil('async dependency', async () => {
    const sel2 = selector({
      key: 'MySelector2',
      get: async () => 'READY',
    });

    // $FlowFixMe[incompatible-call]
    const sel1 = selector({
      key: 'MySelector',
      get: async ({get}) => {
        await Promise.resolve();
        return get(sel2);
      },
    });

    const el = renderElements(<ReadsAtom atom={sel1} />);
    expect(el.textContent).toEqual('loading');

    await flushPromisesAndTimers();
    await flushPromisesAndTimers(); // Double flush for open source environment
    expect(el.textContent).toEqual('"READY"');
  });

  testRecoil('Ability to not use Suspense', () => {
    jest.useFakeTimers();
    const anAtom = counterAtom();
    const [aSelector, _] = plusOneAsyncSelector(anAtom);
    const [Component, updateValue] = componentThatWritesAtom(anAtom);

    function ReadsAtomWithoutSuspense({
      state,
    }: $TEMPORARY$object<{state: RecoilValueReadOnly<number>}>) {
      const loadable = useRecoilValueLoadable(state);
      if (loadable.state === 'loading') {
        return 'loading not with suspense';
      } else if (loadable.state === 'hasValue') {
        return loadable.contents;
      } else {
        throw loadable.contents;
      }
    }

    const container = renderElements(
      <>
        <Component />
        <ReadsAtomWithoutSuspense state={aSelector} />
      </>,
    );
    // Begins in loading state, then shows initial value:
    expect(container.textContent).toEqual('loading not with suspense');
    act(() => jest.runAllTimers());
    expect(container.textContent).toEqual('1');
    // Changing dependency makes it go back to loading, then to show new value:
    act(() => updateValue(1));
    expect(container.textContent).toEqual('loading not with suspense');
    act(() => jest.runAllTimers());
    expect(container.textContent).toEqual('2');
    // Returning to a seen value does not cause the loading state:
    act(() => updateValue(0));
    expect(container.textContent).toEqual('1');
  });

  testRecoil(
    'Ability to not use Suspense - with value instead of loadable',
    () => {
      jest.useFakeTimers();
      const anAtom = counterAtom();
      const [aSelector, _] = plusOneAsyncSelector(anAtom);
      const [Component, updateValue] = componentThatWritesAtom(anAtom);

      function ReadsAtomWithoutSuspense({
        state,
      }: $TEMPORARY$object<{state: RecoilValueReadOnly<number>}>) {
        return (
          useRecoilValueLoadable(state).valueMaybe() ??
          'loading not with suspense'
        );
      }

      const container = renderElements(
        <>
          <Component />
          <ReadsAtomWithoutSuspense state={aSelector} />
        </>,
      );
      // Begins in loading state, then shows initial value:
      expect(container.textContent).toEqual('loading not with suspense');
      act(() => jest.runAllTimers());
      expect(container.textContent).toEqual('1');
      // Changing dependency makes it go back to loading, then to show new value:
      act(() => updateValue(1));
      expect(container.textContent).toEqual('loading not with suspense');
      act(() => jest.runAllTimers());
      expect(container.textContent).toEqual('2');
      // Returning to a seen value does not cause the loading state:
      act(() => updateValue(0));
      expect(container.textContent).toEqual('1');
    },
  );

  testRecoil(
    'Selector can alternate between synchronous and asynchronous',
    async () => {
      jest.useFakeTimers();
      const anAtom = counterAtom();
      // $FlowFixMe[incompatible-call]
      const aSelector = selector({
        key: 'alternatingSelector',
        get: ({get}) => {
          const x = get(anAtom);
          if (x === 1337) {
            return new Promise(() => {});
          }
          if (x % 2 === 0) {
            return x;
          } else {
            return new Promise(resolve => {
              // $FlowFixMe[incompatible-call]
              setTimeout(() => resolve(x), 100);
            });
          }
        },
      });
      const [Component, updateValue] = componentThatWritesAtom(anAtom);
      const container = renderElements(
        <>
          <Component />
          <ReadsAtom atom={aSelector} />
        </>,
      );

      // Transition from sync to async:
      expect(container.textContent).toEqual('0');
      act(() => updateValue(1));
      expect(container.textContent).toEqual('loading');
      advanceTimersBy(101);
      expect(container.textContent).toEqual('1');

      // Transition from async to sync (with async being in hasValue state):
      act(() => updateValue(2));
      expect(container.textContent).toEqual('2');

      // Transition from async to sync (with async being in loading state):
      act(() => updateValue(1337));
      expect(container.textContent).toEqual('loading');
      act(() => updateValue(4));
      await flushPromisesAndTimers();
      expect(container.textContent).toEqual('4');

      // Transition from sync to async with still unresolved promise from before:
      act(() => updateValue(5));
      expect(container.textContent).toEqual('loading');
      advanceTimersBy(101);
      await flushPromisesAndTimers();
      expect(container.textContent).toEqual('5');
    },
  );

  testRecoil(
    'Async selectors do not re-query when re-subscribed from having no subscribers',
    async () => {
      const anAtom = counterAtom();
      const [sel, resolvers] = asyncSelectorThatPushesPromisesOntoArray<
        $FlowFixMe | string,
        _,
      >(anAtom);
      const [Component, updateValue] = componentThatWritesAtom(anAtom);
      const [Toggle, toggle] = componentThatToggles(
        <ReadsAtom atom={sel} />,
        null,
      );
      const container = renderElements(
        <>
          <Component />
          <Toggle />
        </>,
      );
      expect(container.textContent).toEqual('loading');
      expect(resolvers.length).toBe(1);
      act(() => updateValue(2));
      await flushPromisesAndTimers();
      expect(resolvers.length).toBe(2);
      resolvers[1][0]('hello');
      await flushPromisesAndTimers();
      await flushPromisesAndTimers(); // Double flush for open source environment
      expect(container.textContent).toEqual('"hello"');

      // Cause sel to have no subscribers:
      act(() => toggle.current());
      expect(container.textContent).toEqual('');

      // Once it's used again, it should not issue another request:
      act(() => toggle.current());
      expect(resolvers.length).toBe(2);
      expect(container.textContent).toEqual('"hello"');
    },
  );

  testRecoil('Can move out of suspense by changing deps', async () => {
    const anAtom = counterAtom();
    const [aSelector, resolvers] = asyncSelectorThatPushesPromisesOntoArray<
      $FlowFixMe | string,
      _,
    >(anAtom);
    const [Component, updateValue] = componentThatWritesAtom(anAtom);
    const container = renderElements(
      <>
        <Component />
        <ReadsAtom atom={aSelector} />
      </>,
    );
    // While still waiting for first request, let a second faster request happen:
    expect(container.textContent).toEqual('loading');
    expect(resolvers.length).toEqual(1);
    act(() => updateValue(1));
    await flushPromisesAndTimers();
    expect(resolvers.length).toEqual(2);
    expect(container.textContent).toEqual('loading');
    // When the faster second request resolves, we should see its result:
    resolvers[1][0]('hello');
    await flushPromisesAndTimers();
    await flushPromisesAndTimers(); // Double flush for open source environment
    expect(container.textContent).toEqual('"hello"');
  });

  testRecoil('Can use an already-resolved promise', async () => {
    jest.useFakeTimers();
    const anAtom = counterAtom();
    const [Component, updateValue] = componentThatWritesAtom(anAtom);
    // $FlowFixMe[incompatible-call]
    const sel = selector({
      key: `selector${nextID++}`,
      get: ({get}) => {
        const x = get(anAtom);
        return Promise.resolve(x + 1);
      },
    });
    const container = renderElements(
      <>
        <Component />
        <ReadsAtom atom={sel} />
      </>,
    );

    await flushPromisesAndTimers();
    await flushPromisesAndTimers(); // Double flush for open source environment
    expect(container.textContent).toEqual('1');

    act(() => updateValue(1));
    await flushPromisesAndTimers();
    await flushPromisesAndTimers(); // Double flush for open source environment
    expect(container.textContent).toEqual('2');
  });

  testRecoil(
    'Wakeup from Suspense to previous value',
    async ({gks, strictMode, concurrentMode}) => {
      const BASE_CALLS = baseRenderCount(gks);
      const sm = strictMode && concurrentMode ? 2 : 1;

      const myAtom = atom({
        key: `atom${nextID++}`,
        default: {value: 0},
      });
      // $FlowFixMe[incompatible-call]
      const mySelector = selector({
        key: `selector${nextID++}`,
        get: ({get}) => get(myAtom).value,
      });

      const [Component, updateValue] = componentThatWritesAtom(myAtom);
      const [ReadComp, commit] =
        componentThatReadsAtomWithCommitCount(mySelector);
      const [container, suspense] = renderElementsWithSuspenseCount(
        <>
          <Component />
          <ReadComp />
        </>,
      );

      // Render initial state "0"
      act(() => jest.runAllTimers());
      await flushPromisesAndTimers();
      expect(container.textContent).toEqual('0');
      expect(suspense).toHaveBeenCalledTimes(0 * sm);
      expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 1);

      // Set selector to a pending state should cause component to suspend
      // $FlowFixMe[incompatible-call]
      act(() => updateValue({value: new Promise(() => {})}));
      act(() => jest.runAllTimers());
      await flushPromisesAndTimers();
      expect(container.textContent).toEqual('loading');
      expect(suspense).toHaveBeenCalledTimes(1 * sm);
      expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 1);

      // Setting selector back to the previous state before it was pending should
      // wake it up and render in previous state
      act(() => updateValue({value: 0}));
      act(() => jest.runAllTimers());
      await flushPromisesAndTimers();
      expect(container.textContent).toEqual('0');
      expect(suspense).toHaveBeenCalledTimes(1 * sm);
      expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 2);

      // Setting selector to a new state "1" should update and re-render
      act(() => updateValue({value: 1}));
      act(() => jest.runAllTimers());
      await flushPromisesAndTimers();
      expect(container.textContent).toEqual('1');
      expect(suspense).toHaveBeenCalledTimes(1 * sm);
      expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 3);

      // Setting selector to the same value "1" should avoid a re-render
      act(() => updateValue({value: 1}));
      act(() => jest.runAllTimers());
      await flushPromisesAndTimers();
      expect(container.textContent).toEqual('1');
      expect(suspense).toHaveBeenCalledTimes(1 * sm);
      expect(commit).toHaveBeenCalledTimes(
        BASE_CALLS +
          3 +
          ((reactMode().mode === 'LEGACY' ||
            reactMode().mode === 'MUTABLE_SOURCE') &&
          !gks.includes('recoil_suppress_rerender_in_callback')
            ? 1
            : 0),
      );
    },
  );

  describe('Async selector resolution notifies all stores that read pending', () => {
    // Regression tests for #534: selectors used to only notify whichever store
    // originally caused a promise to be returned, not any stores that also read
    // the selector in that pending state.
    testRecoil('Selectors read in a snapshot notify all stores', async () => {
      // This version of the test uses the store inside of a Snapshot as its second store.
      const switchAtom = atom({
        key: 'notifiesAllStores/snapshots/switch',
        default: false,
      });
      const selectorA = selector({
        key: 'notifiesAllStores/snapshots/a',
        get: () => 'foo',
      });
      let resolve: string => void = () => {
        throw new Error('error in test');
      };
      const selectorB = selector({
        key: 'notifiesAllStores/snapshots/b',
        get: async () =>
          new Promise(r => {
            // $FlowFixMe[incompatible-type]
            resolve = r;
          }),
      });

      let doIt;

      function TestComponent() {
        const shouldQuery = useRecoilValue(switchAtom);
        const query = useRecoilValueLoadable(
          shouldQuery ? selectorB : selectorA,
        );

        doIt = useRecoilCallback(({snapshot, set}) => () => {
          /**
           * this is required as we need the selector accessed below to outlive
           * the end of this callback so that the async resolution notifies the
           * store of the resolution and a re-render is triggered. Otherwise, the
           * selector will be cleaned up at the end of the callback, meaning the
           * resolution of the selector will not result in a re-render.
           */
          snapshot.retain();
          snapshot.getLoadable(selectorB); // cause query to be triggered in context of snapshot store
          set(switchAtom, true); // cause us to then read from the pending selector
        });

        // $FlowFixMe[incompatible-type]
        return query.state === 'hasValue' ? query.contents : 'loading';
      }

      // $FlowFixMe[incompatible-type-arg]
      const c = renderElements(<TestComponent />);
      expect(c.textContent).toEqual('foo');

      act(doIt);
      expect(c.textContent).toEqual('loading');

      act(() => resolve('bar'));
      await act(flushPromisesAndTimers);
      await act(flushPromisesAndTimers); // Double flush for open source environment
      expect(c.textContent).toEqual('bar');
    });

    testRecoil('Selectors read in another root notify all roots', async () => {
      // This version of the test uses another RecoilRoot as its second store
      const switchAtom = atom({
        key: 'notifiesAllStores/twoRoots/switch',
        default: false,
      });

      const selectorA = selector({
        key: 'notifiesAllStores/twoRoots/a',
        get: () => 'SELECTOR A',
      });

      let resolve: string => void = () => {
        throw new Error('error in test');
      };
      const selectorB = selector({
        key: 'notifiesAllStores/twoRoots/b',
        get: async () =>
          new Promise(r => {
            // $FlowFixMe[incompatible-type]
            resolve = r;
          }),
      });

      function TestComponent({
        setSwitch,
      }: {
        setSwitch: ((boolean) => void) => void,
      }) {
        const [shouldQuery, setShouldQuery] = useRecoilState(switchAtom);
        const query = useRecoilValueLoadable(
          shouldQuery ? selectorB : selectorA,
        );
        setSwitch(setShouldQuery);
        // $FlowFixMe[incompatible-type]
        return query.state === 'hasValue' ? query.contents : 'loading';
      }

      let setRootASelector;
      const rootA = renderElements(
        // $FlowFixMe[incompatible-type-arg]
        <TestComponent
          setSwitch={setSelector => {
            setRootASelector = setSelector;
          }}
        />,
      );
      let setRootBSelector;
      const rootB = renderElements(
        // $FlowFixMe[incompatible-type-arg]
        <TestComponent
          setSwitch={setSelector => {
            setRootBSelector = setSelector;
          }}
        />,
      );

      expect(rootA.textContent).toEqual('SELECTOR A');
      expect(rootB.textContent).toEqual('SELECTOR A');

      act(() => setRootASelector(true)); // cause rootA to read the selector
      expect(rootA.textContent).toEqual('loading');
      expect(rootB.textContent).toEqual('SELECTOR A');

      act(() => setRootBSelector(true)); // cause rootB to read the selector
      expect(rootA.textContent).toEqual('loading');
      expect(rootB.textContent).toEqual('loading');

      act(() => resolve('SELECTOR B'));

      await flushPromisesAndTimers();

      expect(rootA.textContent).toEqual('SELECTOR B');
      expect(rootB.textContent).toEqual('SELECTOR B');
    });
  });

  describe('Async Selector Set', () => {
    testRecoil('set tries to get async value', () => {
      const myAtom = atom<void>({key: 'selector set get async atom'});
      const mySelector = selector({
        key: 'selector set get async selector',
        get: () => myAtom,
        set: ({get}) => {
          get(myAtom);
        },
      });

      const [Comp, setState] = componentThatReadsAndWritesAtom(mySelector);
      renderElements(<Comp />);
      expect(() => setState()).toThrow('selector set get async');
    });
  });
});

// Test the following scenario:
// 0. Recoil state version 1 with A=FOO and B=BAR
// 1. Component renders with A for a value of FOO
// 2. Component renders with B for a value of BAR
// 3. Recoil state updated to version 2 with A=FOO and B=FOO
//
// Step 2 may be problematic if we attempt to suppress re-renders and don't
// properly keep track of previous component values when the mutable source changes.
testRecoil('Updating with changed selector', ({gks}) => {
  if (!gks.includes('recoil_suppress_rerender_in_callback')) {
    return;
  }

  const atomA = atom({
    key: 'selector change rerender / atomA',
    default: {value: 'FOO'},
  });
  const atomB = atom({
    key: 'selector change rerender / atomB',
    default: {value: 'BAR'},
  });
  // $FlowFixMe[incompatible-call]
  const selectorA = selector({
    key: 'selector change rerender / selectorA',
    get: ({get}) => get(atomA).value,
  });
  // $FlowFixMe[incompatible-call]
  const selectorB = selector({
    key: 'selector change rerender / selectorB',
    get: ({get}) => get(atomB).value,
  });

  let setSide;
  let setB;
  function SelectorComponent() {
    const [side, setSideState] = useState('A');
    setSide = setSideState;

    // $FlowFixMe[missing-local-annot]
    setB = useRecoilCallback(({snapshot, gotoSnapshot}) => value => {
      gotoSnapshot(
        snapshot.map(({set}) => {
          set(atomB, {value});
        }),
      );
    });

    return useRecoilValue(side === 'A' ? selectorA : selectorB);
  }
  const c = renderElements(<SelectorComponent />);

  expect(c.textContent).toEqual('FOO');

  // When we change the selector we are looking up it will render other atom's value
  act(() => setSide('B'));
  expect(c.textContent).toEqual('BAR');

  // When we change Recoil state the component should re-render with new value.
  // True even if we keep track of previous renders values to suppress re-renders when they don't change.
  // If we don't keep track properly when the atom changes, this may break.
  act(() => setB('FOO'));
  expect(c.textContent).toEqual('FOO');

  // When we swap back to atomA it now has the same value as atomB.
  act(() => setSide('A'));
  expect(c.textContent).toEqual('FOO');
});

testRecoil('Change component prop to suspend and wake', () => {
  const awakeSelector = constSelector('WAKE');
  const suspendedSelector = loadingAsyncSelector();

  function TestComponent({
    side,
  }: $TEMPORARY$object<{
    side: $TEMPORARY$string<'AWAKE'> | $TEMPORARY$string<'SLEEP'>,
  }>) {
    return (
      useRecoilValue(side === 'AWAKE' ? awakeSelector : suspendedSelector) ??
      'LOADING'
    );
  }

  let setSide;
  const SelectorComponent = function () {
    const [side, setSideState] = useState('AWAKE');
    setSide = setSideState;
    return <TestComponent side={side} />;
  };
  const c = renderElements(<SelectorComponent />);

  expect(c.textContent).toEqual('WAKE');

  act(() => setSide('SLEEP'));
  expect(c.textContent).toEqual('loading');

  act(() => setSide('AWAKE'));
  expect(c.textContent).toEqual('WAKE');
});

testRecoil(
  "Releasing snapshot doesn't invalidate pending selector",
  async () => {
    const [mySelector, resolveSelector] = asyncSelector<string, _>();

    // Initialize selector with snapshot first so it is initialized for both
    // snapshot and root and has separate cleanup handlers for both.
    function Component() {
      const callback = useRecoilCallback(({snapshot}) => () => {
        snapshot.getLoadable(mySelector);
      });
      callback(); // First initialize with snapshot
      return useRecoilValue(mySelector); // Second initialize with RecoilRoot
    }

    const c = renderElements(<Component />);

    // Wait to allow the snapshot in the callback to release and call the
    // selector node cleanup functions.
    await flushPromisesAndTimers();

    expect(c.textContent).toBe('loading');

    act(() => resolveSelector('RESOLVE'));
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('RESOLVE');
  },
);

describe('Multiple stores', () => {
  testRecoil('sync in multiple', () => {
    const myAtom = atom({key: 'selector stores sync atom', default: 'DEFAULT'});
    // $FlowFixMe[incompatible-call]
    const mySelector = selector({
      key: 'selector stores sync selector',
      get: () => myAtom,
      // $FlowFixMe[incompatible-call]
      set: ({set}, newValue) => set(myAtom, newValue),
    });

    const [ComponentA, setAtomA] = componentThatReadsAndWritesAtom(mySelector);
    const [ComponentB, setAtomB] = componentThatReadsAndWritesAtom(mySelector);
    const c = renderElements(
      <>
        <RecoilRoot>
          <ComponentA />
        </RecoilRoot>
        <RecoilRoot>
          <ComponentB />
        </RecoilRoot>
      </>,
    );

    expect(c.textContent).toBe('"DEFAULT""DEFAULT"');

    act(() => setAtomA('A'));
    expect(c.textContent).toBe('"A""DEFAULT"');

    act(() => setAtomB('B'));
    expect(c.textContent).toBe('"A""B"');
  });

  testRecoil('async in multiple', async () => {
    const resolvers = {};
    const promises = {
      DEFAULT: new Promise(resolve => {
        // $FlowFixMe[prop-missing]
        resolvers.DEFAULT = resolve;
      }),
      STALE: new Promise(resolve => {
        // $FlowFixMe[prop-missing]
        resolvers.STALE = resolve;
      }),
      UPDATE: new Promise(resolve => {
        // $FlowFixMe[prop-missing]
        resolvers.UPDATE = resolve;
      }),
    };
    const myAtom = atom({
      key: 'selector stores async atom',
      default: 'DEFAULT',
    });
    const mySelector = selector({
      key: 'selector stores async selector',
      get: async ({get}) => {
        const side = get(myAtom);
        const str = await promises[side];
        // $FlowFixMe[unsafe-addition]
        return side + ':' + str;
      },
      // $FlowFixMe[incompatible-call]
      set: ({set}, newValue) => set(myAtom, newValue),
    });

    const [ComponentA, setAtomA] = componentThatReadsAndWritesAtom(mySelector);
    const [ComponentB, setAtomB] = componentThatReadsAndWritesAtom(mySelector);
    const c = renderElements(
      <>
        <RecoilRoot>
          <React.Suspense fallback={<div>LOADING_A</div>}>
            <ComponentA />
          </React.Suspense>
        </RecoilRoot>
        <RecoilRoot>
          <React.Suspense fallback={<div>LOADING_B</div>}>
            <ComponentB />
          </React.Suspense>
        </RecoilRoot>
      </>,
    );

    expect(c.textContent).toBe('LOADING_ALOADING_B');

    // $FlowFixMe[incompatible-call]
    act(() => setAtomA('STALE'));
    expect(c.textContent).toBe('LOADING_ALOADING_B');

    // $FlowFixMe[incompatible-call]
    act(() => setAtomA('UPDATE'));
    expect(c.textContent).toBe('LOADING_ALOADING_B');

    // $FlowFixMe[prop-missing]
    act(() => resolvers.STALE('STALE'));
    await flushPromisesAndTimers();
    await flushPromisesAndTimers(); // Double flush for open source environment
    expect(c.textContent).toBe('LOADING_ALOADING_B');

    // $FlowFixMe[prop-missing]
    act(() => resolvers.UPDATE('RESOLVE_A'));
    await flushPromisesAndTimers();
    await flushPromisesAndTimers(); // Double flush for open source environment
    expect(c.textContent).toBe('"UPDATE:RESOLVE_A"LOADING_B');

    // $FlowFixMe[prop-missing]
    act(() => resolvers.DEFAULT('RESOLVE_B'));
    await flushPromisesAndTimers();
    await flushPromisesAndTimers(); // Double flush for open source environment
    expect(c.textContent).toBe('"UPDATE:RESOLVE_A""DEFAULT:RESOLVE_B"');

    // $FlowFixMe[incompatible-call]
    act(() => setAtomB('UPDATE'));
    expect(c.textContent).toBe('"UPDATE:RESOLVE_A""UPDATE:RESOLVE_A"');
  });

  testRecoil('derived in multiple', async () => {
    let resolveA;
    const atomA = atom({
      key: 'selector stores derived atom A',
      default: new Promise(resolve => {
        resolveA = resolve;
      }),
    });
    let resolveB;
    const atomB = atom({
      key: 'selector stores derived atom B',
      default: new Promise(resolve => {
        resolveB = resolve;
      }),
    });
    let resolveStale;
    const atomStale = atom({
      key: 'selector stores derived atom Stale',
      default: new Promise(resolve => {
        resolveStale = resolve;
      }),
    });
    const switchAtom = atom({
      key: 'selector stores derived atom Switch',
      default: 'A',
    });

    const mySelector = selector({
      key: 'selector stores derived selector',
      get: async ({get}) => {
        const side = get(switchAtom);
        return (
          // $FlowFixMe[unsafe-addition]
          side +
          ':' +
          (side === 'STALE'
            ? get(atomStale)
            : side === 'A'
            ? get(atomA)
            : get(atomB))
        );
      },
      // $FlowFixMe[incompatible-call]
      set: ({set}, newValue) => set(switchAtom, newValue),
    });

    const [ComponentA, setAtomA] = componentThatReadsAndWritesAtom(mySelector);
    const [ComponentB, setAtomB] = componentThatReadsAndWritesAtom(mySelector);
    const c = renderElements(
      <>
        <RecoilRoot>
          <React.Suspense fallback={<div>LOADING_A</div>}>
            <ComponentA />
          </React.Suspense>
        </RecoilRoot>
        <RecoilRoot>
          <React.Suspense fallback={<div>LOADING_B</div>}>
            <ComponentB />
          </React.Suspense>
        </RecoilRoot>
      </>,
    );

    expect(c.textContent).toBe('LOADING_ALOADING_B');

    // $FlowFixMe[incompatible-call]
    act(() => setAtomB('STALE'));
    expect(c.textContent).toBe('LOADING_ALOADING_B');

    // $FlowFixMe[incompatible-call]
    act(() => setAtomB('B'));
    expect(c.textContent).toBe('LOADING_ALOADING_B');

    act(() => resolveStale('STALE'));
    await flushPromisesAndTimers();
    await flushPromisesAndTimers(); // Double flush for open source environment
    expect(c.textContent).toBe('LOADING_ALOADING_B');

    act(() => resolveB('RESOLVE_B'));
    await flushPromisesAndTimers();
    await flushPromisesAndTimers(); // Double flush for open source environment
    expect(c.textContent).toBe('LOADING_A"B:RESOLVE_B"');

    act(() => resolveA('RESOLVE_A'));
    await flushPromisesAndTimers();
    await flushPromisesAndTimers(); // Double flush for open source environment
    expect(c.textContent).toBe('"A:RESOLVE_A""B:RESOLVE_B"');

    // $FlowFixMe[incompatible-call]
    act(() => setAtomA('B'));
    expect(c.textContent).toBe('"B:RESOLVE_B""B:RESOLVE_B"');
  });

  testRecoil('dynamic dependencies in multiple', async () => {
    const myAtom = stringAtom();

    const resolvers = {};
    const promises = {
      // $FlowFixMe[prop-missing]
      DEFAULT: new Promise(resolve => (resolvers.DEFAULT = resolve)),
      // $FlowFixMe[prop-missing]
      SET: new Promise(resolve => (resolvers.SET = resolve)),
      // $FlowFixMe[prop-missing]
      OTHER: new Promise(resolve => (resolvers.OTHER = resolve)),
    };
    const mySelector = selector({
      key: 'selector stores dynamic deps',
      get: async ({get}) => {
        await Promise.resolve();
        const x = get(myAtom);
        const y = await promises[x];
        return x + ':' + y;
      },
    });

    // This wrapper selector is important so that the subscribing component
    // doesn't suspend while the selector is pending async results.
    // Otherwise the component may trigger re-evaluations when it wakes up
    // and provide a false-positive.
    // $FlowFixMe[incompatible-call]
    const wrapperSelector = selector({
      key: 'selector stores dynamic deps wrapper',
      get: ({get}) => {
        const loadable = get(noWait(mySelector));
        return loadable.state === 'loading' ? 'loading' : loadable.contents;
      },
    });

    const [AtomA, setAtomA] = componentThatReadsAndWritesAtom(myAtom);
    let setAtomB;
    function SetAtomB() {
      setAtomB = useSetRecoilState(myAtom);
      return null;
    }
    const c = renderElements(
      <>
        <RecoilRoot>
          <AtomA />
          <ReadsAtom atom={wrapperSelector} />
        </RecoilRoot>
        <RecoilRoot>
          <SetAtomB />
          <ReadsAtom atom={wrapperSelector} />
        </RecoilRoot>
      </>,
    );

    // Initial render has both stores with same pending execution
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"DEFAULT""loading""loading"');

    // Change store A to a different execution
    act(() => setAtomA('SET'));
    expect(c.textContent).toBe('"SET""loading""loading"');

    // Update stoore B to test if dynamic dependency worked
    act(() => setAtomB('OTHER'));
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"SET""loading""loading"');

    // Resolving original promise does nothing
    // $FlowFixMe[prop-missing]
    act(() => resolvers.DEFAULT('IGNORE'));
    expect(c.textContent).toBe('"SET""loading""loading"');

    // Resolving store B
    // $FlowFixMe[prop-missing]
    act(() => resolvers.OTHER('OTHER'));
    await flushPromisesAndTimers();
    await flushPromisesAndTimers(); // Double flush for open source environment
    expect(c.textContent).toBe('"SET""loading""OTHER:OTHER"');

    // Resolving store A
    // $FlowFixMe[prop-missing]
    act(() => resolvers.SET('RESOLVE'));
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"SET""SET:RESOLVE""OTHER:OTHER"');
  });

  // Test when multiple roots have a shared async selector with nested
  // dependency on an atom initialized to a promise.  This stresses the
  // logic for getting the current pending execution across other roots.
  // (i.e. getExecutionInfoOfInProgressExecution() )
  testRecoil('Nested atoms', async () => {
    const myAtom = atom({
      key: 'selector stores nested atom',
      default: 'DEFAULT',
      effects: [
        ({setSelf}) => {
          setSelf(new Promise(() => {}));
        },
      ],
    });

    const innerSelector = selector({
      key: 'selector stores nested atom inner',
      get: () => myAtom,
    });

    const outerSelector = selector({
      key: 'selector stores nested atom outer',
      get: () => innerSelector,
    });

    let setAtomA;
    function SetAtomA() {
      setAtomA = useSetRecoilState(myAtom);
      return null;
    }
    let setAtomB;
    function SetAtomB() {
      setAtomB = useSetRecoilState(myAtom);
      return null;
    }

    const c = renderUnwrappedElements(
      <>
        <RecoilRoot>
          <React.Suspense fallback="LOAD_A ">
            <ReadsAtom atom={outerSelector} />
            <SetAtomA />
          </React.Suspense>
        </RecoilRoot>
        <RecoilRoot>
          <React.Suspense fallback="LOAD_B ">
            <ReadsAtom atom={outerSelector} />
            <SetAtomB />
          </React.Suspense>
        </RecoilRoot>
      </>,
    );
    expect(c.textContent).toBe('LOAD_A LOAD_B ');

    act(() => {
      setAtomA('SETA');
      setAtomB('SETB');
    });
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('"SETA""SETB"');
  });

  // Test that when a store is re-using another store's execution of a selector
  // that async dependencies are updated so it can stop re-using it if state
  // diverges from the original store.
  testRecoil('Diverging shared selectors', async () => {
    const myAtom = stringAtom();
    atom({
      key: 'selector stores diverging atom',
      default: 'DEFAULT',
    });

    // $FlowFixMe[incompatible-call]
    const mySelector = selector({
      key: 'selector stores diverging selector',
      get: async ({get}) => {
        await Promise.resolve();
        const value = get(myAtom);

        await Promise.resolve(); // So resolution occurs during act()
        if (value === 'RESOLVE') {
          return value;
        }

        await new Promise(() => {});
      },
    });

    let setAtomA;
    function SetAtomA() {
      setAtomA = useSetRecoilState(myAtom);
      return null;
    }
    let setAtomB;
    function SetAtomB() {
      setAtomB = useSetRecoilState(myAtom);
      return null;
    }

    const c = renderUnwrappedElements(
      <>
        <RecoilRoot>
          <React.Suspense fallback="LOAD_A ">
            <ReadsAtom atom={mySelector} />
            <SetAtomA />
          </React.Suspense>
        </RecoilRoot>
        <RecoilRoot>
          <React.Suspense fallback="LOAD_B ">
            <ReadsAtom atom={mySelector} />
            <SetAtomB />
          </React.Suspense>
        </RecoilRoot>
      </>,
    );
    expect(c.textContent).toBe('LOAD_A LOAD_B ');

    act(() => {
      setAtomA('SETA');
    });
    await flushPromisesAndTimers();
    await flushPromisesAndTimers(); // Double flush for open source environment
    expect(c.textContent).toBe('LOAD_A LOAD_B ');

    act(() => {
      setAtomB('RESOLVE');
    });
    await flushPromisesAndTimers();
    await flushPromisesAndTimers(); // Double flush for open source environment
    expect(c.textContent).toBe('LOAD_A "RESOLVE"');
  });

  testRecoil('Diverged shared selectors', async () => {
    const myAtom = stringAtom();
    atom({
      key: 'selector stores diverged atom',
      default: 'DEFAULT',
    });

    let addDeps;
    const addDepsPromise = new Promise(resolve => {
      addDeps = resolve;
    });
    // $FlowFixMe[incompatible-call]
    const mySelector = selector({
      key: 'selector stores diverged selector',
      get: async ({get}) => {
        await addDepsPromise;
        const value = get(myAtom);

        await Promise.resolve(); // So resolution occurs during act()
        if (value === 'RESOLVE') {
          return value;
        }
        await new Promise(() => {});
      },
    });

    let setAtomA;
    function SetAtomA() {
      setAtomA = useSetRecoilState(myAtom);
      return null;
    }
    let setAtomB;
    function SetAtomB() {
      setAtomB = useSetRecoilState(myAtom);
      return null;
    }

    const c = renderUnwrappedElements(
      <>
        <RecoilRoot>
          <React.Suspense fallback="LOAD_A ">
            <ReadsAtom atom={mySelector} />
            <SetAtomA />
          </React.Suspense>
        </RecoilRoot>
        <RecoilRoot>
          <React.Suspense fallback="LOAD_B ">
            <ReadsAtom atom={mySelector} />
            <SetAtomB />
          </React.Suspense>
        </RecoilRoot>
      </>,
    );
    expect(c.textContent).toBe('LOAD_A LOAD_B ');

    act(() => {
      setAtomA('SETA');
      setAtomB('RESOLVE');
    });
    await flushPromisesAndTimers();
    await flushPromisesAndTimers(); // Double flush for open source environment
    expect(c.textContent).toBe('LOAD_A LOAD_B ');

    await act(async () => {
      addDeps();
    });
    await flushPromisesAndTimers();
    await flushPromisesAndTimers(); // Double flush for open source environment
    expect(c.textContent).toBe('LOAD_A "RESOLVE"');
  });
});

describe('Counts', () => {
  describe('Evaluation', () => {
    testRecoil('Selector functions are evaluated just once', () => {
      const anAtom = counterAtom();
      const [aSelector, selectorFn] = plusOneSelector(anAtom);
      const [Component, updateValue] = componentThatWritesAtom(anAtom);
      renderElements(
        <>
          <Component />
          <ReadsAtom atom={aSelector} />
        </>,
      );
      expect(selectorFn).toHaveBeenCalledTimes(1);
      act(() => updateValue(1));
      expect(selectorFn).toHaveBeenCalledTimes(2);
    });

    testRecoil(
      'Selector functions are evaluated just once even if multiple upstreams change',
      () => {
        const atomA = counterAtom();
        const atomB = counterAtom();
        const [aSelector, selectorFn] = additionSelector(atomA, atomB);
        const [ComponentA, updateValueA] = componentThatWritesAtom(atomA);
        const [ComponentB, updateValueB] = componentThatWritesAtom(atomB);
        renderElements(
          <>
            <ComponentA />
            <ComponentB />
            <ReadsAtom atom={aSelector} />
          </>,
        );
        expect(selectorFn).toHaveBeenCalledTimes(1);
        act(() => {
          batchUpdates(() => {
            updateValueA(1);
            updateValueB(1);
          });
        });
        expect(selectorFn).toHaveBeenCalledTimes(2);
      },
    );

    /**
     * This test ensures that we are not running the selector's get() an unnecessary
     * number of times in response to async selectors resolving (i.e. by retrying
     * more times than we have to or creating numerous promises that retry).
     */
    testRecoil(
      'async selector runs the minimum number of times required',
      async () => {
        const [asyncDep1, resolveAsyncDep1] = asyncSelector<string, _>();
        const [asyncDep2, resolveAsyncDep2] = asyncSelector<string, _>();

        let numTimesRan = 0;

        // $FlowFixMe[incompatible-call]
        const selectorWithAsyncDeps = selector({
          key: 'selectorRunsMinTimes',
          get: async ({get}) => {
            numTimesRan++;
            return get(asyncDep1) + get(asyncDep2);
          },
        });

        const container = renderElements(
          <ReadsAtom atom={selectorWithAsyncDeps} />,
        );

        expect(numTimesRan).toBe(1);

        act(() => resolveAsyncDep1('a'));
        await flushPromisesAndTimers();
        expect(numTimesRan).toBe(2);

        act(() => resolveAsyncDep2('b'));
        await flushPromisesAndTimers();
        expect(numTimesRan).toBe(3);

        await flushPromisesAndTimers();
        expect(container.textContent).toEqual('"ab"');
      },
    );
  });

  describe('Render', () => {
    testRecoil("Updating with same value doesn't rerender", ({gks}) => {
      if (!gks.includes('recoil_suppress_rerender_in_callback')) {
        return;
      }

      const myAtom = atom({
        key: 'selector same value rerender / atom',
        default: {value: 'DEFAULT'},
      });
      // $FlowFixMe[incompatible-call]
      const mySelector = selector({
        key: 'selector - same value rerender',
        get: ({get}) => get(myAtom).value,
      });

      let setAtom;
      let resetAtom;
      let renders = 0;
      function SelectorComponent() {
        const value = useRecoilValue(mySelector);
        const setAtomValue = useSetRecoilState(myAtom);
        const resetAtomValue = useResetRecoilState(myAtom);
        setAtom = (x: $TEMPORARY$string<'CHANGE'> | $TEMPORARY$string<'SET'>) =>
          setAtomValue({value: x});
        resetAtom = resetAtomValue;
        return value;
      }
      expect(renders).toEqual(0);
      const c = renderElements(
        <Profiler
          id="test"
          onRender={() => {
            renders++;
          }}>
          <SelectorComponent />
        </Profiler>,
      );

      // Initial render happens one time in www and 2 times in oss.
      // resetting the counter to 1 after the initial render to make them
      // the same in both repos. 2 renders probably need to be looked into.
      renders = 1;

      expect(c.textContent).toEqual('DEFAULT');

      act(() => setAtom('SET'));
      expect(c.textContent).toEqual('SET');
      expect(renders).toEqual(2);

      act(() => setAtom('SET'));
      expect(c.textContent).toEqual('SET');
      expect(renders).toEqual(2);

      act(() => setAtom('CHANGE'));
      expect(c.textContent).toEqual('CHANGE');
      expect(renders).toEqual(3);

      act(resetAtom);
      expect(c.textContent).toEqual('DEFAULT');
      expect(renders).toEqual(4);

      act(resetAtom);
      expect(c.textContent).toEqual('DEFAULT');
      expect(renders).toEqual(4);
    });

    testRecoil(
      'Resolution of suspense causes render just once',
      async ({gks, strictMode, concurrentMode}) => {
        const BASE_CALLS = baseRenderCount(gks);
        const sm = strictMode && concurrentMode ? 2 : 1;

        jest.useFakeTimers();
        const anAtom = counterAtom();
        const [aSelector, _] = plusOneAsyncSelector(anAtom);
        const [Component, updateValue] = componentThatWritesAtom(anAtom);
        const [ReadComp, commit] =
          componentThatReadsAtomWithCommitCount(aSelector);
        const [__, suspense] = renderElementsWithSuspenseCount(
          <>
            <Component />
            <ReadComp />
          </>,
        );

        // Begins in loading state, then shows initial value:
        act(() => jest.runAllTimers());
        await flushPromisesAndTimers();
        expect(suspense).toHaveBeenCalledTimes(1 * sm);
        expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 1);
        // Changing dependency makes it go back to loading, then to show new value:
        act(() => updateValue(1));
        act(() => jest.runAllTimers());
        await flushPromisesAndTimers();
        expect(suspense).toHaveBeenCalledTimes(2 * sm);
        expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 2);
        // Returning to a seen value does not cause the loading state:
        act(() => updateValue(0));
        await flushPromisesAndTimers();
        expect(suspense).toHaveBeenCalledTimes(2 * sm);
        expect(commit).toHaveBeenCalledTimes(BASE_CALLS + 3);
      },
    );
  });
});
