// Minimum TypeScript Version: 3.9

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @oncall recoil
 */

/**
 * This file is a manual translation of the flow types, which are the source of truth, so we should not introduce new terminology or behavior in this file.
 */

 export { };

 import * as React from 'react';

 // state.d.ts
 type NodeKey = string;

 // node.d.ts
 export class DefaultValue {
  private __tag: 'DefaultValue';
 }

 // recoilRoot.d.ts
 export type RecoilRootProps = {
  initializeState?: (mutableSnapshot: MutableSnapshot) => void,
  override?: true,
  children: React.ReactNode,
 } | {
  override: false,
  children: React.ReactNode,
 };

// recoilEnv.d.ts
export interface RecoilEnv {
  RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED: boolean;
  RECOIL_GKS_ENABLED: Set<string>;
}

export const RecoilEnv: RecoilEnv;

 /**
  * Root component for managing Recoil state.  Most Recoil hooks should be
  * called from a component nested in a <RecoilRoot>
  */
 export const RecoilRoot: React.FC<RecoilRootProps>;

 // Snapshot.d.ts
 declare const SnapshotID_OPAQUE: unique symbol;
 export interface SnapshotID {
  readonly [SnapshotID_OPAQUE]: true;
 }

 interface ComponentInfo {
  name: string;
 }

 interface RecoilStateInfo<T> {
  loadable?: Loadable<T>;
  isActive: boolean;
  isSet: boolean;
  isModified: boolean; // TODO report modified selectors
  type: 'atom' | 'selector';
  deps: Iterable<RecoilValue<T>>;
  subscribers: {
    nodes: Iterable<RecoilValue<T>>,
    components: Iterable<ComponentInfo>,
  };
 }

 export class Snapshot {
  getID(): SnapshotID;
  getLoadable<T>(recoilValue: RecoilValue<T>): Loadable<T>;
  getPromise<T>(recoilValue: RecoilValue<T>): Promise<T>;
  getNodes_UNSTABLE(opts?: { isModified?: boolean, isInitialized?: boolean }): Iterable<RecoilValue<unknown>>;
  getInfo_UNSTABLE<T>(recoilValue: RecoilValue<T>): RecoilStateInfo<T>;
  map(cb: (mutableSnapshot: MutableSnapshot) => void): Snapshot;
  asyncMap(cb: (mutableSnapshot: MutableSnapshot) => Promise<void>): Promise<Snapshot>;
  retain(): () => void;
  isRetained(): boolean;
 }

 export class MutableSnapshot extends Snapshot {
  set: SetRecoilState;
  reset: ResetRecoilState;
 }

 declare const WrappedValue_OPAQUE: unique symbol;
 export interface WrappedValue<T> {
   readonly [WrappedValue_OPAQUE]: true;
 }

 // Effect is called the first time a node is used with a <RecoilRoot>
 export type AtomEffect<T> = (param: {
  node: RecoilState<T>,
  storeID: StoreID,
  parentStoreID_UNSTABLE?: StoreID,
  trigger: 'set' | 'get',

  // Call synchronously to initialize value or async to change it later
  setSelf: (param:
    | T
    | DefaultValue
    | Promise<T | DefaultValue>
    | WrappedValue<T>
    | ((param: T | DefaultValue) => T | DefaultValue | WrappedValue<T>),
  ) => void,
  resetSelf: () => void,

  // Subscribe callbacks to events.
  // Atom effect observers are called before global transaction observers
  onSet: (
    param: (newValue: T, oldValue: T | DefaultValue, isReset: boolean) => void,
  ) => void,

  // Accessors to read other atoms/selectors
  getPromise: <S>(recoilValue: RecoilValue<S>) => Promise<S>,
  getLoadable: <S>(recoilValue: RecoilValue<S>) => Loadable<S>,
  getInfo_UNSTABLE: <S>(recoilValue: RecoilValue<S>) => RecoilStateInfo<S>,
 }) => void | (() => void);

 // atom.d.ts
 interface AtomOptionsWithoutDefault<T> {
   key: NodeKey;
   effects?: ReadonlyArray<AtomEffect<T>>;
   effects_UNSTABLE?: ReadonlyArray<AtomEffect<T>>;
   dangerouslyAllowMutability?: boolean;
 }
 interface AtomOptionsWithDefault<T> extends AtomOptionsWithoutDefault<T> {
   default: RecoilValue<T> | Promise<T> | Loadable<T> | WrappedValue<T> | T;
 }
 export type AtomOptions<T> = AtomOptionsWithoutDefault<T> | AtomOptionsWithDefault<T>;

 /**
  * Creates an atom, which represents a piece of writeable state
  */
 export function atom<T>(options: AtomOptions<T>): RecoilState<T>;
 export namespace atom {
  function value<T>(value: T): WrappedValue<T>;
 }

 export type GetRecoilValue = <T>(recoilVal: RecoilValue<T>) => T;
 export type SetterOrUpdater<T> = (valOrUpdater: ((currVal: T) => T) | T) => void;
 export type Resetter = () => void;
 export interface TransactionInterface_UNSTABLE {
  get<T>(a: RecoilValue<T>): T;
  set<T>(s: RecoilState<T>, u: ((currVal: T) => T) | T): void;
  reset(s: RecoilState<any>): void;
 }
 export interface CallbackInterface {
  set: <T>(recoilVal: RecoilState<T>, valOrUpdater: ((currVal: T) => T) | T) => void;
  reset: (recoilVal: RecoilState<any>) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  refresh: (recoilValue: RecoilValue<any>) => void;
  snapshot: Snapshot;
  gotoSnapshot: (snapshot: Snapshot) => void;
  transact_UNSTABLE: (cb: (i: TransactionInterface_UNSTABLE) => void) => void;
 }

 // selector.d.ts
 export interface SelectorCallbackInterface extends CallbackInterface {
   node: RecoilState<unknown>; // TODO This isn't properly typed
 }
 export type GetCallback = <Args extends ReadonlyArray<unknown>, Return>(
  fn: (interface: SelectorCallbackInterface) => (...args: Args) => Return,
 ) => (...args: Args) => Return;

 export type SetRecoilState = <T>(
    recoilVal: RecoilState<T>,
    newVal: T | DefaultValue | ((prevValue: T) => T | DefaultValue),
 ) => void;

 export type ResetRecoilState = (recoilVal: RecoilState<any>) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

 // export type EqualityPolicy = 'reference' | 'value'; TODO: removing while we discuss long term API

 export type EvictionPolicy = 'lru' | 'keep-all' | 'most-recent';

 // TODO: removing while we discuss long term API
 // export type CachePolicy =
 //   | {eviction: 'lru', maxSize: number, equality?: EqualityPolicy}
 //   | {eviction: 'none', equality?: EqualityPolicy}
 //   | {eviction?: undefined, equality: EqualityPolicy};

 // TODO: removing while we discuss long term API
 // export interface CachePolicyWithoutEviction {
 //   equality: EqualityPolicy;
 // }

 export type CachePolicyWithoutEquality = {eviction: 'lru', maxSize: number} | {eviction: 'keep-all'} | {eviction: 'most-recent'};

 export interface ReadOnlySelectorOptions<T> {
    key: string;
    get: (opts: {
      get: GetRecoilValue,
      getCallback: GetCallback,
    }) => Promise<T> | RecoilValue<T> | Loadable<T> | WrappedValue<T> | T;
    dangerouslyAllowMutability?: boolean;
    cachePolicy_UNSTABLE?: CachePolicyWithoutEquality; // TODO: using the more restrictive CachePolicyWithoutEquality while we discuss long term API
 }

 export interface ReadWriteSelectorOptions<T> extends ReadOnlySelectorOptions<T> {
  set: (
    opts: {
      set: SetRecoilState;
      get: GetRecoilValue;
      reset: ResetRecoilState;
    },
    newValue: T | DefaultValue,
  ) => void;
 }

 /**
  * Creates a selector which represents derived state.
  */
 export function selector<T>(options: ReadWriteSelectorOptions<T>): RecoilState<T>;
 export function selector<T>(options: ReadOnlySelectorOptions<T>): RecoilValueReadOnly<T>;
 export namespace selector {
  function value<T>(value: T): WrappedValue<T>;
 }

 // hooks.d.ts

 /**
  * Returns the value of an atom or selector (readonly or writeable) and
  * subscribes the components to future updates of that state.
  */
 export function useRecoilValue<T>(recoilValue: RecoilValue<T>): T;

 /**
  * Returns a Loadable representing the status of the given Recoil state
  * and subscribes the component to future updates of that state. Useful
  * for working with async selectors.
  */
 export function useRecoilValueLoadable<T>(recoilValue: RecoilValue<T>): Loadable<T>;

 /**
  * Returns a tuple where the first element is the value of the recoil state
  * and the second is a setter to update that state. Subscribes component
  * to updates of the given state.
  */
 export function useRecoilState<T>(recoilState: RecoilState<T>): [T, SetterOrUpdater<T>];

 /**
  * Returns a tuple where the first element is a Loadable and the second
  * element is a setter function to update the given state. Subscribes
  * component to updates of the given state.
  */
 export function useRecoilStateLoadable<T>(recoilState: RecoilState<T>): [Loadable<T>, SetterOrUpdater<T>];

 /**
  * Returns a setter function for updating Recoil state. Does not subscribe
  * the component to the given state.
  */

 export function useSetRecoilState<T>(recoilState: RecoilState<T>): SetterOrUpdater<T>;

 /**
  * Returns a function that will reset the given state to its default value.
  */
 export function useResetRecoilState(recoilState: RecoilState<any>): Resetter; // eslint-disable-line @typescript-eslint/no-explicit-any

 /**
  * Returns current info about an atom
  */
 export function useGetRecoilValueInfo_UNSTABLE(): <T>(recoilValue: RecoilValue<T>) => RecoilStateInfo<T>;

