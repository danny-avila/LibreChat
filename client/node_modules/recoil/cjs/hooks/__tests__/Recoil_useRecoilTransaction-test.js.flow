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

const {act} = require('ReactTestUtils');

const {
  getRecoilTestFn,
} = require('recoil-shared/__test_utils__/Recoil_TestingUtils');

let React,
  useState,
  useEffect,
  atom,
  useRecoilValue,
  useRecoilState,
  useRecoilTransaction,
  useRecoilSnapshot,
  renderElements,
  flushPromisesAndTimers,
  ReadsAtom;

const testRecoil = getRecoilTestFn(() => {
  React = require('react');
  ({useState, useEffect} = React);
  ({
    atom,
    useRecoilValue,
    useRecoilState,
    useRecoilTransaction_UNSTABLE: useRecoilTransaction,
    useRecoilSnapshot,
  } = require('../../Recoil_index'));
  ({
    renderElements,
    flushPromisesAndTimers,
    ReadsAtom,
  } = require('recoil-shared/__test_utils__/Recoil_TestingUtils'));
});

describe('Atoms', () => {
  testRecoil('Get with transaction', () => {
    const myAtom = atom({
      key: 'useRecoilTransaction atom get',
      default: 'DEFAULT',
    });

    let readAtom;
    let ranTransaction = false;
    function Component() {
      readAtom = useRecoilTransaction(({get}) => () => {
        expect(get(myAtom)).toEqual('DEFAULT');
        ranTransaction = true;
      });
      return null;
    }
    renderElements(<Component />);
    expect(ranTransaction).toBe(false);

    act(readAtom);
    expect(ranTransaction).toBe(true);
  });

  testRecoil('Set with transaction', () => {
    const myAtom = atom<string>({
      key: 'useRecoilTransaction atom set',
      default: 'DEFAULT',
    });

    function Component() {
      // $FlowFixMe[missing-local-annot]
      const transact = useRecoilTransaction(({set, get}) => value => {
        set(myAtom, 'TMP');
        expect(get(myAtom)).toEqual('TMP');
        set(myAtom, old => {
          expect(old).toEqual('TMP');
          return value;
        });
        expect(get(myAtom)).toEqual(value);
      });
      useEffect(() => {
        transact('TRANSACT');
      });
      return null;
    }

    const c = renderElements(
      <>
        <ReadsAtom atom={myAtom} />
        <Component />
      </>,
    );
    expect(c.textContent).toEqual('"TRANSACT"');
  });

  testRecoil('Dirty atoms', async () => {
    const beforeAtom = atom({
      key: 'useRecoilTransaction dirty before',
      default: 'DEFAULT',
    });
    const duringAtomA = atom({
      key: 'useRecoilTransaction dirty during A',
      default: 'DEFAULT',
    });
    const duringAtomB = atom({
      key: 'useRecoilTransaction dirty during B',
      default: 'DEFAULT',
    });
    const afterAtom = atom({
      key: 'useRecoilTransaction dirty after',
      default: 'DEFAULT',
    });

    let snapshot;
    let firstEffect = true;
    function Component() {
      const [beforeValue, setBefore] = useState('INITIAL');
      const [beforeAtomValue, setBeforeAtom] = useRecoilState(beforeAtom);
      const duringAValue = useRecoilValue(duringAtomA);
      const duringBValue = useRecoilValue(duringAtomB);
      const [afterAtomValue, setAfterAtom] = useRecoilState(afterAtom);
      const [afterValue, setAfter] = useState('INITIAL');
      const transaction = useRecoilTransaction(({set, get}) => () => {
        expect(get(beforeAtom)).toEqual('BEFORE');
        expect(get(duringAtomA)).toEqual('DEFAULT');
        expect(get(duringAtomB)).toEqual('DEFAULT');
        expect(get(afterAtom)).toEqual('DEFAULT');
        set(duringAtomA, 'DURING_A');
        set(duringAtomB, 'DURING_B');
      });
      snapshot = useRecoilSnapshot();

      useEffect(() => {
        setTimeout(() => {
          act(() => {
            if (firstEffect) {
              setBefore('BEFORE');
              setBeforeAtom('BEFORE');
              transaction();
              setAfterAtom('AFTER');
              setAfter('AFTER');
            }
            firstEffect = false;
          });
        }, 0);
      });

      return [
        beforeValue,
        beforeAtomValue,
        duringAValue,
        duringBValue,
        afterAtomValue,
        afterValue,
      ].join(',');
    }

    const c = renderElements(<Component />);
    expect(c.textContent).toBe(
      'INITIAL,DEFAULT,DEFAULT,DEFAULT,DEFAULT,INITIAL',
    );
    expect(
      Array.from(snapshot?.getNodes_UNSTABLE({isModified: true}) ?? []),
    ).toEqual([]);

    await flushPromisesAndTimers();
    expect(c.textContent).toBe('BEFORE,BEFORE,DURING_A,DURING_B,AFTER,AFTER');
    expect(
      Array.from(snapshot?.getNodes_UNSTABLE({isModified: true}) ?? []).map(
        ({key}) => key,
      ),
    ).toEqual([
      'useRecoilTransaction dirty before',
      'useRecoilTransaction dirty during A',
      'useRecoilTransaction dirty during B',
      'useRecoilTransaction dirty after',
    ]);
  });
});

