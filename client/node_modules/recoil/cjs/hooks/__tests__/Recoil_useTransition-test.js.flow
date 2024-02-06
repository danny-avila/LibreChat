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
  useTransition,
  act,
  useRecoilValue,
  useRecoilState,
  useRecoilValue_TRANSITION_SUPPORT_UNSTABLE,
  useRecoilState_TRANSITION_SUPPORT_UNSTABLE,
  atom,
  selectorFamily,
  renderElements,
  reactMode,
  flushPromisesAndTimers;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({useState, useTransition} = React);
  ({act} = require('ReactTestUtils'));
  ({
    useRecoilValue,
    useRecoilState,
    useRecoilValue_TRANSITION_SUPPORT_UNSTABLE,
    useRecoilState_TRANSITION_SUPPORT_UNSTABLE,
    atom,
    selectorFamily,
  } = require('../../Recoil_index'));
  ({
    renderElements,
    flushPromisesAndTimers,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
  ({reactMode} = require('../../core/Recoil_ReactMode'));
});

let nextID = 0;

testRecoil('Works with useTransition', async ({concurrentMode}) => {
  if (!reactMode().concurrent || !concurrentMode) {
    return;
  }

  const indexAtom = atom({
    key: `index${nextID++}`,
    default: 0,
  });

  // Basic implementation of a cache that suspends:
  const cache = new Map<
    number,
    | {promise: null, state: string, value: string}
    | {promise: Promise<void>, state: string, value: null},
  >();
  const resolvers = [];
  function getItem(index: number) {
    if (cache.has(index) && cache.get(index)?.state === 'ready') {
      return cache.get(index)?.value;
    } else if (cache.has(index)) {
      throw cache.get(index)?.promise;
    } else {
      const promise = new Promise(resolve => {
        const onComplete = () => {
          cache.set(index, {
            state: 'ready',
            value: `v${index}`,
            promise: null,
          });
          resolve();
        };
        resolvers.push(onComplete);
      });
      const newEntry = {
        state: 'loading',
        value: null,
        promise,
      };
      // $FlowFixMe[incompatible-call]
      cache.set(index, newEntry);
      throw promise;
    }
  }

  function ItemContents({index}: $TEMPORARY$object<{index: number}>) {
    const item = getItem(index);
    return (
      <div>
        Item {index} = {item}
      </div>
    );
  }

  function Item({index}: $TEMPORARY$object<{index: number}>) {
    return (
      <React.Suspense fallback="Suspended">
        <ItemContents index={index} />
      </React.Suspense>
    );
  }

  let incrementIndex;
  function Main() {
    const [index, setIndex] = useRecoilState(indexAtom);
    const [isPending, startTransition] = useTransition();
    incrementIndex = () => {
      startTransition(() => {
        setIndex(x => x + 1);
      });
    };
    return (
      <div>
        Index: {index} - {isPending && 'In transition - '}
        <Item index={index} />
      </div>
    );
  }

  const c = renderElements(<Main />);

  // Initial load:
  expect(c.textContent).toEqual('Index: 0 - Suspended');
  act(() => resolvers[0]());
  await flushPromisesAndTimers();
  expect(c.textContent).toEqual('Index: 0 - Item 0 = v0');

  // Increment index a single time; see previous item in transition, then once
  // the new item resolves, see the new item:
  act(() => incrementIndex());
  expect(c.textContent).toEqual('Index: 0 - In transition - Item 0 = v0');
  act(() => resolvers[1]());
  await flushPromisesAndTimers();
  expect(c.textContent).toEqual('Index: 1 - Item 1 = v1');

  // Increment index a second time during transition; see previous item in
  // transition, then once the new _second_ item resolves, see that new item:
  act(() => incrementIndex());
  expect(c.textContent).toEqual('Index: 1 - In transition - Item 1 = v1');
  act(() => incrementIndex());
  expect(c.textContent).toEqual('Index: 1 - In transition - Item 1 = v1');
  act(() => resolvers[2]());
  await flushPromisesAndTimers();
  expect(c.textContent).toEqual('Index: 1 - In transition - Item 1 = v1');
  act(() => resolvers[3]());
  await flushPromisesAndTimers();
  expect(c.textContent).toEqual('Index: 3 - Item 3 = v3');
});

