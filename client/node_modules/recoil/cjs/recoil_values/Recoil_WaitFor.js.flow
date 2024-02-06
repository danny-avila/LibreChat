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

import type {Loadable} from '../adt/Recoil_Loadable';
import type {
  RecoilValue,
  RecoilValueReadOnly,
} from '../core/Recoil_RecoilValue';
import type {GetRecoilValue} from './Recoil_callbackTypes';

const {
  loadableWithError,
  loadableWithPromise,
  loadableWithValue,
} = require('../adt/Recoil_Loadable');
const selector = require('./Recoil_selector');
const selectorFamily = require('./Recoil_selectorFamily');
const isPromise = require('recoil-shared/util/Recoil_isPromise');

/////////////////
//  TRUTH TABLE
/////////////////
// Dependencies        waitForNone         waitForAny        waitForAll       waitForAllSettled
//  [loading, loading]  [Promise, Promise]  Promise           Promise         Promise
//  [value, loading]    [value, Promise]    [value, Promise]  Promise         Promise
//  [value, value]      [value, value]      [value, value]    [value, value]  [value, value]
//
//  [error, loading]    [Error, Promise]    [Error, Promise]  Error           Promise
//  [error, error]      [Error, Error]      [Error, Error]    Error           [error, error]
//  [value, error]      [value, Error]      [value, Error]    Error           [value, error]

// Issue parallel requests for all dependencies and return the current
// status if they have results, have some error, or are still pending.
function concurrentRequests(
  getRecoilValue: GetRecoilValue,
  deps: $ReadOnlyArray<RecoilValue<mixed>>,
) {
  const results = Array(deps.length).fill(undefined);
  const exceptions = Array(deps.length).fill(undefined);
  for (const [i, dep] of deps.entries()) {
    try {
      results[i] = getRecoilValue(dep);
    } catch (e) {
      // exceptions can either be Promises of pending results or real errors
      exceptions[i] = e;
    }
  }
  return [results, exceptions];
}

function isError(exp: $FlowFixMe) {
  return exp != null && !isPromise(exp);
}

function unwrapDependencies(
  dependencies:
    | $ReadOnlyArray<RecoilValueReadOnly<mixed>>
    | {+[string]: RecoilValueReadOnly<mixed>},
): $ReadOnlyArray<RecoilValue<mixed>> {
  return Array.isArray(dependencies)
    ? dependencies
    : Object.getOwnPropertyNames(dependencies).map(key => dependencies[key]);
}

function wrapResults(
  dependencies:
    | $ReadOnlyArray<RecoilValueReadOnly<mixed>>
    | {+[string]: RecoilValueReadOnly<mixed>},
  /* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
   * LTI update could not be added via codemod */
  results,
) {
  return Array.isArray(dependencies)
    ? results
    : // Object.getOwnPropertyNames() has consistent key ordering with ES6
      Object.getOwnPropertyNames(dependencies).reduce(
        (out, key, idx) => ({...out, [(key: string)]: results[idx]}),
        {},
      );
}

function wrapLoadables(
  dependencies:
    | $ReadOnlyArray<RecoilValueReadOnly<mixed>>
    | {+[string]: RecoilValueReadOnly<mixed>},
  results: Array<$FlowFixMe>,
  exceptions: Array<$FlowFixMe>,
) {
  const output = exceptions.map((exception, idx) =>
    exception == null
      ? loadableWithValue(results[idx])
      : isPromise(exception)
      ? loadableWithPromise(exception)
      : loadableWithError<mixed>(exception),
  );
  return wrapResults(dependencies, output);
}

function combineAsyncResultsWithSyncResults<T>(
  syncResults: Array<T>,
  asyncResults: Array<T>,
): Array<T> {
  return asyncResults.map((result, idx) =>
    /**
     * it's important we use === undefined as opposed to == null, because the
     * resolved value of the async promise could be `null`, in which case we
     * don't want to use syncResults[idx], which would be undefined. If async
     * promise resolves to `undefined`, that's ok because `syncResults[idx]`
     * will also be `undefined`. That's a little hacky, but it works.
     */
    result === undefined ? syncResults[idx] : result,
  );
}

// Selector that requests all dependencies in parallel and immediately returns
// current results without waiting.
const waitForNone: <
  RecoilValues:
    | $ReadOnlyArray<RecoilValueReadOnly<mixed>>
    | $ReadOnly<{[string]: RecoilValueReadOnly<mixed>, ...}>,
>(
  RecoilValues,
) => RecoilValueReadOnly<
  $ReadOnlyArray<Loadable<mixed>> | $ReadOnly<{[string]: Loadable<mixed>, ...}>,
> = selectorFamily({
  key: '__waitForNone',
  get:
    (
      dependencies:
        | $ReadOnly<{[string]: RecoilValueReadOnly<mixed>}>
        | $ReadOnlyArray<RecoilValueReadOnly<mixed>>,
    ) =>
    ({get}) => {
      // Issue requests for all dependencies in parallel.
      const deps = unwrapDependencies(dependencies);
      const [results, exceptions] = concurrentRequests(get, deps);
      // Always return the current status of the results; never block.
      return wrapLoadables(dependencies, results, exceptions);
    },
  dangerouslyAllowMutability: true,
});

// Selector that requests all dependencies in parallel and waits for at least
// one to be available before returning results.  It will only error if all
// dependencies have errors.
const waitForAny: <
  RecoilValues:
    | $ReadOnlyArray<RecoilValueReadOnly<mixed>>
    | $ReadOnly<{[string]: RecoilValueReadOnly<mixed>, ...}>,
