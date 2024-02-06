/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Return an atom whose state cannot vary independently but is derived from that
 * of other atoms. Whenever its dependency atoms change, it will re-evaluate
 * a function and pass along the result to any components or further selectors:
 *
 *    const exampleSelector = selector({
 *      key: 'example',
 *      get: ({get}) => {
 *        const a = get(atomA);
 *        const b = get(atomB);
 *        return a + b;
 *      },
 *    });
 *
 * In this example, the value of exampleSelector will be the sum of atomA and atomB.
 * This sum will be updated whenever either atomA or atomB changes. The value
 * returned by the function will be deeply frozen.
 *
 * The function is only reevaluated if the dependencies change and the selector
 * has a component subscribed to it (either directly or indirectly via other
 * selectors). By default, function results are cached, so if the same values
 * of the dependencies are seen again, the cached value will be returned instead
 * of the function being reevaluated. The caching behavior can be overridden
 * by providing the `cacheImplementation` option; this can be used to discard
 * old values or to provide different equality semantics.
 *
 * If the provided function returns a Promise, it will cause the value of the
 * atom to become unavailable until the promise resolves. This means that any
 * components subscribed to the selector will suspend. If the promise is rejected,
 * any subscribed components will throw the rejecting error during rendering.
 *
 * You can provide the `set` option to allow writing to the selector. This
 * should be used sparingly; maintain a conceptual separation between independent
 * state and derived values. The `set` function receives a function to set
 * upstream RecoilValues which can accept a value or an updater function.
 * The updater function provides parameters with the old value of the RecoilValue
 * as well as a get() function to read other RecoilValues.
 *
 *   const multiplierSelector = selector({
 *     key: 'multiplier',
 *     get: ({get}) => get(atomA) * 100,
 *     set: ({set, reset, get}, newValue) => set(atomA, newValue / 100),
 *   });
 *
 * @flow strict-local
 * @format
 * @oncall recoil
 */

'use strict';

import type {
  Loadable,
  LoadingLoadableType,
  ValueLoadableType,
} from '../adt/Recoil_Loadable';
import type {CachePolicy} from '../caches/Recoil_CachePolicy';
import type {
  NodeCacheRoute,
  TreeCacheImplementation,
} from '../caches/Recoil_TreeCacheImplementationType';
import type {StateID} from '../core/Recoil_Keys';
import type {DefaultValue} from '../core/Recoil_Node';
import type {
  RecoilState,
  RecoilValue,
  RecoilValueReadOnly,
} from '../core/Recoil_RecoilValue';
import type {RetainedBy} from '../core/Recoil_RetainedBy';
import type {AtomWrites, NodeKey, Store, TreeState} from '../core/Recoil_State';
import type {RecoilCallbackInterface} from '../hooks/Recoil_useRecoilCallback';
import type {
  GetRecoilValue,
  ResetRecoilState,
  SetRecoilState,
  ValueOrUpdater,
} from './Recoil_callbackTypes';

const {
  isLoadable,
  loadableWithError,
  loadableWithPromise,
  loadableWithValue,
} = require('../adt/Recoil_Loadable');
const {WrappedValue} = require('../adt/Recoil_Wrapper');
const treeCacheFromPolicy = require('../caches/Recoil_treeCacheFromPolicy');
const {
  getNodeLoadable,
  peekNodeLoadable,
  setNodeValue,
} = require('../core/Recoil_FunctionalCore');
const {saveDepsToStore} = require('../core/Recoil_Graph');
const {
  DEFAULT_VALUE,
  getConfigDeletionHandler,
  getNode,
  registerNode,
} = require('../core/Recoil_Node');
const {isRecoilValue} = require('../core/Recoil_RecoilValue');
const {
  markRecoilValueModified,
} = require('../core/Recoil_RecoilValueInterface');
const {retainedByOptionWithDefault} = require('../core/Recoil_Retention');
const {recoilCallback} = require('../hooks/Recoil_useRecoilCallback');
const concatIterables = require('recoil-shared/util/Recoil_concatIterables');
const deepFreezeValue = require('recoil-shared/util/Recoil_deepFreezeValue');
const err = require('recoil-shared/util/Recoil_err');
const filterIterable = require('recoil-shared/util/Recoil_filterIterable');
const gkx = require('recoil-shared/util/Recoil_gkx');
const invariant = require('recoil-shared/util/Recoil_invariant');
const isPromise = require('recoil-shared/util/Recoil_isPromise');
const mapIterable = require('recoil-shared/util/Recoil_mapIterable');
const nullthrows = require('recoil-shared/util/Recoil_nullthrows');
const {
  startPerfBlock,
} = require('recoil-shared/util/Recoil_PerformanceTimings');
const recoverableViolation = require('recoil-shared/util/Recoil_recoverableViolation');

type SelectorCallbackInterface<T> = $ReadOnly<{
  // TODO Technically this could be RecoilValueReadOnly, but trying to parameterize
  // it based on the selector type ran into problems which would lead to
  // dangerous error suppressions.
  node: RecoilState<T>,
  ...RecoilCallbackInterface,
}>;
export type GetCallback<T> = <Args: $ReadOnlyArray<mixed>, Return>(
  fn: (SelectorCallbackInterface<T>) => (...Args) => Return,
) => (...Args) => Return;