testRecoil('useRecoilValue()', async ({concurrentMode}) => {
  if (useTransition == null) {
    return;
  }
  const myAtom = atom({key: 'useRecoilValue atom', default: 0});
  let resolvers: Array<(result: Promise<string> | string) => void> = [];
  function resolveSelectors() {
    resolvers.forEach(resolve => resolve('RESOLVED'));
    resolvers = [];
  }
  const query = selectorFamily({
    key: 'useRecoilValue selector',
    get:
      (
        // $FlowFixMe[missing-local-annot]
        param,
      ) =>
      // $FlowFixMe[missing-local-annot]
      ({get}) => {
        const value = get(myAtom);
        return new Promise(resolve => {
          resolvers.push(resolve);
          // $FlowFixMe[incompatible-type]
        }).then(str => `${param} ${value} ${str}`);
      },
  });

  function Component({index}: $TEMPORARY$object<{index: number}>) {
    const value = useRecoilValue(query(index));
    return (
      <>
        {index} {value}
      </>
    );
  }

  let startReactTransition, startRecoilTransition, startBothTransition;
  function Main() {
    const [reactState, setReactState] = useState(0);
    const [recoilState, setRecoilState] = useRecoilState(myAtom);
    const [inTransition, startTransition] = useTransition();
    startReactTransition = () => {
      startTransition(() => {
        setReactState(x => x + 1);
      });
    };
    startRecoilTransition = () => {
      startTransition(() => {
        setRecoilState(x => x + 1);
      });
    };
    startBothTransition = () => {
      startTransition(() => {
        setReactState(x => x + 1);
        setRecoilState(x => x + 1);
      });
    };
    return (
      <>
        React:{reactState} Recoil:{recoilState}{' '}
        {inTransition ? '[IN TRANSITION] ' : ''}|{' '}
        <React.Suspense fallback="LOADING">
          <Component index={reactState} />
        </React.Suspense>
      </>
    );
  }

  const c = renderElements(<Main />);
  expect(c.textContent).toBe('React:0 Recoil:0 | LOADING');
  act(resolveSelectors);
  await flushPromisesAndTimers();
  expect(c.textContent).toBe('React:0 Recoil:0 | 0 0 0 RESOLVED');

  // Transition changing React State
  act(startReactTransition);
  expect(c.textContent).toBe(
    concurrentMode
      ? 'React:0 Recoil:0 [IN TRANSITION] | 0 0 0 RESOLVED'
      : 'React:1 Recoil:0 | LOADING',
  );
  act(resolveSelectors);
  await flushPromisesAndTimers();
  expect(c.textContent).toBe('React:1 Recoil:0 | 1 1 0 RESOLVED');

  // Transition changing Recoil State
  act(startRecoilTransition);
  expect(c.textContent).toBe(
    concurrentMode && reactMode().concurrent
      ? 'React:1 Recoil:0 [IN TRANSITION] | 1 1 0 RESOLVED'
      : 'React:1 Recoil:1 | LOADING',
  );
  act(resolveSelectors);
  await flushPromisesAndTimers();
  expect(c.textContent).toBe('React:1 Recoil:1 | 1 1 1 RESOLVED');

  // Second transition changing Recoil State
  act(startRecoilTransition);
  expect(c.textContent).toBe(
    concurrentMode && reactMode().concurrent
      ? 'React:1 Recoil:1 [IN TRANSITION] | 1 1 1 RESOLVED'
      : 'React:1 Recoil:2 | LOADING',
  );
  act(resolveSelectors);
  await flushPromisesAndTimers();
  expect(c.textContent).toBe('React:1 Recoil:2 | 1 1 2 RESOLVED');

  // Transition with both React and Recoil state
  act(startBothTransition);
  expect(c.textContent).toBe(
    concurrentMode &&
      (reactMode().concurrent || reactMode().mode === 'MUTABLE_SOURCE')
      ? 'React:1 Recoil:2 [IN TRANSITION] | 1 1 2 RESOLVED'
      : 'React:2 Recoil:3 | LOADING',
  );
  act(resolveSelectors);
  await flushPromisesAndTimers();
  act(resolveSelectors);
  await flushPromisesAndTimers();
  expect(c.textContent).toBe('React:2 Recoil:3 | 2 2 3 RESOLVED');
});

