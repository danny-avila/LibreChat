/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Returns an atom, the basic unit of state in Recoil. An atom is a reference to
 * value that can be read, written, and subscribed to. It has a `key` that is
 * stable across time so that it can be persisted.
 *
 * There are two required options for creating an atom:
 *
 *    key. This is a string that uniquely identifies the atom. It should be
 *         stable across time so that persisted states remain valid.
 *
 *    default
 *          If `default` is provided, the atom is initialized to that value.
 *          Or, it may be set to another RecoilValue to use as a fallback.
 *          In that case, the value of the atom will be equal to that of the
 *          fallback, and will remain so until the first time the atom is written
 *          to, at which point it will stop tracking the fallback RecoilValue.
 *
 * The `persistence` option specifies that the atom should be saved to storage.
 * It is an object with two properties: `type` specifies where the atom should
 * be persisted; its only allowed value is "url"; `backButton` specifies whether
 * changes to the atom should result in pushes to the browser history stack; if
 * true, changing the atom and then hitting the Back button will cause the atom's
 * previous value to be restored. Applications are responsible for implementing
 * persistence by using the `useTransactionObservation` hook.
 *
 * Scoped atoms (DEPRECATED):
 * ===================================================================================
 *
 * The scopeRules_APPEND_ONLY_READ_THE_DOCS option causes the atom be be "scoped".
 * A scoped atom's value depends on other parts of the application state.
 * A separate value of the atom is stored for every value of the state that it
 * depends on. The dependencies may be changed without breaking existing URLs --
 * it uses whatever rule was current when the URL was written. Values written
 * under the newer rules are overlaid atop the previously-written values just for
 * those states in which the write occurred, with reads falling back to the older
 * values in other states, and eventually to the default or fallback.
 *
 * The scopedRules_APPEND_ONLY_READ_THE_DOCS parameter is a list of rules;
 * it should start with a single entry. This list must only be appended to:
 * existing entries must never be deleted or modified. Each rule is an atom
 * or selector whose value is some arbitrary key. A different value of the
 * scoped atom will be stored for each key. To change the scope rule, simply add
 * a new function to the list. Each rule is either an array of atoms of primitives,
 * or an atom of an array of primitives.
 *
 * Ordinary atoms may be upgraded to scoped atoms. To un-scope an atom, add a new
 * scope rule consisting of a constant.
 *
 * @flow strict-local
 * @format
 * @oncall recoil
 */

'use strict';

import type {Loadable, LoadingLoadableType} from '../adt/Recoil_Loadable';
import type {RecoilValueInfo} from '../core/Recoil_FunctionalCore';
import type {StoreID} from '../core/Recoil_Keys';
import type {
  PersistenceInfo,
  ReadWriteNodeOptions,
  Trigger,
} from '../core/Recoil_Node';
import type {RecoilState, RecoilValue} from '../core/Recoil_RecoilValue';
import type {RetainedBy} from '../core/Recoil_RetainedBy';
import type {AtomWrites, NodeKey, Store, TreeState} from '../core/Recoil_State';
// @fb-only: import type {ScopeRules} from 'Recoil_ScopedAtom';

// @fb-only: const {scopedAtom} = require('Recoil_ScopedAtom');

const {
  isLoadable,
  loadableWithError,
  loadableWithPromise,
  loadableWithValue,
} = require('../adt/Recoil_Loadable');
const {WrappedValue} = require('../adt/Recoil_Wrapper');
const {peekNodeInfo} = require('../core/Recoil_FunctionalCore');
const {
  DEFAULT_VALUE,
  DefaultValue,
  getConfigDeletionHandler,
  registerNode,
  setConfigDeletionHandler,
} = require('../core/Recoil_Node');
const {isRecoilValue} = require('../core/Recoil_RecoilValue');
const {
  getRecoilValueAsLoadable,
  markRecoilValueModified,
  setRecoilValue,
  setRecoilValueLoadable,
} = require('../core/Recoil_RecoilValueInterface');
const {retainedByOptionWithDefault} = require('../core/Recoil_Retention');
const selector = require('./Recoil_selector');
const deepFreezeValue = require('recoil-shared/util/Recoil_deepFreezeValue');
const err = require('recoil-shared/util/Recoil_err');
const expectationViolation = require('recoil-shared/util/Recoil_expectationViolation');
const isPromise = require('recoil-shared/util/Recoil_isPromise');
const nullthrows = require('recoil-shared/util/Recoil_nullthrows');
const recoverableViolation = require('recoil-shared/util/Recoil_recoverableViolation');

