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
import type {WrappedValue} from '../adt/Recoil_Wrapper';
import type {CachePolicyWithoutEviction} from '../caches/Recoil_CachePolicy';
import type {RecoilState, RecoilValue} from '../core/Recoil_RecoilValue';
import type {RetainedBy} from '../core/Recoil_RetainedBy';
import type {AtomEffect, AtomOptionsWithoutDefault} from './Recoil_atom';
// @fb-only: import type {ScopeRules} from 'Recoil_ScopedAtom';

const cacheFromPolicy = require('../caches/Recoil_cacheFromPolicy');
const {setConfigDeletionHandler} = require('../core/Recoil_Node');
const atom = require('./Recoil_atom');
const stableStringify = require('recoil-shared/util/Recoil_stableStringify');

type Primitive = void | null | boolean | number | string;
interface HasToJSON {
  toJSON(): Parameter;
}
export type Parameter =
  | Primitive
  | HasToJSON
  | $ReadOnlyArray<Parameter>
  | $ReadOnly<{[string]: Parameter}>
  | $ReadOnlySet<Parameter>
  | $ReadOnlyMap<Parameter, Parameter>;

// flowlint unclear-type:off
export type ParameterizedScopeRules<P> = $ReadOnlyArray<
  | RecoilValue<$ReadOnlyArray<any>>
  | $ReadOnlyArray<RecoilValue<any> | (P => RecoilValue<any>)>,
>;
// flowlint unclear-type:error

export type AtomFamilyOptionsWithoutDefault<T, P: Parameter> = $ReadOnly<{
  ...AtomOptionsWithoutDefault<T>,
  effects?:
    | $ReadOnlyArray<AtomEffect<T>>
    | (P => $ReadOnlyArray<AtomEffect<T>>),
  //   effects_UNSTABLE?:
  // | $ReadOnlyArray<AtomEffect<T>>
  // | (P => $ReadOnlyArray<AtomEffect<T>>),
  retainedBy_UNSTABLE?: RetainedBy | (P => RetainedBy),
  cachePolicyForParams_UNSTABLE?: CachePolicyWithoutEviction,

  // @fb-only: scopeRules_APPEND_ONLY_READ_THE_DOCS?: ParameterizedScopeRules<P>,
}>;

export type AtomFamilyOptions<T, P: Parameter> =
  | $ReadOnly<{
      ...AtomFamilyOptionsWithoutDefault<T, P>,
      default:
        | RecoilValue<T>
        | Promise<T>
        | Loadable<T>
        | WrappedValue<T>
        | T
        | (P =>
            | T
            | RecoilValue<T>
            | Promise<T>
            | Loadable<T>
            | WrappedValue<T>),
    }>
  | AtomFamilyOptionsWithoutDefault<T, P>;

// Process scopeRules to handle any entries which are functions taking parameters
// prettier-ignore
// @fb-only: function mapScopeRules<P>(
// @fb-only: scopeRules?: ParameterizedScopeRules<P>,
// @fb-only: param: P,
// @fb-only: ): ScopeRules | void {
// @fb-only: return scopeRules?.map(rule =>
// @fb-only: Array.isArray(rule)
// @fb-only: ? rule.map(entry => (typeof entry === 'function' ? entry(param) : entry))
// @fb-only: : rule,
// @fb-only: );
// @fb-only: }

/*
A function which returns an atom based on the input parameter.

Each unique parameter returns a unique atom. E.g.,

  const f = atomFamily(...);
  f({a: 1}) => an atom
  f({a: 2}) => a different atom

This allows components to persist local, private state using atoms.  Each
instance of the component may have a different key, which it uses as the
parameter for a family of atoms; in this way, each component will have
its own atom not shared by other instances.  These state keys may be composed
into children's state keys as well.
*/
function atomFamily<T, P: Parameter>(
  options: AtomFamilyOptions<T, P>,
): P => RecoilState<T> {
  const atomCache = cacheFromPolicy<P, RecoilState<T>>({
    equality: options.cachePolicyForParams_UNSTABLE?.equality ?? 'value',
    eviction: 'keep-all',
  });

  // Simple atomFamily implementation to cache individual atoms based
  // on the parameter value equality.
  return (params: P) => {
    const cachedAtom = atomCache.get(params);
    if (cachedAtom != null) {
      return cachedAtom;
    }

    const {cachePolicyForParams_UNSTABLE, ...atomOptions} = options;
    const optionsDefault:
      | RecoilValue<T>
      | Promise<T>
      | Loadable<T>
      | WrappedValue<T>
      | T
      | (P => T | RecoilValue<T> | Promise<T> | Loadable<T> | WrappedValue<T>) =
      'default' in options
        ? // $FlowIssue[incompatible-type] No way to refine in Flow that property is not defined
          options.default
        : new Promise(() => {});

    const newAtom = atom<T>({
      ...atomOptions,
      key: `${options.key}__${stableStringify(params) ?? 'void'}`,
      default:
        typeof optionsDefault === 'function'
          ? // The default was parameterized
            // Flow doesn't know that T isn't a function, so we need to case to any
            // $FlowIssue[incompatible-use]
            optionsDefault(params)
          : // Default may be a static value, promise, or RecoilValue
            optionsDefault,

      retainedBy_UNSTABLE:
        typeof options.retainedBy_UNSTABLE === 'function'
          ? options.retainedBy_UNSTABLE(params)
          : options.retainedBy_UNSTABLE,

      effects:
        typeof options.effects === 'function'
          ? options.effects(params)
          : typeof options.effects_UNSTABLE === 'function'
          ? options.effects_UNSTABLE(params)
          : options.effects ?? options.effects_UNSTABLE,

      // prettier-ignore
      // @fb-only: scopeRules_APPEND_ONLY_READ_THE_DOCS: mapScopeRules(
      // @fb-only: options.scopeRules_APPEND_ONLY_READ_THE_DOCS,
      // @fb-only: params,
      // @fb-only: ),
    });

    atomCache.set(params, newAtom);

    setConfigDeletionHandler(newAtom.key, () => {
      atomCache.delete(params);
    });

    return newAtom;
  };
}

module.exports = atomFamily;