type BaseSelectorOptions = $ReadOnly<{
  key: string,

  dangerouslyAllowMutability?: boolean,
  retainedBy_UNSTABLE?: RetainedBy,
  cachePolicy_UNSTABLE?: CachePolicy,
}>;

export type ReadOnlySelectorOptions<T> = $ReadOnly<{
  ...BaseSelectorOptions,
  get: ({
    get: GetRecoilValue,
    getCallback: GetCallback<T>,
  }) => RecoilValue<T> | Promise<T> | Loadable<T> | WrappedValue<T> | T,
}>;

export type ReadWriteSelectorOptions<T> = $ReadOnly<{
  ...ReadOnlySelectorOptions<T>,
  set: (
    {set: SetRecoilState, get: GetRecoilValue, reset: ResetRecoilState},
    newValue: T | DefaultValue,
  ) => void,
}>;

export type SelectorOptions<T> =
  | ReadOnlySelectorOptions<T>
  | ReadWriteSelectorOptions<T>;

export type DepValues = Map<NodeKey, Loadable<mixed>>;

class Canceled {}
const CANCELED: Canceled = new Canceled();

/**
 * An ExecutionID is an arbitrary ID that lets us distinguish executions from
 * each other. This is necessary as we need a way of solving this problem:
 * "given 3 async executions, only update state for the 'latest' execution when
 * it finishes running regardless of when the other 2 finish". ExecutionIDs
 * provide a convenient way of identifying executions so that we can track and
 * manage them over time.
 */
type ExecutionID = number;

/**
 * ExecutionInfo is useful for managing async work and resolving race
 * conditions. It keeps track of the following:
 *
 * 1. The dep values found so far for the latest running execution. This is
 *    useful for answering the question "given a new state, have any of the
 *    async execution's discovered dep values changed?"
 * 2. The latest loadable, which holds the loadable of the latest execution.
 *    This is important because we need to return this loadable when the
 *    selector's result is requested and there is a pending async execution. We
 *    are essentially caching the latest loading loadable without using the
 *    actual selector cache so that we can avoid creating cache keys that use
 *    partial dependencies (we never want to cache based on partial
 *    dependencies).
 * 3. The latest execution ID, which is needed to know whether or not an async
 *    execution is stale. At any point in time there may be any number of stale
 *    executions running, but there is only one 'latest' execution, which
 *    represents the execution that will make its way to the UI and make updates
 *    to global state when it finishes.
 * 4. The set of stateVersions which have already been tested as valid for this
 *    evalution.  This is an optimization to avoid having to transitively
 *    check if any deps have changed for a state we have aleady checked.
 *    If additional async dependencies are discovered later, they may have
 *    different values in different stores/states, so this will have to be
 *    cleared.
 */
type ExecutionInfo<T> = {
  // This is mutable and updated as new deps are discovered
  depValuesDiscoveredSoFarDuringAsyncWork: DepValues,
  loadingLoadable: LoadingLoadableType<T>,
  executionID: ExecutionID,
  stateVersions: Map<StateID, boolean>,
};

// An object to hold the current state for loading dependencies for a particular
// execution of a selector.  This is used for async selector handling to know
// which dependency was pending or if a user-promise was thrown.  An object is
// used instead of just a variable with the loadingDepKey so that if the
// selector is async we can still access the current state in a promise chain
// by updating the object reference.
type LoadingDepsState = {
  loadingDepKey: NodeKey | null,
  loadingDepPromise: Promise<mixed> | null,
};

const dependencyStack = []; // for detecting circular dependencies.
const waitingStores: Map<ExecutionID, Set<Store>> = new Map();

const getNewExecutionID: () => ExecutionID = (() => {
  let executionID = 0;
  return () => executionID++;
})();

/* eslint-disable no-redeclare */
declare function selector<T>(
  options: ReadOnlySelectorOptions<T>,
): RecoilValueReadOnly<T>;
declare function selector<T>(
  options: ReadWriteSelectorOptions<T>,
): RecoilState<T>;