export type PersistenceSettings<Stored> = $ReadOnly<{
  ...PersistenceInfo,
  validator: (mixed, DefaultValue) => Stored | DefaultValue,
}>;

// TODO Support Loadable<T>
type NewValue<T> =
  | T
  | DefaultValue
  | Promise<T | DefaultValue>
  | WrappedValue<T>;
type NewValueOrUpdater<T> =
  | T
  | DefaultValue
  | Promise<T | DefaultValue>
  | WrappedValue<T>
  | ((T | DefaultValue) => T | DefaultValue | WrappedValue<T>);

// Effect is called the first time a node is used with a <RecoilRoot>
export type AtomEffect<T> = ({
  node: RecoilState<T>,
  storeID: StoreID,
  parentStoreID_UNSTABLE?: StoreID,
  trigger: Trigger,

  // Call synchronously to initialize value or async to change it later
  setSelf: (
    | T
    | DefaultValue
    | Promise<T | DefaultValue>
    | WrappedValue<T>
    | ((T | DefaultValue) => T | DefaultValue | WrappedValue<T>),
  ) => void,
  resetSelf: () => void,

  // Subscribe callbacks to events.
  // Atom effect observers are called before global transaction observers
  onSet: (
    (newValue: T, oldValue: T | DefaultValue, isReset: boolean) => void,
  ) => void,

  // Accessors to read other atoms/selectors
  getPromise: <S>(RecoilValue<S>) => Promise<S>,
  getLoadable: <S>(RecoilValue<S>) => Loadable<S>,
  getInfo_UNSTABLE: <S>(RecoilValue<S>) => RecoilValueInfo<S>,
}) => void | (() => void);

export type AtomOptionsWithoutDefault<T> = $ReadOnly<{
  key: NodeKey,
  effects?: $ReadOnlyArray<AtomEffect<T>>,
  effects_UNSTABLE?: $ReadOnlyArray<AtomEffect<T>>,
  persistence_UNSTABLE?: PersistenceSettings<T>,
  // @fb-only: scopeRules_APPEND_ONLY_READ_THE_DOCS?: ScopeRules,
  dangerouslyAllowMutability?: boolean,
  retainedBy_UNSTABLE?: RetainedBy,
}>;

type AtomOptionsWithDefault<T> = $ReadOnly<{
  ...AtomOptionsWithoutDefault<T>,
  default: RecoilValue<T> | Promise<T> | Loadable<T> | WrappedValue<T> | T,
}>;

export type AtomOptions<T> =
  | AtomOptionsWithDefault<T>
  | AtomOptionsWithoutDefault<T>;

type BaseAtomOptions<T> = $ReadOnly<{
  ...AtomOptions<T>,
  default: Promise<T> | Loadable<T> | WrappedValue<T> | T,
}>;

const unwrap = <T, S = T>(x: T | S | WrappedValue<T>): T | S =>
  x instanceof WrappedValue ? x.value : x;