>(
  RecoilValues,
) => RecoilValueReadOnly<
  $ReadOnlyArray<mixed> | $ReadOnly<{[string]: mixed, ...}>,
> = selectorFamily({
  key: '__waitForAny',
  get:
    (
      dependencies:
        | $ReadOnly<{[string]: RecoilValueReadOnly<mixed>}>
        | $ReadOnlyArray<RecoilValueReadOnly<mixed>>,
    ) =>
    ({get}) => {
      // Issue requests for all dependencies in parallel.
      // Exceptions can either be Promises of pending results or real errors
      const deps = unwrapDependencies(dependencies);
      const [results, exceptions] = concurrentRequests(get, deps);

      // If any results are available, value or error, return the current status
      if (exceptions.some(exp => !isPromise(exp))) {
        return wrapLoadables(dependencies, results, exceptions);
      }

      // Otherwise, return a promise that will resolve when the next result is
      // available, whichever one happens to be next.  But, if all pending
      // dependencies end up with errors, then reject the promise.
      return new Promise(resolve => {
        for (const [i, exp] of exceptions.entries()) {
          if (isPromise(exp)) {
            exp
              .then(result => {
                results[i] = result;
                exceptions[i] = undefined;
                resolve(wrapLoadables(dependencies, results, exceptions));
              })
              .catch(error => {
                exceptions[i] = error;
                resolve(wrapLoadables(dependencies, results, exceptions));
              });
          }
        }
      });
    },
  dangerouslyAllowMutability: true,
});

// Selector that requests all dependencies in parallel and waits for all to be
// available before returning a value.  It will error if any dependencies error.
const waitForAll: <
  RecoilValues:
    | $ReadOnlyArray<RecoilValueReadOnly<mixed>>
    | $ReadOnly<{[string]: RecoilValueReadOnly<mixed>, ...}>,
>(
  RecoilValues,
) => RecoilValueReadOnly<
  $ReadOnlyArray<mixed> | $ReadOnly<{[string]: mixed, ...}>,
> = selectorFamily({
  key: '__waitForAll',
  get:
    (
      dependencies:
        | $ReadOnly<{[string]: RecoilValueReadOnly<mixed>}>
        | $ReadOnlyArray<RecoilValueReadOnly<mixed>>,
    ) =>
    ({get}) => {
      // Issue requests for all dependencies in parallel.
      // Exceptions can either be Promises of pending results or real errors
      const deps = unwrapDependencies(dependencies);
      const [results, exceptions] = concurrentRequests(get, deps);

      // If all results are available, return the results
      if (exceptions.every(exp => exp == null)) {
        return wrapResults(dependencies, results);
      }

      // If we have any errors, throw the first error
      const error = exceptions.find(isError);
      if (error != null) {
        throw error;
      }

      // Otherwise, return a promise that will resolve when all results are available
      return Promise.all(exceptions).then(exceptionResults =>
        wrapResults(
          dependencies,
          combineAsyncResultsWithSyncResults(results, exceptionResults),
        ),
      );
    },
  dangerouslyAllowMutability: true,
});

const waitForAllSettled: <
  RecoilValues:
    | $ReadOnlyArray<RecoilValueReadOnly<mixed>>
    | $ReadOnly<{[string]: RecoilValueReadOnly<mixed>, ...}>,
>(
  RecoilValues,
) => RecoilValueReadOnly<
  $ReadOnlyArray<mixed> | $ReadOnly<{[string]: mixed, ...}>,
> = selectorFamily({
  key: '__waitForAllSettled',
  get:
    (
      dependencies:
        | $ReadOnly<{[string]: RecoilValueReadOnly<mixed>}>
        | $ReadOnlyArray<RecoilValueReadOnly<mixed>>,
    ) =>
    ({get}) => {
      // Issue requests for all dependencies in parallel.
      // Exceptions can either be Promises of pending results or real errors
      const deps = unwrapDependencies(dependencies);
      const [results, exceptions] = concurrentRequests(get, deps);

      // If all results are available, return the results
      if (exceptions.every(exp => !isPromise(exp))) {
        return wrapLoadables(dependencies, results, exceptions);
      }

      // Wait for all results to settle
      return (
        Promise.all(
          exceptions.map((exp, i) =>
            isPromise(exp)
              ? exp
                  .then(result => {
                    results[i] = result;
                    exceptions[i] = undefined;
                  })
                  .catch(error => {
                    results[i] = undefined;
                    exceptions[i] = error;
                  })
              : null,
          ),
        )
          // Then wrap them as loadables
          .then(() => wrapLoadables(dependencies, results, exceptions))
      );
    },
  dangerouslyAllowMutability: true,
});

const noWait: (RecoilValue<mixed>) => RecoilValueReadOnly<Loadable<mixed>> =
  selectorFamily({
    key: '__noWait',
    get:
      dependency =>
      ({get}) => {
        try {
          return selector.value(loadableWithValue(get(dependency)));
        } catch (exception) {
          return selector.value(
            isPromise(exception)
              ? loadableWithPromise(exception)
              : loadableWithError(exception),
          );
        }
      },
    dangerouslyAllowMutability: true,
  });

module.exports = {
  waitForNone,
  waitForAny,
  waitForAll,
  waitForAllSettled,
  noWait,
};