function selector<T>(
  options: ReadOnlySelectorOptions<T> | ReadWriteSelectorOptions<T>,
): RecoilValue<T> {
  let recoilValue: ?RecoilValue<T> = null;

  const {key, get, cachePolicy_UNSTABLE: cachePolicy} = options;
  const set = options.set != null ? options.set : undefined; // flow
  if (__DEV__) {
    if (typeof key !== 'string') {
      throw err(
        'A key option with a unique string value must be provided when creating a selector.',
      );
    }
    if (typeof get !== 'function') {
      throw err(
        'Selectors must specify a get callback option to get the selector value.',
      );
    }
  }

  // This is every discovered dependency across all executions
  const discoveredDependencyNodeKeys = new Set<NodeKey>();

  const cache: TreeCacheImplementation<Loadable<T>> = treeCacheFromPolicy(
    cachePolicy ?? {
      equality: 'reference',
      eviction: 'keep-all',
    },
    key,
  );

  const retainedBy = retainedByOptionWithDefault(options.retainedBy_UNSTABLE);

  const executionInfoMap: Map<Store, ExecutionInfo<T>> = new Map();
  let liveStoresCount = 0;

  function selectorIsLive() {
    return !gkx('recoil_memory_managament_2020') || liveStoresCount > 0;
  }

  function selectorInit(store: Store): () => void {
    store.getState().knownSelectors.add(key);
    liveStoresCount++;
    return () => {
      liveStoresCount--;
    };
  }

  function selectorShouldDeleteConfigOnRelease() {
    return getConfigDeletionHandler(key) !== undefined && !selectorIsLive();
  }

  function resolveAsync(
    store: Store,
    state: TreeState,
    executionID: ExecutionID,
    loadable: Loadable<T>,
    depValues: DepValues,
  ): void {
    setCache(state, loadable, depValues);
    notifyStoresOfResolvedAsync(store, executionID);
  }

  function notifyStoresOfResolvedAsync(
    store: Store,
    executionID: ExecutionID,
  ): void {
    if (isLatestExecution(store, executionID)) {
      clearExecutionInfo(store);
    }
    notifyWaitingStores(executionID, true);
  }

  /**
   * Notify stores to pull the selector again if a new async dep was discovered.
   * 1) Async selector adds a new dep but doesn't resolve yet.
   *    Note that deps for an async selector are based on the state when the
   *    evaluation started, in order to provide a consistent picture of state.
   * 2) But, new value of dep based on the current state might cause the selector
   *    to resolve or resolve differently.
   * 3) Therefore, this notification will pull the selector based on the current
   *    state for the components
   */
  function notifyStoresOfNewAsyncDep(
    store: Store,
    executionID: ExecutionID,
  ): void {
    if (isLatestExecution(store, executionID)) {
      const executionInfo = nullthrows(getExecutionInfo(store));
      executionInfo.stateVersions.clear();
      notifyWaitingStores(executionID, false);
    }
  }

  function notifyWaitingStores(
    executionID: ExecutionID,
    clearWaitlist: boolean,
  ) {
    const stores = waitingStores.get(executionID);
    if (stores != null) {
      for (const waitingStore of stores) {
        markRecoilValueModified(waitingStore, nullthrows(recoilValue));
      }
      if (clearWaitlist) {
        waitingStores.delete(executionID);
      }
    }
  }

  function markStoreWaitingForResolvedAsync(
    store: Store,
    executionID: ExecutionID,
  ): void {
    let stores = waitingStores.get(executionID);
    if (stores == null) {
      waitingStores.set(executionID, (stores = new Set()));
    }
    stores.add(store);
  }

  /**
   * This function attaches a then() and a catch() to a promise that was
   * returned from a selector's get() (either explicitly or implicitly by
   * running a function that uses the "async" keyword). If a selector's get()
   * returns a promise, we have two possibilities:
   *
   * 1. The promise will resolve, in which case it will have completely finished
   *    executing without any remaining pending dependencies. No more retries
   *    are needed and we can proceed with updating the cache and notifying
   *    subscribers (if it is the latest execution, otherwise only the cache
   *    will be updated and subscriptions will not be fired). This is the case
   *    handled by the attached then() handler.
   *
   * 2. The promise will throw because it either has an error or it came across
   *    an async dependency that has not yet resolved, in which case we will
   *    call wrapDepdencyPromise(), whose responsibility is to handle dependency
   *    promises. This case is handled by the attached catch() handler.
   *
   * Both branches will eventually resolve to the final result of the selector
   * (or an error if a real error occurred).
   *
   * The execution will run to completion even if it is stale, and its value
   * will be cached. But stale executions will not update global state or update
   * executionInfo as that is the responsibility of the 'latest' execution.
   *
   * Note this function should not be passed a promise that was thrown--AKA a
   * dependency promise. Dependency promises should be passed to
   * wrapPendingDependencyPromise()).
   */
  function wrapResultPromise(
    store: Store,
    promise: Promise<T>,
    state: TreeState,
    depValues: DepValues,
    executionID: ExecutionID,
    loadingDepsState: LoadingDepsState,
  ): Promise<T> {
    return promise
      .then(value => {
        if (!selectorIsLive()) {
          // The selector was released since the request began; ignore the response.
          clearExecutionInfo(store);
          throw CANCELED;
        }

        const loadable = loadableWithValue(value);
        resolveAsync(store, state, executionID, loadable, depValues);
        return value;
      })
      .catch(errorOrPromise => {
        if (!selectorIsLive()) {
          // The selector was released since the request began; ignore the response.
          clearExecutionInfo(store);
          throw CANCELED;
        }

        if (isPromise(errorOrPromise)) {
          return wrapPendingDependencyPromise(
            store,
            errorOrPromise,
            state,
            depValues,
            executionID,
            loadingDepsState,
          );
        }

        const loadable = loadableWithError<T>(errorOrPromise);
        resolveAsync(store, state, executionID, loadable, depValues);
        throw errorOrPromise;
      });
  }

  /**
   * This function attaches a then() and a catch() to a promise that was
   * thrown from a selector's get(). If a selector's get() throws a promise,
   * we have two possibilities:
   *
   * 1. The promise will resolve, meaning one of our selector's dependencies is
   *    now available and we should "retry" our get() by running it again. This
   *    is the case handled by the attached then() handler.
   *
   * 2. The promise will throw because something went wrong with the dependency
   *    promise (in other words a real error occurred). This case is handled by
   *    the attached catch() handler. If the dependency promise throws, it is
   *    _always_ a real error and not another dependency promise (any dependency
   *    promises would have been handled upstream).
   *
   * The then() branch will eventually resolve to the final result of the
   * selector (or an error if a real error occurs), and the catch() will always
   * resolve to an error because the dependency promise is a promise that was
   * wrapped upstream, meaning it will only resolve to its real value or to a
   * real error.
   *
   * The execution will run to completion even if it is stale, and its value
   * will be cached. But stale executions will not update global state or update
   * executionInfo as that is the responsibility of the 'latest' execution.
   *
   * Note this function should not be passed a promise that was returned from
   * get(). The intention is that this function is only passed promises that
   * were thrown due to a pending dependency. Promises returned by get() should
   * be passed to wrapResultPromise() instead.
   */
  function wrapPendingDependencyPromise(
    store: Store,
    promise: Promise<mixed>,
    state: TreeState,
    existingDeps: DepValues,
    executionID: ExecutionID,
    loadingDepsState: LoadingDepsState,
  ): Promise<T> {
    return promise
      .then(resolvedDep => {
        if (!selectorIsLive()) {
          // The selector was released since the request began; ignore the response.
          clearExecutionInfo(store);
          throw CANCELED;
        }

        // Check if we are handling a pending Recoil dependency or if the user
        // threw their own Promise to "suspend" a selector evaluation.  We need
        // to check that the loadingDepPromise actually matches the promise that
        // we caught in case the selector happened to catch the promise we threw
        // for a pending Recoil dependency from `getRecoilValue()` and threw
        // their own promise instead.
        if (
          loadingDepsState.loadingDepKey != null &&
          loadingDepsState.loadingDepPromise === promise
        ) {
          /**
           * Note for async atoms, this means we are changing the atom's value
           * in the store for the given version. This should be alright because
           * the version of state is now stale and a new version will have
           * already been triggered by the atom being resolved (see this logic
           * in Recoil_atom.js)
           */
          state.atomValues.set(
            loadingDepsState.loadingDepKey,
            loadableWithValue(resolvedDep),
          );
        } else {
          /**
           * If resolvedDepKey is not defined, the promise was a user-thrown
           * promise. User-thrown promises are an advanced feature and they
           * should be avoided in almost all cases. Using `loadable.map()` inside
           * of selectors for loading loadables and then throwing that mapped
           * loadable's promise is an example of a user-thrown promise.
           *
           * When we hit a user-thrown promise, we have to bail out of an optimization
           * where we bypass calculating selector cache keys for selectors that
           * have been previously seen for a given state (these selectors are saved in
           * state.atomValues) to avoid stale state as we have no way of knowing
           * what state changes happened (if any) in result to the promise resolving.
           *
           * Ideally we would only bail out selectors that are in the chain of
           * dependencies for this selector, but there's currently no way to get
           * a full list of a selector's downstream nodes because the state that
           * is executing may be a discarded tree (so store.getGraph(state.version)
           * will be empty), and the full dep tree may not be in the selector
           * caches in the case where the selector's cache was cleared. To solve
           * for this we would have to keep track of all running selector
           * executions and their downstream deps. Because this only covers edge
           * cases, that complexity might not be justifyable.
           */
          store.getState().knownSelectors.forEach(nodeKey => {
            state.atomValues.delete(nodeKey);
          });
        }

        /**
         * Optimization: Now that the dependency has resolved, let's try hitting
         * the cache in case the dep resolved to a value we have previously seen.
         *
         * TODO:
         * Note this optimization is not perfect because it only prevents re-executions
         * _after_ the point where an async dependency is found. Any code leading
         * up to the async dependency may have run unnecessarily. The ideal case
         * would be to wait for the async dependency to resolve first, check the
         * cache, and prevent _any_ execution of the selector if the resulting
         * value of the dependency leads to a path that is found in the cache.
         * The ideal case is more difficult to implement as it would require that
         * we capture and wait for the the async dependency right after checking
         * the cache. The current approach takes advantage of the fact that running
         * the selector already has a code path that lets us exit early when
         * an async dep resolves.
         */
        const cachedLoadable = getLoadableFromCacheAndUpdateDeps(store, state);
        if (cachedLoadable && cachedLoadable.state !== 'loading') {
          /**
           * This has to notify stores of a resolved async, even if there is no
           * current pending execution for the following case:
           * 1) A component renders with this pending loadable.
           * 2) The upstream dependency resolves.
           * 3) While processing some other selector it reads this one, such as
           *    while traversing its dependencies.  At this point it gets the
           *    new resolved value synchronously and clears the current
           *    execution ID.  The component wasn't getting the value itself,
           *    though, so it still has the pending loadable.
           * 4) When this code executes the current execution id was cleared
           *    and it wouldn't notify the component of the new value.
           *
           * I think this is only an issue with "early" rendering since the
           * components got their value using the in-progress execution.
           * We don't have a unit test for this case yet.  I'm not sure it is
           * necessary with recoil_transition_support mode.
           */
          if (
            isLatestExecution(store, executionID) ||
            getExecutionInfo(store) == null
          ) {
            notifyStoresOfResolvedAsync(store, executionID);
          }

          if (cachedLoadable.state === 'hasValue') {
            return cachedLoadable.contents;
          } else {
            throw cachedLoadable.contents;
          }
        }

        /**
         * If this execution is stale, let's check to see if there is some in
         * progress execution with a matching state. If we find a match, then
         * we can take the value from that in-progress execution. Note this may
         * sound like an edge case, but may be very common in cases where a
         * loading dependency resolves from loading to having a value (thus
         * possibly triggering a re-render), and React re-renders before the
         * chained .then() functions run, thus starting a new execution as the
         * dep has changed value. Without this check we will run the selector
         * twice (once in the new execution and once again in this .then(), so
         * this check is necessary to keep unnecessary re-executions to a
         * minimum).
         *
         * Also note this code does not check across all executions that may be
         * running. It only optimizes for the _latest_ execution per store as
         * we currently do not maintain a list of all currently running executions.
         * This means in some cases we may run selectors more than strictly
         * necessary when there are multiple executions running for the same
         * selector. This may be a valid tradeoff as checking for dep changes
         * across all in-progress executions may take longer than just
         * re-running the selector. This will be app-dependent, and maybe in the
         * future we can make the behavior configurable. An ideal fix may be
         * to extend the tree cache to support caching loading states.
         */
        if (!isLatestExecution(store, executionID)) {
          const executionInfo = getInProgressExecutionInfo(store, state);
          if (executionInfo != null) {
            /**
             * Returning promise here without wrapping as the wrapper logic was
             * already done upstream when this promise was generated.
             */
            return executionInfo.loadingLoadable.contents;
          }
        }

        // Retry the selector evaluation now that the dependency has resolved
        const [loadable, depValues] = evaluateSelectorGetter(
          store,
          state,
          executionID,
        );

        if (loadable.state !== 'loading') {
          resolveAsync(store, state, executionID, loadable, depValues);
        }

        if (loadable.state === 'hasError') {
          throw loadable.contents;
        }
        return loadable.contents;
      })
      .catch(error => {
        // The selector was released since the request began; ignore the response.
        if (error instanceof Canceled) {
          throw CANCELED;
        }
        if (!selectorIsLive()) {
          clearExecutionInfo(store);
          throw CANCELED;
        }

        const loadable = loadableWithError<T>(error);
        resolveAsync(store, state, executionID, loadable, existingDeps);
        throw error;
      });
  }

  function updateDeps(
    store: Store,
    state: TreeState,
    deps: $ReadOnlySet<NodeKey>,
    executionID: ?ExecutionID,
  ): void {
    if (
      isLatestExecution(store, executionID) ||
      state.version === store.getState()?.currentTree?.version ||
      state.version === store.getState()?.nextTree?.version
    ) {
      saveDepsToStore(
        key,
        deps,
        store,
        store.getState()?.nextTree?.version ??
          store.getState().currentTree.version,
      );
    }
    for (const nodeKey of deps) {
      discoveredDependencyNodeKeys.add(nodeKey);
    }
  }

  function evaluateSelectorGetter(
    store: Store,
    state: TreeState,
    executionID: ExecutionID,
  ): [Loadable<T>, DepValues] {
    const endPerfBlock = startPerfBlock(key); // TODO T63965866: use execution ID here
    let duringSynchronousExecution = true;
    let duringAsynchronousExecution = true;
    const finishEvaluation = () => {
      endPerfBlock();
      duringAsynchronousExecution = false;
    };

    let result;
    let resultIsError = false;
    let loadable: Loadable<T>;
    const loadingDepsState: LoadingDepsState = {
      loadingDepKey: null,
      loadingDepPromise: null,
    };

    /**
     * Starting a fresh set of deps that we'll be using to update state. We're
     * starting a new set versus adding it in existing state deps because
     * the version of state that we update deps for may be a more recent version
     * than the version the selector was called with. This is because the latest
     * execution will update the deps of the current/latest version of state
     * (This is safe to do because the fact that the selector is the latest
     * execution means the deps we discover below are our best guess at the
     * deps for the current/latest state in the store)
     */
    const depValues = new Map<NodeKey, Loadable<mixed>>();

    function getRecoilValue<S>({key: depKey}: RecoilValue<S>): S {
      const depLoadable = getNodeLoadable<S>(store, state, depKey);

      depValues.set(depKey, depLoadable);

      // We need to update asynchronous dependencies as we go so the selector
      // knows if it has to restart evaluation if one of them is updated before
      // the asynchronous selector completely resolves.
      if (!duringSynchronousExecution) {
        updateDeps(store, state, new Set(depValues.keys()), executionID);
        notifyStoresOfNewAsyncDep(store, executionID);
      }

      switch (depLoadable.state) {
        case 'hasValue':
          return depLoadable.contents;
        case 'hasError':
          throw depLoadable.contents;
        case 'loading':
          loadingDepsState.loadingDepKey = depKey;
          loadingDepsState.loadingDepPromise = depLoadable.contents;
          throw depLoadable.contents;
      }
      throw err('Invalid Loadable state');
    }

    const getCallback = <Args: $ReadOnlyArray<mixed>, Return>(
      fn: (SelectorCallbackInterface<T>) => (...Args) => Return,
    ): ((...Args) => Return) => {
      return (...args) => {
        if (duringAsynchronousExecution) {
          throw err(
            'Callbacks from getCallback() should only be called asynchronously after the selector is evalutated.  It can be used for selectors to return objects with callbacks that can work with Recoil state without a subscription.',
          );
        }
        invariant(recoilValue != null, 'Recoil Value can never be null');
        return recoilCallback<Args, Return, {node: RecoilState<T>}>(
          store,
          fn,
          args,
          {node: (recoilValue: any)}, // flowlint-line unclear-type:off
        );
      };
    };

    try {
      result = get({get: getRecoilValue, getCallback});
      result = isRecoilValue(result) ? getRecoilValue(result) : result;

      if (isLoadable(result)) {
        if (result.state === 'hasError') {
          resultIsError = true;
        }
        result = (result: ValueLoadableType<T>).contents;
      }

      if (isPromise(result)) {
        result = wrapResultPromise(
          store,
          result,
          state,
          depValues,
          executionID,
          loadingDepsState,
        ).finally(finishEvaluation);
      } else {
        finishEvaluation();
      }

      result = result instanceof WrappedValue ? result.value : result;
    } catch (errorOrDepPromise) {
      result = errorOrDepPromise;

      if (isPromise(result)) {
        result = wrapPendingDependencyPromise(
          store,
          result,
          state,
          depValues,
          executionID,
          loadingDepsState,
        ).finally(finishEvaluation);
      } else {
        resultIsError = true;
        finishEvaluation();
      }
    }

    if (resultIsError) {
      loadable = loadableWithError(result);
    } else if (isPromise(result)) {
      loadable = loadableWithPromise<T>(result);
    } else {
      loadable = loadableWithValue<T>(result);
    }

    duringSynchronousExecution = false;
    updateExecutionInfoDepValues(store, executionID, depValues);
    updateDeps(store, state, new Set(depValues.keys()), executionID);
    return [loadable, depValues];
  }

  function getLoadableFromCacheAndUpdateDeps(
    store: Store,
    state: TreeState,
  ): ?Loadable<T> {
    // First, look up in the state cache
    // If it's here, then the deps in the store should already be valid.
    let cachedLoadable: ?Loadable<T> = state.atomValues.get(key);
    if (cachedLoadable != null) {
      return cachedLoadable;
    }

    // Second, look up in the selector cache and update the deps in the store
    const depsAfterCacheLookup = new Set<NodeKey>();
    try {
      cachedLoadable = cache.get(
        nodeKey => {
          invariant(
            typeof nodeKey === 'string',
            'Cache nodeKey is type string',
          );

          return getNodeLoadable<mixed>(store, state, nodeKey).contents;
        },
        {
          onNodeVisit: node => {
            if (node.type === 'branch' && node.nodeKey !== key) {
              depsAfterCacheLookup.add(node.nodeKey);
            }
          },
        },
      );
    } catch (error) {
      throw err(
        `Problem with cache lookup for selector "${key}": ${error.message}`,
      );
    }

    if (cachedLoadable) {
      // Cache the results in the state to allow for cheaper lookup than
      // iterating the tree cache of dependencies.
      state.atomValues.set(key, cachedLoadable);

      /**
       * Ensure store contains correct dependencies if we hit the cache so that
       * the store deps and cache are in sync for a given state. This is important
       * because store deps are normally updated when new executions are created,
       * but cache hits don't trigger new executions but they still _may_ signify
       * a change in deps in the store if the store deps for this state are empty
       * or stale.
       */
      updateDeps(
        store,
        state,
        depsAfterCacheLookup,
        getExecutionInfo(store)?.executionID,
      );
    }

    return cachedLoadable;
  }

  /**
   * Given a tree state, this function returns a Loadable of the current state.
   *
   * The selector's get() function will only be re-evaluated if _both_ of the
   * following statements are true:
   *
   * 1. The current dep values from the given state produced a cache key that
   *    was not found in the cache.
   * 2. There is no currently running async execution OR there is an
   *    async execution that is running, but after comparing the dep values in
   *    the given state with the dep values that the execution has discovered so
   *    far we find that at least one dep value has changed, in which case we
   *    start a new execution (the previously running execution will continue to
   *    run to completion, but only the new execution will be deemed the
   *    'latest' execution, meaning it will be the only execution that will
   *    update global state when it is finished. Any non-latest executions will
   *    run to completion and update the selector cache but not global state).
   */
  function getSelectorLoadableAndUpdateDeps(
    store: Store,
    state: TreeState,
  ): Loadable<T> {
    // First, see if our current state is cached
    const cachedVal = getLoadableFromCacheAndUpdateDeps(store, state);
    if (cachedVal != null) {
      clearExecutionInfo(store);
      return cachedVal;
    }

    // Second, check if there is already an ongoing execution based on the current state
    const inProgressExecutionInfo = getInProgressExecutionInfo(store, state);
    if (inProgressExecutionInfo != null) {
      if (inProgressExecutionInfo.loadingLoadable?.state === 'loading') {
        markStoreWaitingForResolvedAsync(
          store,
          inProgressExecutionInfo.executionID,
        );
      }

      // FIXME: check after the fact to see if we made the right choice by waiting
      return inProgressExecutionInfo.loadingLoadable;
    }

    // Third, start a new evaluation of the selector
    const newExecutionID = getNewExecutionID();
    const [loadable, newDepValues] = evaluateSelectorGetter(
      store,
      state,
      newExecutionID,
    );

    /**
     * Conditionally updates the cache with a given loadable.
     *
     * We only cache loadables that are not loading because our cache keys are
     * based on dep values, which are in an unfinished state for loadables that
     * have a 'loading' state (new deps may be discovered while the selector
     * runs its async code). We never want to cache partial dependencies b/c it
     * could lead to errors, such as prematurely returning the result based on a
     * partial list of deps-- we need the full list of deps to ensure that we
     * are returning the correct result from cache.
     */
    if (loadable.state === 'loading') {
      setExecutionInfo(store, newExecutionID, loadable, newDepValues, state);
      markStoreWaitingForResolvedAsync(store, newExecutionID);
    } else {
      clearExecutionInfo(store);
      setCache(state, loadable, newDepValues);
    }

    return loadable;
  }

  /**
   * Searches execution info across all stores to see if there is an in-progress
   * execution whose dependency values match the values of the requesting store.
   */
  function getInProgressExecutionInfo(
    store: Store,
    state: TreeState,
  ): ?ExecutionInfo<T> {
    // Sort the pending executions so that our current store is checked first.
    const pendingExecutions = concatIterables([
      executionInfoMap.has(store)
        ? [nullthrows(executionInfoMap.get(store))]
        : [],
      mapIterable(
        filterIterable(executionInfoMap, ([s]) => s !== store),
        ([, execInfo]) => execInfo,
      ),
    ]);

    function anyDepChanged(execDepValues: DepValues): boolean {
      for (const [depKey, execLoadable] of execDepValues) {
        if (!getNodeLoadable<mixed>(store, state, depKey).is(execLoadable)) {
          return true;
        }
      }
      return false;
    }

    for (const execInfo of pendingExecutions) {
      if (
        // If this execution was already checked to be valid with this version
        // of state, then let's use it!
        execInfo.stateVersions.get(state.version) ||
        // If the deps for the execution match our current state, then it's valid
        !anyDepChanged(execInfo.depValuesDiscoveredSoFarDuringAsyncWork)
      ) {
        execInfo.stateVersions.set(state.version, true);
        return execInfo;
      } else {
        execInfo.stateVersions.set(state.version, false);
      }
    }

    return undefined;
  }

  function getExecutionInfo(store: Store): ?ExecutionInfo<T> {
    return executionInfoMap.get(store);
  }

  /**
   * This function will update the selector's execution info when the selector
   * has either finished running an execution or has started a new execution. If
   * the given loadable is in a 'loading' state, the intention is that a new
   * execution has started. Otherwise, the intention is that an execution has
   * just finished.
   */
  function setExecutionInfo(
    store: Store,
    newExecutionID: ExecutionID,
    loadable: LoadingLoadableType<T>,
    depValues: DepValues,
    state: TreeState,
  ) {
    executionInfoMap.set(store, {
      depValuesDiscoveredSoFarDuringAsyncWork: depValues,
      executionID: newExecutionID,
      loadingLoadable: loadable,
      stateVersions: new Map([[state.version, true]]),
    });
  }

  function updateExecutionInfoDepValues(
    store: Store,
    executionID: ExecutionID,
    depValues: DepValues,
  ) {
    // We only need to bother updating the deps for the latest execution because
    // that's all getInProgressExecutionInfo() will be looking for.
    if (isLatestExecution(store, executionID)) {
      const executionInfo = getExecutionInfo(store);
      if (executionInfo != null) {
        executionInfo.depValuesDiscoveredSoFarDuringAsyncWork = depValues;
      }
    }
  }

  function clearExecutionInfo(store: Store) {
    executionInfoMap.delete(store);
  }

  function isLatestExecution(store: Store, executionID: ?ExecutionID): boolean {
    return executionID === getExecutionInfo(store)?.executionID;
  }

  /**
   * FIXME: dep keys should take into account the state of the loadable to
   * prevent the edge case where a loadable with an error and a loadable with
   * an error as a value are treated as the same thing incorrectly. For example
   * these two should be treated differently:
   *
   * selector({key: '', get: () => new Error('hi')});
   * selector({key: '', get () => {throw new Error('hi')}});
   *
   * With current implementation they are treated the same
   */
  function depValuesToDepRoute(depValues: DepValues): NodeCacheRoute {
    return Array.from(depValues.entries()).map(([depKey, valLoadable]) => [
      depKey,
      valLoadable.contents,
    ]);
  }

  function setCache(
    state: TreeState,
    loadable: Loadable<T>,
    depValues: DepValues,
  ) {
    if (__DEV__) {
      if (
        loadable.state !== 'loading' &&
        Boolean(options.dangerouslyAllowMutability) === false
      ) {
        deepFreezeValue(loadable.contents);
      }
    }

    state.atomValues.set(key, loadable);
    try {
      cache.set(depValuesToDepRoute(depValues), loadable);
    } catch (error) {
      throw err(
        `Problem with setting cache for selector "${key}": ${error.message}`,
      );
    }
  }

  function detectCircularDependencies(fn: () => Loadable<T>) {
    if (dependencyStack.includes(key)) {
      const message = `Recoil selector has circular dependencies: ${dependencyStack
        .slice(dependencyStack.indexOf(key))
        .join(' \u2192 ')}`;
      return loadableWithError<T>(err(message));
    }
    dependencyStack.push(key);
    try {
      return fn();
    } finally {
      dependencyStack.pop();
    }
  }

  function selectorPeek(store: Store, state: TreeState): ?Loadable<T> {
    const cachedLoadable = state.atomValues.get(key);
    if (cachedLoadable != null) {
      return cachedLoadable;
    }
    return cache.get(nodeKey => {
      invariant(typeof nodeKey === 'string', 'Cache nodeKey is type string');
      return peekNodeLoadable<mixed>(store, state, nodeKey)?.contents;
    });
  }

  function selectorGet(store: Store, state: TreeState): Loadable<T> {
    return detectCircularDependencies(() =>
      getSelectorLoadableAndUpdateDeps(store, state),
    );
  }

  function invalidateSelector(state: TreeState) {
    state.atomValues.delete(key);
  }

  function clearSelectorCache(store: Store, treeState: TreeState) {
    invariant(recoilValue != null, 'Recoil Value can never be null');
    for (const nodeKey of discoveredDependencyNodeKeys) {
      const node = getNode(nodeKey);
      node.clearCache?.(store, treeState);
    }
    discoveredDependencyNodeKeys.clear();
    invalidateSelector(treeState);
    cache.clear();
    markRecoilValueModified(store, recoilValue);
  }

  if (set != null) {
    /**
     * ES5 strict mode prohibits defining non-top-level function declarations,
     * so don't use function declaration syntax here
     */
    const selectorSet = (
      store: Store,
      state: TreeState,
      newValue: T | DefaultValue,
    ): AtomWrites => {
      let syncSelectorSetFinished = false;
      const writes: AtomWrites = new Map();

      function getRecoilValue<S>({key: depKey}: RecoilValue<S>): S {
        if (syncSelectorSetFinished) {
          throw err('Recoil: Async selector sets are not currently supported.');
        }

        const loadable = getNodeLoadable<S>(store, state, depKey);

        if (loadable.state === 'hasValue') {
          return loadable.contents;
        } else if (loadable.state === 'loading') {
          const msg = `Getting value of asynchronous atom or selector "${depKey}" in a pending state while setting selector "${key}" is not yet supported.`;
          recoverableViolation(msg, 'recoil');
          throw err(msg);
        } else {
          throw loadable.contents;
        }
      }

      function setRecoilState<S>(
        recoilState: RecoilState<S>,
        valueOrUpdater: ValueOrUpdater<S>,
        // $FlowFixMe[missing-local-annot]
      ) {
        if (syncSelectorSetFinished) {
          const msg =
            'Recoil: Async selector sets are not currently supported.';
          recoverableViolation(msg, 'recoil');
          throw err(msg);
        }

        const setValue =
          typeof valueOrUpdater === 'function'
            ? // cast to any because we can't restrict type S from being a function itself without losing support for opaque types
              // flowlint-next-line unclear-type:off
              (valueOrUpdater: any)(getRecoilValue(recoilState))
            : valueOrUpdater;

        const upstreamWrites = setNodeValue(
          store,
          state,
          recoilState.key,
          setValue,
        );

        upstreamWrites.forEach((v, k) => writes.set(k, v));
      }

      function resetRecoilState<S>(recoilState: RecoilState<S>) {
        setRecoilState(recoilState, DEFAULT_VALUE);
      }

      const ret = set(
        {set: setRecoilState, get: getRecoilValue, reset: resetRecoilState},
        newValue,
      );

      // set should be a void method, but if the user makes it `async`, then it
      // will return a Promise, which we don't currently support.
      if (ret !== undefined) {
        throw isPromise(ret)
          ? err('Recoil: Async selector sets are not currently supported.')
          : err('Recoil: selector set should be a void function.');
      }
      syncSelectorSetFinished = true;

      return writes;
    };

    return (recoilValue = registerNode<T>({
      key,
      nodeType: 'selector',
      peek: selectorPeek,
      get: selectorGet,
      set: selectorSet,
      init: selectorInit,
      invalidate: invalidateSelector,
      clearCache: clearSelectorCache,
      shouldDeleteConfigOnRelease: selectorShouldDeleteConfigOnRelease,
      dangerouslyAllowMutability: options.dangerouslyAllowMutability,
      shouldRestoreFromSnapshots: false,
      retainedBy,
    }));
  } else {
    return (recoilValue = registerNode<T>({
      key,
      nodeType: 'selector',
      peek: selectorPeek,
      get: selectorGet,
      init: selectorInit,
      invalidate: invalidateSelector,
      clearCache: clearSelectorCache,
      shouldDeleteConfigOnRelease: selectorShouldDeleteConfigOnRelease,
      dangerouslyAllowMutability: options.dangerouslyAllowMutability,
      shouldRestoreFromSnapshots: false,
      retainedBy,
    }));
  }
}

/* eslint-enable no-redeclare */

// $FlowIssue[incompatible-use]
// $FlowFixMe[missing-local-annot]
selector.value = value => new WrappedValue(value);

module.exports = (selector: {
  <T>(ReadOnlySelectorOptions<T>): RecoilValueReadOnly<T>,
  <T>(ReadWriteSelectorOptions<T>): RecoilState<T>,
  value: <S>(S) => WrappedValue<S>,
});