function baseAtom<T>(options: BaseAtomOptions<T>): RecoilState<T> {
  const {key, persistence_UNSTABLE: persistence} = options;

  const retainedBy = retainedByOptionWithDefault(options.retainedBy_UNSTABLE);
  let liveStoresCount = 0;

  function unwrapPromise(promise: Promise<T>): Loadable<T> {
    return loadableWithPromise(
      promise
        .then(value => {
          defaultLoadable = loadableWithValue(value);
          return value;
        })
        .catch(error => {
          defaultLoadable = loadableWithError(error);
          throw error;
        }),
    );
  }

  let defaultLoadable: Loadable<T> = isPromise(options.default)
    ? unwrapPromise(options.default)
    : isLoadable(options.default)
    ? options.default.state === 'loading'
      ? unwrapPromise((options.default: LoadingLoadableType<T>).contents)
      : options.default
    : // $FlowFixMe[incompatible-call]
      loadableWithValue(unwrap(options.default));
  maybeFreezeValueOrPromise(defaultLoadable.contents);

  let cachedAnswerForUnvalidatedValue: void | Loadable<T> = undefined;

  // Cleanup handlers for this atom
  // Rely on stable reference equality of the store to use it as a key per <RecoilRoot>
  const cleanupEffectsByStore: Map<Store, Array<() => void>> = new Map();

  function maybeFreezeValueOrPromise(valueOrPromise: mixed) {
    if (__DEV__) {
      if (options.dangerouslyAllowMutability !== true) {
        if (isPromise(valueOrPromise)) {
          return valueOrPromise.then(value => {
            deepFreezeValue(value);
            return value;
          });
        } else {
          deepFreezeValue(valueOrPromise);
          return valueOrPromise;
        }
      }
    }
    return valueOrPromise;
  }

  function wrapPendingPromise(
    store: Store,
    promise: Promise<T | DefaultValue>,
  ): Promise<T | DefaultValue> {
    const wrappedPromise: Promise<T | DefaultValue> = promise
      .then(value => {
        const state = store.getState().nextTree ?? store.getState().currentTree;

        if (state.atomValues.get(key)?.contents === wrappedPromise) {
          setRecoilValue(store, node, value);
        }

        return value;
      })
      .catch(error => {
        const state = store.getState().nextTree ?? store.getState().currentTree;
        if (state.atomValues.get(key)?.contents === wrappedPromise) {
          setRecoilValueLoadable(store, node, loadableWithError(error));
        }
        throw error;
      });

    return wrappedPromise;
  }

  function initAtom(
    store: Store,
    initState: TreeState,
    trigger: Trigger,
  ): () => void {
    liveStoresCount++;
    const cleanupAtom = () => {
      liveStoresCount--;
      cleanupEffectsByStore.get(store)?.forEach(cleanup => cleanup());
      cleanupEffectsByStore.delete(store);
    };

    store.getState().knownAtoms.add(key);

    // Setup async defaults to notify subscribers when they resolve
    if (defaultLoadable.state === 'loading') {
      const notifyDefaultSubscribers = () => {
        const state = store.getState().nextTree ?? store.getState().currentTree;
        if (!state.atomValues.has(key)) {
          markRecoilValueModified(store, node);
        }
      };
      defaultLoadable.contents.finally(notifyDefaultSubscribers);
    }

    ///////////////////
    // Run Atom Effects
    ///////////////////

    const effects = options.effects ?? options.effects_UNSTABLE;
    if (effects != null) {
      // This state is scoped by Store, since this is in the initAtom() closure
      let initValue: NewValue<T> = DEFAULT_VALUE;
      let isDuringInit = true;
      let isInitError: boolean = false;
      let pendingSetSelf: ?{
        effect: AtomEffect<T>,
        value: T | DefaultValue,
      } = null;

      function getLoadable<S>(recoilValue: RecoilValue<S>): Loadable<S> {
        // Normally we can just get the current value of another atom.
        // But for our own value we need to check if there is a pending
        // initialized value or get the fallback default value.
        if (isDuringInit && recoilValue.key === key) {
          // Cast T to S
          const retValue: NewValue<S> = (initValue: any); // flowlint-line unclear-type:off
          return retValue instanceof DefaultValue
            ? (peekAtom(store, initState): any) // flowlint-line unclear-type:off
            : isPromise(retValue)
            ? loadableWithPromise(
                retValue.then((v: S | DefaultValue): S | Promise<S> =>
                  v instanceof DefaultValue
                    ? // Cast T to S
                      (defaultLoadable: any).toPromise() // flowlint-line unclear-type:off
                    : v,
                ),
              )
            : // $FlowFixMe[incompatible-call]
              loadableWithValue(retValue);
        }
        return getRecoilValueAsLoadable(store, recoilValue);
      }

      function getPromise<S>(recoilValue: RecoilValue<S>): Promise<S> {
        return getLoadable(recoilValue).toPromise();
      }

      function getInfo_UNSTABLE<S>(
        recoilValue: RecoilValue<S>,
      ): RecoilValueInfo<S> {
        const info = peekNodeInfo<S>(
          store,
          store.getState().nextTree ?? store.getState().currentTree,
          recoilValue.key,
        );
        return isDuringInit &&
          recoilValue.key === key &&
          !(initValue instanceof DefaultValue)
          ? {...info, isSet: true, loadable: getLoadable(recoilValue)}
          : info;
      }

      const setSelf =
        (effect: AtomEffect<T>) => (valueOrUpdater: NewValueOrUpdater<T>) => {
          if (isDuringInit) {
            const currentLoadable = getLoadable(node);
            const currentValue: T | DefaultValue =
              currentLoadable.state === 'hasValue'
                ? currentLoadable.contents
                : DEFAULT_VALUE;
            initValue =
              typeof valueOrUpdater === 'function'
                ? // cast to any because we can't restrict T from being a function without losing support for opaque types
                  (valueOrUpdater: any)(currentValue) // flowlint-line unclear-type:off
                : valueOrUpdater;
            if (isPromise(initValue)) {
              initValue = initValue.then(value => {
                // Avoid calling onSet() when setSelf() initializes with a Promise
                pendingSetSelf = {effect, value};
                return value;
              });
            }
          } else {
            if (isPromise(valueOrUpdater)) {
              throw err('Setting atoms to async values is not implemented.');
            }

            if (typeof valueOrUpdater !== 'function') {
              pendingSetSelf = {
                effect,
                value: unwrap<T, DefaultValue>(valueOrUpdater),
              };
            }

            setRecoilValue(
              store,
              node,
              typeof valueOrUpdater === 'function'
                ? (currentValue: $FlowFixMe) => {
                    const newValue = unwrap(
                      // cast to any because we can't restrict T from being a function without losing support for opaque types
                      (valueOrUpdater: any)(currentValue), // flowlint-line unclear-type:off
                    );
                    // $FlowFixMe[incompatible-type]
                    pendingSetSelf = {effect, value: newValue};
                    return newValue;
                  }
                : unwrap(valueOrUpdater),
            );
          }
        };
      const resetSelf = (effect: AtomEffect<T>) => () =>
        setSelf(effect)(DEFAULT_VALUE);

      const onSet =
        (effect: AtomEffect<T>) =>
        (handler: (T, T | DefaultValue, boolean) => void) => {
          const {release} = store.subscribeToTransactions(currentStore => {
            // eslint-disable-next-line prefer-const
            let {currentTree, previousTree} = currentStore.getState();
            if (!previousTree) {
              recoverableViolation(
                'Transaction subscribers notified without a next tree being present -- this is a bug in Recoil',
                'recoil',
              );
              previousTree = currentTree; // attempt to trundle on
            }
            const newLoadable =
              currentTree.atomValues.get(key) ?? defaultLoadable;
            if (newLoadable.state === 'hasValue') {
              const newValue: T = newLoadable.contents;
              const oldLoadable =
                previousTree.atomValues.get(key) ?? defaultLoadable;
              const oldValue: T | DefaultValue =
                oldLoadable.state === 'hasValue'
                  ? oldLoadable.contents
                  : DEFAULT_VALUE; // TODO This isn't actually valid, use as a placeholder for now.

              // Ignore atom value changes that were set via setSelf() in the same effect.
              // We will still properly call the handler if there was a subsequent
              // set from something other than an atom effect which was batched
              // with the `setSelf()` call.  However, we may incorrectly ignore
              // the handler if the subsequent batched call happens to set the
              // atom to the exact same value as the `setSelf()`.   But, in that
              // case, it was kind of a noop, so the semantics are debatable..
              if (
                pendingSetSelf?.effect !== effect ||
                pendingSetSelf?.value !== newValue
              ) {
                handler(newValue, oldValue, !currentTree.atomValues.has(key));
              } else if (pendingSetSelf?.effect === effect) {
                pendingSetSelf = null;
              }
            }
          }, key);
          cleanupEffectsByStore.set(store, [
            ...(cleanupEffectsByStore.get(store) ?? []),
            release,
          ]);
        };

      for (const effect of effects) {
        try {
          const cleanup = effect({
            node,
            storeID: store.storeID,
            parentStoreID_UNSTABLE: store.parentStoreID,
            trigger,
            setSelf: setSelf(effect),
            resetSelf: resetSelf(effect),
            onSet: onSet(effect),
            getPromise,
            getLoadable,
            getInfo_UNSTABLE,
          });
          if (cleanup != null) {
            cleanupEffectsByStore.set(store, [
              ...(cleanupEffectsByStore.get(store) ?? []),
              cleanup,
            ]);
          }
        } catch (error) {
          initValue = error;
          isInitError = true;
        }
      }

      isDuringInit = false;

      // Mutate initial state in place since we know there are no other subscribers
      // since we are the ones initializing on first use.
      if (!(initValue instanceof DefaultValue)) {
        const initLoadable = isInitError
          ? loadableWithError<$FlowFixMe>(initValue)
          : isPromise(initValue)
          ? loadableWithPromise(wrapPendingPromise(store, initValue))
          : loadableWithValue(unwrap(initValue));
        maybeFreezeValueOrPromise(initLoadable.contents);
        initState.atomValues.set(key, initLoadable);

        // If there is a pending transaction, then also mutate the next state tree.
        // This could happen if the atom was first initialized in an action that
        // also updated some other atom's state.
        store.getState().nextTree?.atomValues.set(key, initLoadable);
      }
    }

    return cleanupAtom;
  }

  function peekAtom(_store: Store, state: TreeState): Loadable<T> {
    return (
      state.atomValues.get(key) ??
      cachedAnswerForUnvalidatedValue ??
      defaultLoadable
    );
  }

  function getAtom(_store: Store, state: TreeState): Loadable<T> {
    if (state.atomValues.has(key)) {
      // Atom value is stored in state:
      return nullthrows(state.atomValues.get(key));
    } else if (state.nonvalidatedAtoms.has(key)) {
      // Atom value is stored but needs validation before use.
      // We might have already validated it and have a cached validated value:
      if (cachedAnswerForUnvalidatedValue != null) {
        return cachedAnswerForUnvalidatedValue;
      }

      if (persistence == null) {
        expectationViolation(
          `Tried to restore a persisted value for atom ${key} but it has no persistence settings.`,
        );
        return defaultLoadable;
      }
      const nonvalidatedValue = state.nonvalidatedAtoms.get(key);
      const validatorResult: T | DefaultValue = persistence.validator(
        nonvalidatedValue,
        DEFAULT_VALUE,
      );

      const validatedValueLoadable =
        validatorResult instanceof DefaultValue
          ? defaultLoadable
          : loadableWithValue(validatorResult);

      cachedAnswerForUnvalidatedValue = validatedValueLoadable;

      return cachedAnswerForUnvalidatedValue;
    } else {
      return defaultLoadable;
    }
  }

  function invalidateAtom() {
    cachedAnswerForUnvalidatedValue = undefined;
  }

  function setAtom(
    _store: Store,
    state: TreeState,
    newValue: T | DefaultValue,
  ): AtomWrites {
    // Bail out if we're being set to the existing value, or if we're being
    // reset but have no stored value (validated or unvalidated) to reset from:
    if (state.atomValues.has(key)) {
      const existing = nullthrows(state.atomValues.get(key));
      if (existing.state === 'hasValue' && newValue === existing.contents) {
        return new Map();
      }
    } else if (
      !state.nonvalidatedAtoms.has(key) &&
      newValue instanceof DefaultValue
    ) {
      return new Map();
    }

    maybeFreezeValueOrPromise(newValue);

    cachedAnswerForUnvalidatedValue = undefined; // can be released now if it was previously in use

    return new Map<NodeKey, Loadable<$FlowFixMe>>().set(
      key,
      loadableWithValue(newValue),
    );
  }

  function shouldDeleteConfigOnReleaseAtom() {
    return getConfigDeletionHandler(key) !== undefined && liveStoresCount <= 0;
  }

  const node = registerNode(
    ({
      key,
      nodeType: 'atom',
      peek: peekAtom,
      get: getAtom,
      set: setAtom,
      init: initAtom,
      invalidate: invalidateAtom,
      shouldDeleteConfigOnRelease: shouldDeleteConfigOnReleaseAtom,
      dangerouslyAllowMutability: options.dangerouslyAllowMutability,
      persistence_UNSTABLE: options.persistence_UNSTABLE
        ? {
            type: options.persistence_UNSTABLE.type,
            backButton: options.persistence_UNSTABLE.backButton,
          }
        : undefined,
      shouldRestoreFromSnapshots: true,
      retainedBy,
    }: ReadWriteNodeOptions<T>),
  );
  return node;
}