describe('Atom Effects', () => {
  testRecoil(
    'Atom effects are run when first get from a transaction',
    async () => {
      let numTimesEffectInit = 0;

      const atomWithEffect = atom({
        key: 'atom effect first get transaction',
        default: 'DEFAULT',
        effects: [
          ({trigger}) => {
            expect(trigger).toEqual('get');
            numTimesEffectInit++;
          },
        ],
      });

      let getAtomWithTransaction;
      let ranTransaction = false;
      const Component = () => {
        getAtomWithTransaction = useRecoilTransaction(({get}) => () => {
          expect(get(atomWithEffect)).toEqual('DEFAULT');
          ranTransaction = true;
        });
        return null;
      };

      renderElements(<Component />);

      act(() => getAtomWithTransaction());
      expect(ranTransaction).toBe(true);
      expect(numTimesEffectInit).toBe(1);
    },
  );

  testRecoil(
    'Atom effects are run when first set with a transaction',
    async ({strictMode, concurrentMode}) => {
      let numTimesEffectInit = 0;

      const atomWithEffect = atom({
        key: 'atom effect first set transaction',
        default: 'DEFAULT',
        effects: [
          ({trigger}) => {
            expect(trigger).toEqual('set');
            numTimesEffectInit++;
          },
        ],
      });

      let setAtomWithTransaction;
      const Component = () => {
        setAtomWithTransaction = useRecoilTransaction(({set}) => () => {
          set(atomWithEffect, 'SET');
        });
        useEffect(() => {
          act(setAtomWithTransaction);
        });
        return null;
      };

      renderElements(<Component />);
      expect(numTimesEffectInit).toBe(strictMode && concurrentMode ? 2 : 1);
    },
  );

  testRecoil('Atom effects can initialize for a transaction', async () => {
    let numTimesEffectInit = 0;
    const atomWithEffect = atom({
      key: 'atom effect init transaction',
      default: 'DEFAULT',
      effects: [
        ({setSelf}) => {
          setSelf('INIT');
          numTimesEffectInit++;
        },
      ],
    });

    let initAtomWithTransaction;
    let ranTransaction = false;
    const Component = () => {
      initAtomWithTransaction = useRecoilTransaction(({get}) => () => {
        expect(get(atomWithEffect)).toEqual('INIT');
        ranTransaction = true;
      });
      return null;
    };

    renderElements(<Component />);

    act(() => initAtomWithTransaction());
    expect(ranTransaction).toBe(true);
    expect(numTimesEffectInit).toBe(1);
  });

  testRecoil(
    'Atom effects are initialized once if first seen on transaction and then on root store',
    ({strictMode, concurrentMode}) => {
      const sm = strictMode && concurrentMode ? 2 : 1;
      let numTimesEffectInit = 0;

      const atomWithEffect = atom({
        key: 'useRecoilTransaction effect first get transaction',
        default: 0,
        effects: [
          () => {
            numTimesEffectInit++;
          },
        ],
      });

      const Component = () => {
        const readAtomFromSnapshot = useRecoilTransaction(({get}) => () => {
          get(atomWithEffect);
        });

        readAtomFromSnapshot(); // first initialization
        expect(numTimesEffectInit).toBeGreaterThanOrEqual(1);
        const effectsRan = numTimesEffectInit;

        /**
         * Transactions do not use a snapshot under the hood, so any initialized
         * effects from a transaction will be reflected in root store
         */
        useRecoilValue(atomWithEffect);
        expect(numTimesEffectInit).toBe(effectsRan);

        return 'RENDERED';
      };

      const c = renderElements(<Component />);
      expect(c.textContent).toBe('RENDERED');
      expect(numTimesEffectInit).toBe(1 * sm);
    },
  );

  testRecoil(
    'Atom effects are initialized once if first seen on root store and then on snapshot',
    ({strictMode, concurrentMode}) => {
      const sm = strictMode && concurrentMode ? 2 : 1;
      let numTimesEffectInit = 0;

      const atomWithEffect = atom({
        key: 'atom effect first get root',
        default: 0,
        effects: [
          () => {
            numTimesEffectInit++;
          },
        ],
      });

      const Component = () => {
        const readAtomFromSnapshot = useRecoilTransaction(({get}) => () => {
          get(atomWithEffect);
        });

        useRecoilValue(atomWithEffect); // first initialization
        expect(numTimesEffectInit).toBeGreaterThanOrEqual(1);
        const effectsRan = numTimesEffectInit;

        /**
         * Transactions do not use a snapshot under the hood, so any initialized
         * effects from a transaction will be reflected in root store
         */
        readAtomFromSnapshot();
        expect(numTimesEffectInit).toBe(effectsRan);

        return 'RENDERED';
      };

      const c = renderElements(<Component />);
      expect(c.textContent).toBe('RENDERED');
      expect(numTimesEffectInit).toBe(1 * sm);
    },
  );
});