testRecoil(
  'useRecoilValue_TRANSITION_SUPPORT_UNSTABLE()',
  async ({concurrentMode}) => {
    if (useTransition == null) {
      return;
    }
    const myAtom = atom({key: 'TRANSITION_SUPPORT_UNSTABLE atom', default: 0});
    let resolvers: Array<(result: Promise<string> | string) => void> = [];
    function resolveSelectors() {
      resolvers.forEach(resolve => resolve('RESOLVED'));
      resolvers = [];
    }
    const query = selectorFamily({
      key: 'TRANSITION_SUPPORT_UNSTABLE selector',
      get:
        (
          // $FlowFixMe[missing-local-annot]
          param,
        ) =>
        // $FlowFixMe[missing-local-annot]
        ({get}) => {
          const value = get(myAtom);
          return new Promise(resolve => {
            resolvers.push(resolve);
            // $FlowFixMe[incompatible-type]
          }).then(str => `${param} ${value} ${str}`);
        },
    });

    function Component({index}: $TEMPORARY$object<{index: number}>) {
      const value = useRecoilValue_TRANSITION_SUPPORT_UNSTABLE(query(index));
      return (
        <>
          {index} {value}
        </>
      );
    }

    let startReactTransition, startRecoilTransition, startBothTransition;
    function Main() {
      const [reactState, setReactState] = useState(0);
      const [recoilState, setRecoilState] =
        useRecoilState_TRANSITION_SUPPORT_UNSTABLE(myAtom);
      const [inTransition, startTransition] = useTransition();
      startReactTransition = () => {
        startTransition(() => {
          setReactState(x => x + 1);
        });
      };
      startRecoilTransition = () => {
        startTransition(() => {
          setRecoilState(x => x + 1);
        });
      };
      startBothTransition = () => {
        startTransition(() => {
          setReactState(x => x + 1);
          setRecoilState(x => x + 1);
        });
      };
      return (
        <>
          React:{reactState} Recoil:{recoilState}{' '}
          {inTransition ? '[IN TRANSITION] ' : ''}|{' '}
          <React.Suspense fallback="LOADING">
            <Component index={reactState} />
          </React.Suspense>
        </>
      );
    }

    const c = renderElements(<Main />);
    expect(c.textContent).toBe('React:0 Recoil:0 | LOADING');
    act(resolveSelectors);
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('React:0 Recoil:0 | 0 0 0 RESOLVED');

    // Transition changing React State
    act(startReactTransition);
    expect(c.textContent).toBe(
      concurrentMode
        ? 'React:0 Recoil:0 [IN TRANSITION] | 0 0 0 RESOLVED'
        : 'React:1 Recoil:0 | LOADING',
    );
    act(resolveSelectors);
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('React:1 Recoil:0 | 1 1 0 RESOLVED');

    // Transition changing Recoil State
    act(startRecoilTransition);
    expect(c.textContent).toBe(
      concurrentMode && reactMode().early
        ? 'React:1 Recoil:0 [IN TRANSITION] | 1 1 0 RESOLVED'
        : 'React:1 Recoil:1 | LOADING',
    );
    act(resolveSelectors);
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('React:1 Recoil:1 | 1 1 1 RESOLVED');

    // Second transition changing Recoil State
    act(startRecoilTransition);
    expect(c.textContent).toBe(
      concurrentMode && reactMode().early
        ? 'React:1 Recoil:1 [IN TRANSITION] | 1 1 1 RESOLVED'
        : 'React:1 Recoil:2 | LOADING',
    );
    act(resolveSelectors);
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('React:1 Recoil:2 | 1 1 2 RESOLVED');

    // Transition with both React and Recoil State
    act(startBothTransition);
    expect(c.textContent).toBe(
      concurrentMode
        ? 'React:1 Recoil:2 [IN TRANSITION] | 1 1 2 RESOLVED'
        : 'React:2 Recoil:3 | LOADING',
    );
    act(resolveSelectors);
    await flushPromisesAndTimers();
    act(resolveSelectors);
    await flushPromisesAndTimers();
    expect(c.textContent).toBe('React:2 Recoil:3 | 2 2 3 RESOLVED');
  },
);