// prettier-ignore
function atom<T>(options: AtomOptions<T>): RecoilState<T> {
  if (__DEV__) {
    if (typeof options.key !== 'string') {
      throw err(
        'A key option with a unique string value must be provided when creating an atom.',
      );
    }
  }

  const {
    // @fb-only: scopeRules_APPEND_ONLY_READ_THE_DOCS,
    ...restOptions
  } = options;
  const optionsDefault: RecoilValue<T> | Promise<T> | Loadable<T> | WrappedValue<T> | T =
    'default' in options
      ?
        // $FlowIssue[incompatible-type] No way to refine in Flow that property is not defined
        options.default
      : new Promise(() => {});

  if (isRecoilValue(optionsDefault)
    // Continue to use atomWithFallback for promise defaults for scoped atoms
    // for now, since scoped atoms don't support async defaults
   // @fb-only: || (isPromise(optionsDefault) && scopeRules_APPEND_ONLY_READ_THE_DOCS)
   // @fb-only: || (isLoadable(optionsDefault) && scopeRules_APPEND_ONLY_READ_THE_DOCS)
  ) {
    return atomWithFallback<T>({
      ...restOptions,
      default: optionsDefault,
      // @fb-only: scopeRules_APPEND_ONLY_READ_THE_DOCS,
    });
  // @fb-only: } else if (scopeRules_APPEND_ONLY_READ_THE_DOCS
    // @fb-only: && !isPromise(optionsDefault)
    // @fb-only: && !isLoadable(optionsDefault)
  // @fb-only: ) {
    // @fb-only: return scopedAtom<T>({
      // @fb-only: ...restOptions,
      // @fb-only: default: unwrap<T>(optionsDefault),
      // @fb-only: scopeRules_APPEND_ONLY_READ_THE_DOCS,
    // @fb-only: });
  } else {
    return baseAtom<T>({...restOptions, default: optionsDefault});
  }
}