/**
 * Experimental version of hooks for useTransition() support
 */
 export function useRecoilValue_TRANSITION_SUPPORT_UNSTABLE<T>(recoilValue: RecoilValue<T>): T;
 export function useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE<T>(recoilValue: RecoilValue<T>): Loadable<T>;
 export function useRecoilState_TRANSITION_SUPPORT_UNSTABLE<T>(recoilState: RecoilState<T>): [T, SetterOrUpdater<T>];

 /**
  * Returns a function that will run the callback that was passed when
  * calling this hook. Useful for accessing Recoil state in response to
  * events.
  */
 export function useRecoilCallback<Args extends ReadonlyArray<unknown>, Return>(
  fn: (interface: CallbackInterface) => (...args: Args) => Return,
  deps?: ReadonlyArray<unknown>,
 ): (...args: Args) => Return;

 /**
  * Returns a function that executes an atomic transaction for updating Recoil state.
  */
 export function useRecoilTransaction_UNSTABLE<Args extends ReadonlyArray<unknown>>(
  fn: (interface: TransactionInterface_UNSTABLE) => (...args: Args) => void,
  deps?: ReadonlyArray<unknown>,
 ): (...args: Args) => void;

 export function useRecoilTransactionObserver_UNSTABLE(
  callback: (opts: {
    snapshot: Snapshot,
    previousSnapshot: Snapshot,
  }) => void,
 ): void;

 /**
  * Updates Recoil state to match the provided snapshot.
  */
 export function useGotoRecoilSnapshot(): (snapshot: Snapshot) => void;

 /**
  * Returns a snapshot of the current Recoil state and subscribes the component
  * to re-render when any state is updated.
  */
 export function useRecoilSnapshot(): Snapshot;

 // useRecoilRefresher.d.ts
 /**
  * Clears the cache for a selector causing it to be reevaluated.
  */
 export function useRecoilRefresher_UNSTABLE(recoilValue: RecoilValue<any>): () => void;

 // useRecoilBridgeAcrossReactRoots.d.ts
 export const RecoilBridge: React.FC<{children: React.ReactNode}>;
 /**
  * Returns a component that acts like a <RecoilRoot> but shares the same store
  * as the current <RecoilRoot>.
  */
 export function useRecoilBridgeAcrossReactRoots_UNSTABLE(): typeof RecoilBridge;

 // useRecoilStoreID
 declare const StoreID_OPAQUE: unique symbol;
 export interface StoreID {
  readonly [StoreID_OPAQUE]: true;
 }
 /**
  * Returns an ID for the currently active state store of the host <RecoilRoot>
  */
 export function useRecoilStoreID(): StoreID;

 // loadable.d.ts
 interface BaseLoadable<T> {
  getValue: () => T;
  toPromise: () => Promise<T>;
  valueOrThrow: () => T;
  errorOrThrow: () => any;
  promiseOrThrow: () => Promise<T>;
  is: (other: Loadable<any>) => boolean;
  map: <S>(map: (from: T) => Loadable<S> | Promise<S> | S) => Loadable<S>;
 }

 interface ValueLoadable<T> extends BaseLoadable<T> {
  state: 'hasValue';
  contents: T;
  valueMaybe: () => T;
  errorMaybe: () => undefined;
  promiseMaybe: () => undefined;
 }

 interface LoadingLoadable<T> extends BaseLoadable<T> {
  state: 'loading';
  contents: Promise<T>;
  valueMaybe: () => undefined;
  errorMaybe: () => undefined;
  promiseMaybe: () => Promise<T>;
 }

 interface ErrorLoadable<T> extends BaseLoadable<T> {
  state: 'hasError';
  contents: any;
  valueMaybe: () => undefined;
  errorMaybe: () => any;
  promiseMaybe: () => undefined;
 }

 export type Loadable<T> =
  | ValueLoadable<T>
  | LoadingLoadable<T>
  | ErrorLoadable<T>;

 // recoilValue.d.ts
 declare class AbstractRecoilValue<T> {
  __tag: [T];
  __cTag: (t: T) => void; // for contravariance

  key: NodeKey;
  constructor(newKey: NodeKey);
  toJSON(): {key: string};
 }

 declare class AbstractRecoilValueReadonly<T> {
  __tag: [T];

  key: NodeKey;
  constructor(newKey: NodeKey);
  toJSON(): {key: string};
 }

 export class RecoilState<T> extends AbstractRecoilValue<T> {}
 export class RecoilValueReadOnly<T> extends AbstractRecoilValueReadonly<T> {}
 export type RecoilValue<T> = RecoilValueReadOnly<T> | RecoilState<T>;

 /**
  * Returns true if the parameter is a Recoil atom or selector.
  */
 export function isRecoilValue(val: unknown): val is RecoilValue<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

 /** Utilities */

 // bigint not supported yet
 type Primitive = undefined | null | boolean | number | symbol | string;
 interface HasToJSON { toJSON(): SerializableParam; }

 export type SerializableParam =
  | Primitive
  | HasToJSON
  | ReadonlyArray<SerializableParam>
  | ReadonlySet<SerializableParam>
  | ReadonlyMap<SerializableParam, SerializableParam>
  | Readonly<{[key: string]: SerializableParam}>;

