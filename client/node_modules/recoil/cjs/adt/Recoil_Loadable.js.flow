/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * A type that represents a value that may or may not be loaded. It differs from
 * LoadObject in that the `loading` state has a Promise that is meant to resolve
 * when the value is available (but as with LoadObject, an individual Loadable
 * is a value type and is not mutated when the status of a request changes).
 *
 * @flow strict
 * @format
 * @oncall recoil
 */
'use strict';

const err = require('recoil-shared/util/Recoil_err');
const isPromise = require('recoil-shared/util/Recoil_isPromise');
const nullthrows = require('recoil-shared/util/Recoil_nullthrows');

class BaseLoadable<T> {
  getValue(): T {
    throw err('BaseLoadable');
  }
  toPromise(): Promise<T> {
    throw err('BaseLoadable');
  }

  valueMaybe(): T | void {
    throw err('BaseLoadable');
  }
  valueOrThrow(): T {
    // $FlowFixMe[prop-missing]
    throw err(`Loadable expected value, but in "${this.state}" state`);
  }
  promiseMaybe(): Promise<T> | void {
    throw err('BaseLoadable');
  }
  promiseOrThrow(): Promise<T> {
    // $FlowFixMe[prop-missing]
    throw err(`Loadable expected promise, but in "${this.state}" state`);
  }
  errorMaybe(): mixed | void {
    throw err('BaseLoadable');
  }
  errorOrThrow(): mixed {
    // $FlowFixMe[prop-missing]
    throw err(`Loadable expected error, but in "${this.state}" state`);
  }

  is(other: Loadable<mixed>): boolean {
    // $FlowFixMe[prop-missing]
    return other.state === this.state && other.contents === this.contents;
  }

  map<S>(_map: T => Promise<S> | Loadable<S> | S): Loadable<S> {
    throw err('BaseLoadable');
  }
}

class ValueLoadable<T> extends BaseLoadable<T> {
  state: 'hasValue' = 'hasValue';
  contents: T;

  constructor(value: T) {
    super();
    this.contents = value;
  }
  getValue(): T {
    return this.contents;
  }
  toPromise(): Promise<T> {
    return Promise.resolve(this.contents);
  }
  valueMaybe(): T {
    return this.contents;
  }
  valueOrThrow(): T {
    return this.contents;
  }
  promiseMaybe(): void {
    return undefined;
  }
  errorMaybe(): void {
    return undefined;
  }
  map<S>(map: T => Promise<S> | Loadable<S> | S): Loadable<S> {
    try {
      const next = map(this.contents);
      return isPromise(next)
        ? loadableWithPromise(next)
        : isLoadable(next)
        ? next
        : loadableWithValue(next);
    } catch (e) {
      return isPromise(e)
        ? // If we "suspended", then try again.
          // errors and subsequent retries will be handled in 'loading' case
          // $FlowFixMe[prop-missing]
          loadableWithPromise(e.next(() => this.map(map)))
        : loadableWithError(e);
    }
  }
}

class ErrorLoadable<T> extends BaseLoadable<T> {
  state: 'hasError' = 'hasError';
  contents: mixed;

  constructor(error: mixed) {
    super();
    this.contents = error;
  }
  getValue(): T {
    throw this.contents;
  }
  toPromise(): Promise<T> {
    return Promise.reject(this.contents);
  }
  valueMaybe(): void {
    return undefined;
  }
  promiseMaybe(): void {
    return undefined;
  }
  errorMaybe(): mixed {
    return this.contents;
  }
  errorOrThrow(): mixed {
    return this.contents;
  }
  map<S>(_map: T => Promise<S> | Loadable<S> | S): $ReadOnly<ErrorLoadable<S>> {
    // $FlowIssue[incompatible-return]
    return this;
  }
}

class LoadingLoadable<T> extends BaseLoadable<T> {
  state: 'loading' = 'loading';
  contents: Promise<T>;

  constructor(promise: Promise<T>) {
    super();
    this.contents = promise;
  }
  getValue(): T {
    throw this.contents;
  }
  toPromise(): Promise<T> {
    return this.contents;
  }
  valueMaybe(): void {
    return undefined;
  }
  promiseMaybe(): Promise<T> {
    return this.contents;
  }
  promiseOrThrow(): Promise<T> {
    return this.contents;
  }
  errorMaybe(): void {
    return undefined;
  }
  map<S>(
    map: T => Promise<S> | Loadable<S> | S,
  ): $ReadOnly<LoadingLoadable<S>> {
    return loadableWithPromise(
      this.contents
        .then(value => {
          const next = map(value);
          if (isLoadable(next)) {
            const nextLoadable: Loadable<S> = next;
            switch (nextLoadable.state) {
              case 'hasValue':
                return nextLoadable.contents;
              case 'hasError':
                throw nextLoadable.contents;
              case 'loading':
                return nextLoadable.contents;
            }
          }
          // $FlowIssue[incompatible-return]
          return next;
        })
        // $FlowFixMe[incompatible-call]
        .catch(e => {
          if (isPromise(e)) {
            // we were "suspended," try again
            return e.then(() => this.map(map).contents);
          }
          throw e;
        }),
    );
  }
}