type AtomWithFallbackOptions<T> = $ReadOnly<{
  ...AtomOptions<T>,
  default: RecoilValue<T> | Promise<T> | Loadable<T>,
}>;

function atomWithFallback<T>(
  options: AtomWithFallbackOptions<T>,
): RecoilState<T> {
  const base = atom<T | DefaultValue>({
    ...options,
    default: DEFAULT_VALUE,
    persistence_UNSTABLE:
      options.persistence_UNSTABLE === undefined
        ? undefined
        : {
            ...options.persistence_UNSTABLE,
            validator: (storedValue: mixed) =>
              storedValue instanceof DefaultValue
                ? storedValue
                : nullthrows(options.persistence_UNSTABLE).validator(
                    storedValue,
                    DEFAULT_VALUE,
                  ),
          },
    // TODO Hack for now.
    effects: (options.effects: any), // flowlint-line unclear-type: off
    effects_UNSTABLE: (options.effects_UNSTABLE: any), // flowlint-line unclear-type: off
  });

  // $FlowFixMe[incompatible-call]
  const sel = selector<T>({
    key: `${options.key}__withFallback`,
    get: ({get}) => {
      const baseValue = get(base);
      return baseValue instanceof DefaultValue ? options.default : baseValue;
    },
    // $FlowFixMe[incompatible-call]
    set: ({set}, newValue) => set(base, newValue),
    // This selector does not need to cache as it is a wrapper selector
    // and the selector within the wrapper selector will have a cache
    // option by default
    cachePolicy_UNSTABLE: {
      eviction: 'most-recent',
    },
    dangerouslyAllowMutability: options.dangerouslyAllowMutability,
  });
  setConfigDeletionHandler(sel.key, getConfigDeletionHandler(options.key));
  return sel;
}

// $FlowFixMe[missing-local-annot]
atom.value = value => new WrappedValue(value);

module.exports = (atom: {
  <T>(AtomOptions<T>): RecoilState<T>,
  value: <S>(S) => WrappedValue<S>,
});