interface AtomFamilyOptionsWithoutDefault<T, P extends SerializableParam> {
  key: NodeKey;
  dangerouslyAllowMutability?: boolean;
  effects?: | ReadonlyArray<AtomEffect<T>> | ((param: P) => ReadonlyArray<AtomEffect<T>>);
  effects_UNSTABLE?: | ReadonlyArray<AtomEffect<T>> | ((param: P) => ReadonlyArray<AtomEffect<T>>);
  // cachePolicyForParams_UNSTABLE?: CachePolicyWithoutEviction; TODO: removing while we discuss long term API
  }
  interface AtomFamilyOptionsWithDefault<T, P extends SerializableParam> extends AtomFamilyOptionsWithoutDefault<T, P> {
  default:
    | RecoilValue<T>
    | Promise<T>
    | Loadable<T>
    | WrappedValue<T>
    | T
    | ((param: P) => T | RecoilValue<T> | Promise<T> | Loadable<T> | WrappedValue<T>);
  }
  export type AtomFamilyOptions<T, P extends SerializableParam> =
    | AtomFamilyOptionsWithDefault<T, P>
    | AtomFamilyOptionsWithoutDefault<T, P>;

 /**
  * Returns a function which returns a memoized atom for each unique parameter value.
  */
 export function atomFamily<T, P extends SerializableParam>(
  options: AtomFamilyOptions<T, P>,
 ): (param: P) => RecoilState<T>;

 export interface ReadOnlySelectorFamilyOptions<T, P extends SerializableParam> {
  key: string;
  get: (param: P) => (opts: {
    get: GetRecoilValue,
    getCallback: GetCallback,
  }) => Promise<T> | RecoilValue<T> | Loadable<T> | WrappedValue<T> | T;
  // cachePolicyForParams_UNSTABLE?: CachePolicyWithoutEviction; TODO: removing while we discuss long term API
  cachePolicy_UNSTABLE?: CachePolicyWithoutEquality; // TODO: using the more restrictive CachePolicyWithoutEquality while we discuss long term API
  dangerouslyAllowMutability?: boolean;
 }

 export interface ReadWriteSelectorFamilyOptions<T, P extends SerializableParam> {
  key: string;
  get: (param: P) => (opts: {
    get: GetRecoilValue,
    getCallback: GetCallback,
  }) => Promise<T> | Loadable<T> | WrappedValue<T> | RecoilValue<T> | T;
  set: (
      param: P,
  ) => (
      opts: { set: SetRecoilState; get: GetRecoilValue; reset: ResetRecoilState },
      newValue: T | DefaultValue,
  ) => void;
  // cachePolicyForParams_UNSTABLE?: CachePolicyWithoutEviction; TODO: removing while we discuss long term API
  cachePolicy_UNSTABLE?: CachePolicyWithoutEquality; // TODO: using the more restrictive CachePolicyWithoutEquality while we discuss long term API
  dangerouslyAllowMutability?: boolean;
 }