export type Loadable<+T> =
  | $ReadOnly<ValueLoadable<T>>
  | $ReadOnly<ErrorLoadable<T>>
  | $ReadOnly<LoadingLoadable<T>>;

export type ValueLoadableType<+T> = $ReadOnly<ValueLoadable<T>>;
export type ErrorLoadableType<+T> = $ReadOnly<ErrorLoadable<T>>;
export type LoadingLoadableType<+T> = $ReadOnly<LoadingLoadable<T>>;

function loadableWithValue<+T>(value: T): $ReadOnly<ValueLoadable<T>> {
  return Object.freeze(new ValueLoadable(value));
}

function loadableWithError<+T>(error: mixed): $ReadOnly<ErrorLoadable<T>> {
  return Object.freeze(new ErrorLoadable(error));
}

function loadableWithPromise<+T>(
  promise: Promise<T>,
): $ReadOnly<LoadingLoadable<T>> {
  return Object.freeze(new LoadingLoadable(promise));
}

function loadableLoading<+T>(): $ReadOnly<LoadingLoadable<T>> {
  return Object.freeze(new LoadingLoadable(new Promise(() => {})));
}

type UnwrapLoadables<Loadables> = $TupleMap<Loadables, <T>(Loadable<T>) => T>;
type LoadableAllOfTuple = <
  Tuple: $ReadOnlyArray<Loadable<mixed> | Promise<mixed> | mixed>,
>(
  tuple: Tuple,
) => Loadable<$TupleMap<Tuple, <V>(Loadable<V> | Promise<V> | V) => V>>;
type LoadableAllOfObj = <
  Obj: $ReadOnly<{[string]: Loadable<mixed> | Promise<mixed> | mixed, ...}>,
>(
  obj: Obj,
) => Loadable<$ObjMap<Obj, <V>(Loadable<V> | Promise<V> | V) => V>>;
type LoadableAll = LoadableAllOfTuple & LoadableAllOfObj;

function loadableAllArray<Inputs: $ReadOnlyArray<Loadable<mixed>>>(
  inputs: Inputs,
): Loadable<UnwrapLoadables<Inputs>> {
  return inputs.every(i => i.state === 'hasValue')
    ? loadableWithValue(inputs.map(i => i.contents))
    : inputs.some(i => i.state === 'hasError')
    ? loadableWithError(
        nullthrows(
          inputs.find(i => i.state === 'hasError'),
          'Invalid loadable passed to loadableAll',
        ).contents,
      )
    : loadableWithPromise(Promise.all(inputs.map(i => i.contents)));
}

function loadableAll<
  Inputs:
    | $ReadOnlyArray<Loadable<mixed> | Promise<mixed> | mixed>
    | $ReadOnly<{[string]: Loadable<mixed> | Promise<mixed> | mixed, ...}>,
>(
  inputs: Inputs,
): Loadable<$ReadOnlyArray<mixed> | $ReadOnly<{[string]: mixed, ...}>> {
  const unwrapedInputs = Array.isArray(inputs)
    ? inputs
    : Object.getOwnPropertyNames(inputs).map(key => inputs[key]);
  const normalizedInputs = unwrapedInputs.map(x =>
    isLoadable(x)
      ? x
      : isPromise(x)
      ? loadableWithPromise(x)
      : loadableWithValue(x),
  );
  const output = loadableAllArray(normalizedInputs);
  return Array.isArray(inputs)
    ? // $FlowIssue[incompatible-return]
      output
    : // Object.getOwnPropertyNames() has consistent key ordering with ES6
      // $FlowIssue[incompatible-call]
      output.map(outputs =>
        Object.getOwnPropertyNames(inputs).reduce(
          // $FlowFixMe[invalid-computed-prop]
          (out, key, idx) => ({...out, [key]: outputs[idx]}),
          {},
        ),
      );
}

function isLoadable(x: mixed): boolean %checks {
  return x instanceof BaseLoadable;
}

const LoadableStaticInterface = {
  of: <T>(value: Promise<T> | Loadable<T> | T): Loadable<T> =>
    isPromise(value)
      ? loadableWithPromise(value)
      : isLoadable(value)
      ? value
      : loadableWithValue(value),
  error: <T>(error: mixed): $ReadOnly<ErrorLoadable<T>> =>
    loadableWithError(error),
  // $FlowIssue[incompatible-return]
  loading: <T>(): LoadingLoadable<T> => loadableLoading<T>(),
  // $FlowIssue[unclear-type]
  all: ((loadableAll: any): LoadableAll),
  isLoadable,
};

module.exports = {
  loadableWithValue,
  loadableWithError,
  loadableWithPromise,
  loadableLoading,
  loadableAll,
  isLoadable,
  RecoilLoadable: LoadableStaticInterface,
};