/**
 * Returns a function which returns a memoized atom for each unique parameter value.
 */
export function selectorFamily<T, P extends SerializableParam>(
options: ReadWriteSelectorFamilyOptions<T, P>,
): (param: P) => RecoilState<T>;

/**
 * Returns a function which returns a memoized atom for each unique parameter value.
 */
export function selectorFamily<T, P extends SerializableParam>(
options: ReadOnlySelectorFamilyOptions<T, P>,
): (param: P) => RecoilValueReadOnly<T>;

/**
 * Returns a selector that always has a constant value.
 */
export function constSelector<T extends SerializableParam>(constant: T): RecoilValueReadOnly<T>;

/**
 * Returns a selector which is always in the provided error state.
 */
export function errorSelector(message: string): RecoilValueReadOnly<never>;

/**
 * Casts a selector to be a read-only selector
 */
export function readOnlySelector<T>(atom: RecoilValue<T>): RecoilValueReadOnly<T>;

/**
 * Returns a selector that has the value of the provided atom or selector as a Loadable.
 * This means you can use noWait() to avoid entering an error or suspense state in
 * order to manually handle those cases.
 */
export function noWait<T>(state: RecoilValue<T>): RecoilValueReadOnly<Loadable<T>>;

 /* eslint-disable @typescript-eslint/no-explicit-any */

 export type UnwrapRecoilValue<T> = T extends RecoilValue<infer R> ? R : never;

 export type UnwrapRecoilValues<T extends Array<RecoilValue<any>> | { [key: string]: RecoilValue<any> }> = {
  [P in keyof T]: UnwrapRecoilValue<T[P]>;
 };
 export type UnwrapRecoilValueLoadables<T extends Array<RecoilValue<any>> | { [key: string]: RecoilValue<any> }> = {
  [P in keyof T]: Loadable<UnwrapRecoilValue<T[P]>>;
 };

 export function waitForNone<RecoilValues extends Array<RecoilValue<any>> | [RecoilValue<any>]>(
  param: RecoilValues,
 ): RecoilValueReadOnly<UnwrapRecoilValueLoadables<RecoilValues>>;

 export function waitForNone<RecoilValues extends { [key: string]: RecoilValue<any> }>(
  param: RecoilValues,
 ): RecoilValueReadOnly<UnwrapRecoilValueLoadables<RecoilValues>>;

 export function waitForAny<RecoilValues extends Array<RecoilValue<any>> | [RecoilValue<any>]>(
  param: RecoilValues,
 ): RecoilValueReadOnly<UnwrapRecoilValueLoadables<RecoilValues>>;

 export function waitForAny<RecoilValues extends { [key: string]: RecoilValue<any> }>(
    param: RecoilValues,
 ): RecoilValueReadOnly<UnwrapRecoilValueLoadables<RecoilValues>>;

 export function waitForAll<RecoilValues extends Array<RecoilValue<any>> | [RecoilValue<any>]>(
  param: RecoilValues,
 ): RecoilValueReadOnly<UnwrapRecoilValues<RecoilValues>>;

 export function waitForAll<RecoilValues extends { [key: string]: RecoilValue<any> }>(
  param: RecoilValues,
 ): RecoilValueReadOnly<UnwrapRecoilValues<RecoilValues>>;

 export function waitForAllSettled<RecoilValues extends Array<RecoilValue<any>> | [RecoilValue<any>]>(
  param: RecoilValues,
 ): RecoilValueReadOnly<UnwrapRecoilValueLoadables<RecoilValues>>;

 export function waitForAllSettled<RecoilValues extends { [key: string]: RecoilValue<any> }>(
  param: RecoilValues,
 ): RecoilValueReadOnly<UnwrapRecoilValueLoadables<RecoilValues>>;

  export type UnwrapLoadable<T> = T extends Loadable<infer R> ? R : T extends Promise<infer P> ? P : T;
  export type UnwrapLoadables<T extends any[] | { [key: string]: any }> = {
    [P in keyof T]: UnwrapLoadable<T[P]>;
  };

  /* eslint-disable @typescript-eslint/no-unused-vars */
  export namespace RecoilLoadable {
    /**
     * Factory to make a Loadable object.  If a Promise is provided the Loadable will
     * be in a 'loading' state until the Promise is either resolved or rejected.
     */
    function of<T>(x: T | Promise<T> | Loadable<T>): Loadable<T>;
    /**
     * Factory to make a Loadable object in an error state.
     */
    function error(x: any): ErrorLoadable<any>;
    /**
     * Factory to make a loading Loadable which never resolves.
     */
    function loading(): LoadingLoadable<any>;
    /**
     * Factory to make a Loadable which is resolved when all of the Loadables provided
     * to it are resolved or any one has an error.  The value is an array of the values
     * of all of the provided Loadables.  This is comparable to Promise.all() for Loadables.
     * Similar to Promise.all(), inputs may be Loadables, Promises, or literal values.
     */
    function all<Inputs extends any[] | [Loadable<any>]>(inputs: Inputs): Loadable<UnwrapLoadables<Inputs>>;
    function all<Inputs extends {[key: string]: any}>(inputs: Inputs): Loadable<UnwrapLoadables<Inputs>>;
    /**
     * Returns true if the provided parameter is a Loadable type.
     */
    function isLoadable(x: any): x is Loadable<any>;
   }
  /* eslint-enable @typescript-eslint/no-unused-vars */

 /* eslint-enable @typescript-eslint/no-explicit-any */

 /**
  * Factory to produce a Recoil snapshot object with all atoms in the default state.
  */
 export function snapshot_UNSTABLE(initializeState?: (mutableSnapshot: MutableSnapshot) => void): Snapshot;
