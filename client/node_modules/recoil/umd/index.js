(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('react'), require('react-dom')) :
  typeof define === 'function' && define.amd ? define(['exports', 'react', 'react-dom'], factory) :
  (global = global || self, factory(global.Recoil = {}, global.React, global.ReactDOM));
}(this, (function (exports, react, reactDom) { 'use strict';

  react = react && Object.prototype.hasOwnProperty.call(react, 'default') ? react['default'] : react;
  reactDom = reactDom && Object.prototype.hasOwnProperty.call(reactDom, 'default') ? reactDom['default'] : reactDom;

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  function err(message) {
    const error = new Error(message); // In V8, Error objects keep the closure scope chain alive until the
    // err.stack property is accessed.

    if (error.stack === undefined) {
      // IE sets the stack only if error is thrown
      try {
        throw error;
      } catch (_) {} // eslint-disable-line fb-www/no-unused-catch-bindings, no-empty

    }

    return error;
  }

  var err_1 = err;

  // @oss-only


  var Recoil_err = err_1;

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  // Split declaration and implementation to allow this function to pretend to
  // check for actual instance of Promise instead of something with a `then`
  // method.
  // eslint-disable-next-line no-redeclare
  function isPromise(p) {
    return !!p && typeof p.then === 'function';
  }

  var Recoil_isPromise = isPromise;

  function nullthrows(x, message) {
    if (x != null) {
      return x;
    }

    throw Recoil_err(message !== null && message !== void 0 ? message : 'Got unexpected null or undefined');
  }

  var Recoil_nullthrows = nullthrows;

  function _defineProperty(obj, key, value) {
    if (key in obj) {
      Object.defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    } else {
      obj[key] = value;
    }

    return obj;
  }

  class BaseLoadable {
    getValue() {
      throw Recoil_err('BaseLoadable');
    }

    toPromise() {
      throw Recoil_err('BaseLoadable');
    }

    valueMaybe() {
      throw Recoil_err('BaseLoadable');
    }

    valueOrThrow() {
      // $FlowFixMe[prop-missing]
      throw Recoil_err(`Loadable expected value, but in "${this.state}" state`);
    }

    promiseMaybe() {
      throw Recoil_err('BaseLoadable');
    }

    promiseOrThrow() {
      // $FlowFixMe[prop-missing]
      throw Recoil_err(`Loadable expected promise, but in "${this.state}" state`);
    }

    errorMaybe() {
      throw Recoil_err('BaseLoadable');
    }

    errorOrThrow() {
      // $FlowFixMe[prop-missing]
      throw Recoil_err(`Loadable expected error, but in "${this.state}" state`);
    }

    is(other) {
      // $FlowFixMe[prop-missing]
      return other.state === this.state && other.contents === this.contents;
    }

    map(_map) {
      throw Recoil_err('BaseLoadable');
    }

  }

  class ValueLoadable extends BaseLoadable {
    constructor(value) {
      super();

      _defineProperty(this, "state", 'hasValue');

      _defineProperty(this, "contents", void 0);

      this.contents = value;
    }

    getValue() {
      return this.contents;
    }

    toPromise() {
      return Promise.resolve(this.contents);
    }

    valueMaybe() {
      return this.contents;
    }

    valueOrThrow() {
      return this.contents;
    }

    promiseMaybe() {
      return undefined;
    }

    errorMaybe() {
      return undefined;
    }

    map(map) {
      try {
        const next = map(this.contents);
        return Recoil_isPromise(next) ? loadableWithPromise(next) : isLoadable(next) ? next : loadableWithValue(next);
      } catch (e) {
        return Recoil_isPromise(e) ? // If we "suspended", then try again.
        // errors and subsequent retries will be handled in 'loading' case
        // $FlowFixMe[prop-missing]
        loadableWithPromise(e.next(() => this.map(map))) : loadableWithError(e);
      }
    }

  }

  class ErrorLoadable extends BaseLoadable {
    constructor(error) {
      super();

      _defineProperty(this, "state", 'hasError');

      _defineProperty(this, "contents", void 0);

      this.contents = error;
    }

    getValue() {
      throw this.contents;
    }

    toPromise() {
      return Promise.reject(this.contents);
    }

    valueMaybe() {
      return undefined;
    }

    promiseMaybe() {
      return undefined;
    }

    errorMaybe() {
      return this.contents;
    }

    errorOrThrow() {
      return this.contents;
    }

    map(_map) {
      // $FlowIssue[incompatible-return]
      return this;
    }

  }

  class LoadingLoadable extends BaseLoadable {
    constructor(promise) {
      super();

      _defineProperty(this, "state", 'loading');

      _defineProperty(this, "contents", void 0);

      this.contents = promise;
    }

    getValue() {
      throw this.contents;
    }

    toPromise() {
      return this.contents;
    }

    valueMaybe() {
      return undefined;
    }

    promiseMaybe() {
      return this.contents;
    }

    promiseOrThrow() {
      return this.contents;
    }

    errorMaybe() {
      return undefined;
    }

    map(map) {
      return loadableWithPromise(this.contents.then(value => {
        const next = map(value);

        if (isLoadable(next)) {
          const nextLoadable = next;

          switch (nextLoadable.state) {
            case 'hasValue':
              return nextLoadable.contents;

            case 'hasError':
              throw nextLoadable.contents;

            case 'loading':
              return nextLoadable.contents;
          }
        } // $FlowIssue[incompatible-return]


        return next;
      }) // $FlowFixMe[incompatible-call]
      .catch(e => {
        if (Recoil_isPromise(e)) {
          // we were "suspended," try again
          return e.then(() => this.map(map).contents);
        }

        throw e;
      }));
    }

  }

  function loadableWithValue(value) {
    return Object.freeze(new ValueLoadable(value));
  }

  function loadableWithError(error) {
    return Object.freeze(new ErrorLoadable(error));
  }

  function loadableWithPromise(promise) {
    return Object.freeze(new LoadingLoadable(promise));
  }

  function loadableLoading() {
    return Object.freeze(new LoadingLoadable(new Promise(() => {})));
  }

  function loadableAllArray(inputs) {
    return inputs.every(i => i.state === 'hasValue') ? loadableWithValue(inputs.map(i => i.contents)) : inputs.some(i => i.state === 'hasError') ? loadableWithError(Recoil_nullthrows(inputs.find(i => i.state === 'hasError'), 'Invalid loadable passed to loadableAll').contents) : loadableWithPromise(Promise.all(inputs.map(i => i.contents)));
  }

  function loadableAll(inputs) {
    const unwrapedInputs = Array.isArray(inputs) ? inputs : Object.getOwnPropertyNames(inputs).map(key => inputs[key]);
    const normalizedInputs = unwrapedInputs.map(x => isLoadable(x) ? x : Recoil_isPromise(x) ? loadableWithPromise(x) : loadableWithValue(x));
    const output = loadableAllArray(normalizedInputs);
    return Array.isArray(inputs) ? // $FlowIssue[incompatible-return]
    output : // Object.getOwnPropertyNames() has consistent key ordering with ES6
    // $FlowIssue[incompatible-call]
    output.map(outputs => Object.getOwnPropertyNames(inputs).reduce( // $FlowFixMe[invalid-computed-prop]
    (out, key, idx) => ({ ...out,
      [key]: outputs[idx]
    }), {}));
  }

  function isLoadable(x) {
    return x instanceof BaseLoadable;
  }

  const LoadableStaticInterface = {
    of: value => Recoil_isPromise(value) ? loadableWithPromise(value) : isLoadable(value) ? value : loadableWithValue(value),
    error: error => loadableWithError(error),
    // $FlowIssue[incompatible-return]
    loading: () => loadableLoading(),
    // $FlowIssue[unclear-type]
    all: loadableAll,
    isLoadable
  };
  var Recoil_Loadable = {
    loadableWithValue,
    loadableWithError,
    loadableWithPromise,
    loadableLoading,
    loadableAll,
    isLoadable,
    RecoilLoadable: LoadableStaticInterface
  };

  var Recoil_Loadable_1 = Recoil_Loadable.loadableWithValue;
  var Recoil_Loadable_2 = Recoil_Loadable.loadableWithError;
  var Recoil_Loadable_3 = Recoil_Loadable.loadableWithPromise;
  var Recoil_Loadable_4 = Recoil_Loadable.loadableLoading;
  var Recoil_Loadable_5 = Recoil_Loadable.loadableAll;
  var Recoil_Loadable_6 = Recoil_Loadable.isLoadable;
  var Recoil_Loadable_7 = Recoil_Loadable.RecoilLoadable;

  var Recoil_Loadable$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    loadableWithValue: Recoil_Loadable_1,
    loadableWithError: Recoil_Loadable_2,
    loadableWithPromise: Recoil_Loadable_3,
    loadableLoading: Recoil_Loadable_4,
    loadableAll: Recoil_Loadable_5,
    isLoadable: Recoil_Loadable_6,
    RecoilLoadable: Recoil_Loadable_7
  });

  const env = {
    RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED: true,
    // Note: RECOIL_GKS_ENABLED settings will only be honored in OSS builds of Recoil
    RECOIL_GKS_ENABLED: new Set(['recoil_hamt_2020', 'recoil_sync_external_store', 'recoil_suppress_rerender_in_callback', 'recoil_memory_managament_2020'])
  };

  function readProcessEnvBooleanFlag(name, set) {
    var _process$env$name, _process$env$name$toL;

    const sanitizedValue = (_process$env$name = process.env[name]) === null || _process$env$name === void 0 ? void 0 : (_process$env$name$toL = _process$env$name.toLowerCase()) === null || _process$env$name$toL === void 0 ? void 0 : _process$env$name$toL.trim();

    if (sanitizedValue == null || sanitizedValue === '') {
      return;
    }

    const allowedValues = ['true', 'false'];

    if (!allowedValues.includes(sanitizedValue)) {
      throw Recoil_err(`process.env.${name} value must be 'true', 'false', or empty: ${sanitizedValue}`);
    }

    set(sanitizedValue === 'true');
  }

  function readProcessEnvStringArrayFlag(name, set) {
    var _process$env$name2;

    const sanitizedValue = (_process$env$name2 = process.env[name]) === null || _process$env$name2 === void 0 ? void 0 : _process$env$name2.trim();

    if (sanitizedValue == null || sanitizedValue === '') {
      return;
    }

    set(sanitizedValue.split(/\s*,\s*|\s+/));
  }
  /**
   * Allow NodeJS/NextJS/etc to set the initial state through process.env variable
   * Note:  we don't assume 'process' is available in all runtime environments
   *
   * @see https://github.com/facebookexperimental/Recoil/issues/733
   */


  function applyProcessEnvFlagOverrides() {
    var _process;

    // note: this check is needed in addition to the check below, runtime error will occur without it!
    // eslint-disable-next-line fb-www/typeof-undefined
    if (typeof process === 'undefined') {
      return;
    }

    if (((_process = process) === null || _process === void 0 ? void 0 : _process.env) == null) {
      return;
    }

    readProcessEnvBooleanFlag('RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED', value => {
      env.RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED = value;
    });
    readProcessEnvStringArrayFlag('RECOIL_GKS_ENABLED', value => {
      value.forEach(gk => {
        env.RECOIL_GKS_ENABLED.add(gk);
      });
    });
  }

  applyProcessEnvFlagOverrides();
  var Recoil_RecoilEnv = env;

  function Recoil_gkx_OSS(gk) {
    return Recoil_RecoilEnv.RECOIL_GKS_ENABLED.has(gk);
  }

  Recoil_gkx_OSS.setPass = gk => {
    Recoil_RecoilEnv.RECOIL_GKS_ENABLED.add(gk);
  };

  Recoil_gkx_OSS.setFail = gk => {
    Recoil_RecoilEnv.RECOIL_GKS_ENABLED.delete(gk);
  };

  Recoil_gkx_OSS.clear = () => {
    Recoil_RecoilEnv.RECOIL_GKS_ENABLED.clear();
  };

  var Recoil_gkx = Recoil_gkx_OSS; // @oss-only

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  function recoverableViolation(message, _projectName, {
    error
  } = {}) {
    {
      console.error(message, error);
    }

    return null;
  }

  var recoverableViolation_1 = recoverableViolation;

  // @oss-only


  var Recoil_recoverableViolation = recoverableViolation_1;

  var _createMutableSource, _useMutableSource, _useSyncExternalStore;







  const createMutableSource = // flowlint-next-line unclear-type:off
  (_createMutableSource = react.createMutableSource) !== null && _createMutableSource !== void 0 ? _createMutableSource : react.unstable_createMutableSource;
  const useMutableSource = // flowlint-next-line unclear-type:off
  (_useMutableSource = react.useMutableSource) !== null && _useMutableSource !== void 0 ? _useMutableSource : react.unstable_useMutableSource; // https://github.com/reactwg/react-18/discussions/86

  const useSyncExternalStore = // flowlint-next-line unclear-type:off
  (_useSyncExternalStore = react.useSyncExternalStore) !== null && _useSyncExternalStore !== void 0 ? _useSyncExternalStore : // flowlint-next-line unclear-type:off
  react.unstable_useSyncExternalStore;
  let ReactRendererVersionMismatchWarnOnce = false; // Check if the current renderer supports `useSyncExternalStore()`.
  // Since React goes through a proxy dispatcher and the current renderer can
  // change we can't simply check if `React.useSyncExternalStore()` is defined.

  function currentRendererSupportsUseSyncExternalStore() {
    var _ReactCurrentDispatch;

    // $FlowFixMe[incompatible-use]
    const {
      ReactCurrentDispatcher,
      ReactCurrentOwner
    } =
    /* $FlowFixMe[prop-missing] This workaround was approved as a safer mechanism
     * to detect if the current renderer supports useSyncExternalStore()
     * https://fb.workplace.com/groups/reactjs/posts/9558682330846963/ */
    react.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    const dispatcher = (_ReactCurrentDispatch = ReactCurrentDispatcher === null || ReactCurrentDispatcher === void 0 ? void 0 : ReactCurrentDispatcher.current) !== null && _ReactCurrentDispatch !== void 0 ? _ReactCurrentDispatch : ReactCurrentOwner.currentDispatcher;
    const isUseSyncExternalStoreSupported = dispatcher.useSyncExternalStore != null;

    if (useSyncExternalStore && !isUseSyncExternalStoreSupported && !ReactRendererVersionMismatchWarnOnce) {
      ReactRendererVersionMismatchWarnOnce = true;
      Recoil_recoverableViolation('A React renderer without React 18+ API support is being used with React 18+.');
    }

    return isUseSyncExternalStoreSupported;
  }

  /**
   * mode: The React API and approach to use for syncing state with React
   * early: Re-renders from Recoil updates occur:
   *    1) earlier
   *    2) in sync with React updates in the same batch
   *    3) before transaction observers instead of after.
   * concurrent: Is the current mode compatible with Concurrent Mode and useTransition()
   */
  function reactMode() {
    // NOTE: This mode is currently broken with some Suspense cases
    // see Recoil_selector-test.js
    if (Recoil_gkx('recoil_transition_support')) {
      return {
        mode: 'TRANSITION_SUPPORT',
        early: true,
        concurrent: true
      };
    }

    if (Recoil_gkx('recoil_sync_external_store') && useSyncExternalStore != null) {
      return {
        mode: 'SYNC_EXTERNAL_STORE',
        early: true,
        concurrent: false
      };
    }

    if (Recoil_gkx('recoil_mutable_source') && useMutableSource != null && typeof window !== 'undefined' && !window.$disableRecoilValueMutableSource_TEMP_HACK_DO_NOT_USE) {
      return Recoil_gkx('recoil_suppress_rerender_in_callback') ? {
        mode: 'MUTABLE_SOURCE',
        early: true,
        concurrent: true
      } : {
        mode: 'MUTABLE_SOURCE',
        early: false,
        concurrent: false
      };
    }

    return Recoil_gkx('recoil_suppress_rerender_in_callback') ? {
      mode: 'LEGACY',
      early: true,
      concurrent: false
    } : {
      mode: 'LEGACY',
      early: false,
      concurrent: false
    };
  } // TODO Need to figure out if there is a standard/open-source equivalent to see if hot module replacement is happening:


  function isFastRefreshEnabled() {
    // @fb-only: const {isAcceptingUpdate} = require('__debug');
    // @fb-only: return typeof isAcceptingUpdate === 'function' && isAcceptingUpdate();
    return false; // @oss-only
  }

  var Recoil_ReactMode = {
    createMutableSource,
    useMutableSource,
    useSyncExternalStore,
    currentRendererSupportsUseSyncExternalStore,
    reactMode,
    isFastRefreshEnabled
  };

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  // eslint-disable-next-line no-unused-vars
  class AbstractRecoilValue {
    constructor(newKey) {
      _defineProperty(this, "key", void 0);

      this.key = newKey;
    }

    toJSON() {
      return {
        key: this.key
      };
    }

  }

  class RecoilState extends AbstractRecoilValue {}

  class RecoilValueReadOnly extends AbstractRecoilValue {}

  function isRecoilValue(x) {
    return x instanceof RecoilState || x instanceof RecoilValueReadOnly;
  }

  var Recoil_RecoilValue = {
    AbstractRecoilValue,
    RecoilState,
    RecoilValueReadOnly,
    isRecoilValue
  };

  var Recoil_RecoilValue_1 = Recoil_RecoilValue.AbstractRecoilValue;
  var Recoil_RecoilValue_2 = Recoil_RecoilValue.RecoilState;
  var Recoil_RecoilValue_3 = Recoil_RecoilValue.RecoilValueReadOnly;
  var Recoil_RecoilValue_4 = Recoil_RecoilValue.isRecoilValue;

  var Recoil_RecoilValue$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    AbstractRecoilValue: Recoil_RecoilValue_1,
    RecoilState: Recoil_RecoilValue_2,
    RecoilValueReadOnly: Recoil_RecoilValue_3,
    isRecoilValue: Recoil_RecoilValue_4
  });

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  function sprintf(format, ...args) {
    let index = 0;
    return format.replace(/%s/g, () => String(args[index++]));
  }

  var sprintf_1 = sprintf;

  function expectationViolation(format, ...args) {
    {
      const message = sprintf_1.call(null, format, ...args);
      const error = new Error(message);
      error.name = 'Expectation Violation';
      console.error(error);
    }
  }

  var expectationViolation_1 = expectationViolation;

  // @oss-only


  var Recoil_expectationViolation = expectationViolation_1;

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */
  /**
   * Creates a new iterable whose output is generated by passing the input
   * iterable's values through the mapper function.
   */

  function mapIterable(iterable, callback) {
    // Use generator to create iterable/iterator
    return function* () {
      let index = 0;

      for (const value of iterable) {
        yield callback(value, index++);
      }
    }();
  }

  var Recoil_mapIterable = mapIterable;

  const {
    isFastRefreshEnabled: isFastRefreshEnabled$1
  } = Recoil_ReactMode;















  class DefaultValue {}

  const DEFAULT_VALUE = new DefaultValue();
  // flowlint-next-line unclear-type:off
  const nodes = new Map(); // flowlint-next-line unclear-type:off

  const recoilValues = new Map();
  /* eslint-disable no-redeclare */

  function recoilValuesForKeys(keys) {
    return Recoil_mapIterable(keys, key => Recoil_nullthrows(recoilValues.get(key)));
  }

  function checkForDuplicateAtomKey(key) {
    if (nodes.has(key)) {
      const message = `Duplicate atom key "${key}". This is a FATAL ERROR in
      production. But it is safe to ignore this warning if it occurred because of
      hot module replacement.`;

      {
        // TODO Figure this out for open-source
        if (!isFastRefreshEnabled$1()) {
          Recoil_expectationViolation(message, 'recoil');
        }
      }
    }
  }

  function registerNode(node) {
    if (Recoil_RecoilEnv.RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED) {
      checkForDuplicateAtomKey(node.key);
    }

    nodes.set(node.key, node);
    const recoilValue = node.set == null ? new Recoil_RecoilValue$1.RecoilValueReadOnly(node.key) : new Recoil_RecoilValue$1.RecoilState(node.key);
    recoilValues.set(node.key, recoilValue);
    return recoilValue;
  }
  /* eslint-enable no-redeclare */


  class NodeMissingError extends Error {} // flowlint-next-line unclear-type:off


  function getNode(key) {
    const node = nodes.get(key);

    if (node == null) {
      throw new NodeMissingError(`Missing definition for RecoilValue: "${key}""`);
    }

    return node;
  } // flowlint-next-line unclear-type:off


  function getNodeMaybe(key) {
    return nodes.get(key);
  }

  const configDeletionHandlers = new Map();

  function deleteNodeConfigIfPossible(key) {
    var _node$shouldDeleteCon;

    if (!Recoil_gkx('recoil_memory_managament_2020')) {
      return;
    }

    const node = nodes.get(key);

    if (node !== null && node !== void 0 && (_node$shouldDeleteCon = node.shouldDeleteConfigOnRelease) !== null && _node$shouldDeleteCon !== void 0 && _node$shouldDeleteCon.call(node)) {
      var _getConfigDeletionHan;

      nodes.delete(key);
      (_getConfigDeletionHan = getConfigDeletionHandler(key)) === null || _getConfigDeletionHan === void 0 ? void 0 : _getConfigDeletionHan();
      configDeletionHandlers.delete(key);
    }
  }

  function setConfigDeletionHandler(key, fn) {
    if (!Recoil_gkx('recoil_memory_managament_2020')) {
      return;
    }

    if (fn === undefined) {
      configDeletionHandlers.delete(key);
    } else {
      configDeletionHandlers.set(key, fn);
    }
  }

  function getConfigDeletionHandler(key) {
    return configDeletionHandlers.get(key);
  }

  var Recoil_Node = {
    nodes,
    recoilValues,
    registerNode,
    getNode,
    getNodeMaybe,
    deleteNodeConfigIfPossible,
    setConfigDeletionHandler,
    getConfigDeletionHandler,
    recoilValuesForKeys,
    NodeMissingError,
    DefaultValue,
    DEFAULT_VALUE
  };

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  function enqueueExecution(s, f) {
    f();
  }

  var Recoil_Queue = {
    enqueueExecution
  };

  function createCommonjsModule(fn, module) {
  	return module = { exports: {} }, fn(module, module.exports), module.exports;
  }

  var hamt_1 = createCommonjsModule(function (module) {

  var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) {
    return typeof obj;
  } : function (obj) {
    return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
  };
  /**
      @fileOverview Hash Array Mapped Trie.

      Code based on: https://github.com/exclipy/pdata
  */


  var hamt = {}; // export

  /* Configuration
   ******************************************************************************/

  var SIZE = 5;
  var BUCKET_SIZE = Math.pow(2, SIZE);
  var MASK = BUCKET_SIZE - 1;
  var MAX_INDEX_NODE = BUCKET_SIZE / 2;
  var MIN_ARRAY_NODE = BUCKET_SIZE / 4;
  /*
   ******************************************************************************/

  var nothing = {};

  var constant = function constant(x) {
    return function () {
      return x;
    };
  };
  /**
      Get 32 bit hash of string.

      Based on:
      http://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript-jquery
  */


  var hash = hamt.hash = function (str) {
    var type = typeof str === 'undefined' ? 'undefined' : _typeof(str);
    if (type === 'number') return str;
    if (type !== 'string') str += '';
    var hash = 0;

    for (var i = 0, len = str.length; i < len; ++i) {
      var c = str.charCodeAt(i);
      hash = (hash << 5) - hash + c | 0;
    }

    return hash;
  };
  /* Bit Ops
   ******************************************************************************/

  /**
      Hamming weight.

      Taken from: http://jsperf.com/hamming-weight
  */


  var popcount = function popcount(x) {
    x -= x >> 1 & 0x55555555;
    x = (x & 0x33333333) + (x >> 2 & 0x33333333);
    x = x + (x >> 4) & 0x0f0f0f0f;
    x += x >> 8;
    x += x >> 16;
    return x & 0x7f;
  };

  var hashFragment = function hashFragment(shift, h) {
    return h >>> shift & MASK;
  };

  var toBitmap = function toBitmap(x) {
    return 1 << x;
  };

  var fromBitmap = function fromBitmap(bitmap, bit) {
    return popcount(bitmap & bit - 1);
  };
  /* Array Ops
   ******************************************************************************/

  /**
      Set a value in an array.

      @param mutate Should the input array be mutated?
      @param at Index to change.
      @param v New value
      @param arr Array.
  */


  var arrayUpdate = function arrayUpdate(mutate, at, v, arr) {
    var out = arr;

    if (!mutate) {
      var len = arr.length;
      out = new Array(len);

      for (var i = 0; i < len; ++i) {
        out[i] = arr[i];
      }
    }

    out[at] = v;
    return out;
  };
  /**
      Remove a value from an array.

      @param mutate Should the input array be mutated?
      @param at Index to remove.
      @param arr Array.
  */


  var arraySpliceOut = function arraySpliceOut(mutate, at, arr) {
    var newLen = arr.length - 1;
    var i = 0;
    var g = 0;
    var out = arr;

    if (mutate) {
      i = g = at;
    } else {
      out = new Array(newLen);

      while (i < at) {
        out[g++] = arr[i++];
      }
    }

    ++i;

    while (i <= newLen) {
      out[g++] = arr[i++];
    }

    if (mutate) {
      out.length = newLen;
    }

    return out;
  };
  /**
      Insert a value into an array.

      @param mutate Should the input array be mutated?
      @param at Index to insert at.
      @param v Value to insert,
      @param arr Array.
  */


  var arraySpliceIn = function arraySpliceIn(mutate, at, v, arr) {
    var len = arr.length;

    if (mutate) {
      var _i = len;

      while (_i >= at) {
        arr[_i--] = arr[_i];
      }

      arr[at] = v;
      return arr;
    }

    var i = 0,
        g = 0;
    var out = new Array(len + 1);

    while (i < at) {
      out[g++] = arr[i++];
    }

    out[at] = v;

    while (i < len) {
      out[++g] = arr[i++];
    }

    return out;
  };
  /* Node Structures
   ******************************************************************************/


  var LEAF = 1;
  var COLLISION = 2;
  var INDEX = 3;
  var ARRAY = 4;
  /**
      Empty node.
  */

  var empty = {
    __hamt_isEmpty: true
  };

  var isEmptyNode = function isEmptyNode(x) {
    return x === empty || x && x.__hamt_isEmpty;
  };
  /**
      Leaf holding a value.

      @member edit Edit of the node.
      @member hash Hash of key.
      @member key Key.
      @member value Value stored.
  */


  var Leaf = function Leaf(edit, hash, key, value) {
    return {
      type: LEAF,
      edit: edit,
      hash: hash,
      key: key,
      value: value,
      _modify: Leaf__modify
    };
  };
  /**
      Leaf holding multiple values with the same hash but different keys.

      @member edit Edit of the node.
      @member hash Hash of key.
      @member children Array of collision children node.
  */


  var Collision = function Collision(edit, hash, children) {
    return {
      type: COLLISION,
      edit: edit,
      hash: hash,
      children: children,
      _modify: Collision__modify
    };
  };
  /**
      Internal node with a sparse set of children.

      Uses a bitmap and array to pack children.

    @member edit Edit of the node.
      @member mask Bitmap that encode the positions of children in the array.
      @member children Array of child nodes.
  */


  var IndexedNode = function IndexedNode(edit, mask, children) {
    return {
      type: INDEX,
      edit: edit,
      mask: mask,
      children: children,
      _modify: IndexedNode__modify
    };
  };
  /**
      Internal node with many children.

      @member edit Edit of the node.
      @member size Number of children.
      @member children Array of child nodes.
  */


  var ArrayNode = function ArrayNode(edit, size, children) {
    return {
      type: ARRAY,
      edit: edit,
      size: size,
      children: children,
      _modify: ArrayNode__modify
    };
  };
  /**
      Is `node` a leaf node?
  */


  var isLeaf = function isLeaf(node) {
    return node === empty || node.type === LEAF || node.type === COLLISION;
  };
  /* Internal node operations.
   ******************************************************************************/

  /**
      Expand an indexed node into an array node.

    @param edit Current edit.
      @param frag Index of added child.
      @param child Added child.
      @param mask Index node mask before child added.
      @param subNodes Index node children before child added.
  */


  var expand = function expand(edit, frag, child, bitmap, subNodes) {
    var arr = [];
    var bit = bitmap;
    var count = 0;

    for (var i = 0; bit; ++i) {
      if (bit & 1) arr[i] = subNodes[count++];
      bit >>>= 1;
    }

    arr[frag] = child;
    return ArrayNode(edit, count + 1, arr);
  };
  /**
      Collapse an array node into a indexed node.

    @param edit Current edit.
      @param count Number of elements in new array.
      @param removed Index of removed element.
      @param elements Array node children before remove.
  */


  var pack = function pack(edit, count, removed, elements) {
    var children = new Array(count - 1);
    var g = 0;
    var bitmap = 0;

    for (var i = 0, len = elements.length; i < len; ++i) {
      if (i !== removed) {
        var elem = elements[i];

        if (elem && !isEmptyNode(elem)) {
          children[g++] = elem;
          bitmap |= 1 << i;
        }
      }
    }

    return IndexedNode(edit, bitmap, children);
  };
  /**
      Merge two leaf nodes.

      @param shift Current shift.
      @param h1 Node 1 hash.
      @param n1 Node 1.
      @param h2 Node 2 hash.
      @param n2 Node 2.
  */


  var mergeLeaves = function mergeLeaves(edit, shift, h1, n1, h2, n2) {
    if (h1 === h2) return Collision(edit, h1, [n2, n1]);
    var subH1 = hashFragment(shift, h1);
    var subH2 = hashFragment(shift, h2);
    return IndexedNode(edit, toBitmap(subH1) | toBitmap(subH2), subH1 === subH2 ? [mergeLeaves(edit, shift + SIZE, h1, n1, h2, n2)] : subH1 < subH2 ? [n1, n2] : [n2, n1]);
  };
  /**
      Update an entry in a collision list.

      @param mutate Should mutation be used?
      @param edit Current edit.
      @param keyEq Key compare function.
      @param hash Hash of collision.
      @param list Collision list.
      @param f Update function.
      @param k Key to update.
      @param size Size ref.
  */


  var updateCollisionList = function updateCollisionList(mutate, edit, keyEq, h, list, f, k, size) {
    var len = list.length;

    for (var i = 0; i < len; ++i) {
      var child = list[i];

      if (keyEq(k, child.key)) {
        var value = child.value;

        var _newValue = f(value);

        if (_newValue === value) return list;

        if (_newValue === nothing) {
          --size.value;
          return arraySpliceOut(mutate, i, list);
        }

        return arrayUpdate(mutate, i, Leaf(edit, h, k, _newValue), list);
      }
    }

    var newValue = f();
    if (newValue === nothing) return list;
    ++size.value;
    return arrayUpdate(mutate, len, Leaf(edit, h, k, newValue), list);
  };

  var canEditNode = function canEditNode(edit, node) {
    return edit === node.edit;
  };
  /* Editing
   ******************************************************************************/


  var Leaf__modify = function Leaf__modify(edit, keyEq, shift, f, h, k, size) {
    if (keyEq(k, this.key)) {
      var _v = f(this.value);

      if (_v === this.value) return this;else if (_v === nothing) {
        --size.value;
        return empty;
      }

      if (canEditNode(edit, this)) {
        this.value = _v;
        return this;
      }

      return Leaf(edit, h, k, _v);
    }

    var v = f();
    if (v === nothing) return this;
    ++size.value;
    return mergeLeaves(edit, shift, this.hash, this, h, Leaf(edit, h, k, v));
  };

  var Collision__modify = function Collision__modify(edit, keyEq, shift, f, h, k, size) {
    if (h === this.hash) {
      var canEdit = canEditNode(edit, this);
      var list = updateCollisionList(canEdit, edit, keyEq, this.hash, this.children, f, k, size);
      if (list === this.children) return this;
      return list.length > 1 ? Collision(edit, this.hash, list) : list[0]; // collapse single element collision list
    }

    var v = f();
    if (v === nothing) return this;
    ++size.value;
    return mergeLeaves(edit, shift, this.hash, this, h, Leaf(edit, h, k, v));
  };

  var IndexedNode__modify = function IndexedNode__modify(edit, keyEq, shift, f, h, k, size) {
    var mask = this.mask;
    var children = this.children;
    var frag = hashFragment(shift, h);
    var bit = toBitmap(frag);
    var indx = fromBitmap(mask, bit);
    var exists = mask & bit;
    var current = exists ? children[indx] : empty;

    var child = current._modify(edit, keyEq, shift + SIZE, f, h, k, size);

    if (current === child) return this;
    var canEdit = canEditNode(edit, this);
    var bitmap = mask;
    var newChildren = void 0;

    if (exists && isEmptyNode(child)) {
      // remove
      bitmap &= ~bit;
      if (!bitmap) return empty;
      if (children.length <= 2 && isLeaf(children[indx ^ 1])) return children[indx ^ 1]; // collapse

      newChildren = arraySpliceOut(canEdit, indx, children);
    } else if (!exists && !isEmptyNode(child)) {
      // add
      if (children.length >= MAX_INDEX_NODE) return expand(edit, frag, child, mask, children);
      bitmap |= bit;
      newChildren = arraySpliceIn(canEdit, indx, child, children);
    } else {
      // modify
      newChildren = arrayUpdate(canEdit, indx, child, children);
    }

    if (canEdit) {
      this.mask = bitmap;
      this.children = newChildren;
      return this;
    }

    return IndexedNode(edit, bitmap, newChildren);
  };

  var ArrayNode__modify = function ArrayNode__modify(edit, keyEq, shift, f, h, k, size) {
    var count = this.size;
    var children = this.children;
    var frag = hashFragment(shift, h);
    var child = children[frag];

    var newChild = (child || empty)._modify(edit, keyEq, shift + SIZE, f, h, k, size);

    if (child === newChild) return this;
    var canEdit = canEditNode(edit, this);
    var newChildren = void 0;

    if (isEmptyNode(child) && !isEmptyNode(newChild)) {
      // add
      ++count;
      newChildren = arrayUpdate(canEdit, frag, newChild, children);
    } else if (!isEmptyNode(child) && isEmptyNode(newChild)) {
      // remove
      --count;
      if (count <= MIN_ARRAY_NODE) return pack(edit, count, frag, children);
      newChildren = arrayUpdate(canEdit, frag, empty, children);
    } else {
      // modify
      newChildren = arrayUpdate(canEdit, frag, newChild, children);
    }

    if (canEdit) {
      this.size = count;
      this.children = newChildren;
      return this;
    }

    return ArrayNode(edit, count, newChildren);
  };

  empty._modify = function (edit, keyEq, shift, f, h, k, size) {
    var v = f();
    if (v === nothing) return empty;
    ++size.value;
    return Leaf(edit, h, k, v);
  };
  /*
   ******************************************************************************/


  function Map(editable, edit, config, root, size) {
    this._editable = editable;
    this._edit = edit;
    this._config = config;
    this._root = root;
    this._size = size;
  }

  Map.prototype.setTree = function (newRoot, newSize) {
    if (this._editable) {
      this._root = newRoot;
      this._size = newSize;
      return this;
    }

    return newRoot === this._root ? this : new Map(this._editable, this._edit, this._config, newRoot, newSize);
  };
  /* Queries
   ******************************************************************************/

  /**
      Lookup the value for `key` in `map` using a custom `hash`.

      Returns the value or `alt` if none.
  */


  var tryGetHash = hamt.tryGetHash = function (alt, hash, key, map) {
    var node = map._root;
    var shift = 0;
    var keyEq = map._config.keyEq;

    while (true) {
      switch (node.type) {
        case LEAF:
          {
            return keyEq(key, node.key) ? node.value : alt;
          }

        case COLLISION:
          {
            if (hash === node.hash) {
              var children = node.children;

              for (var i = 0, len = children.length; i < len; ++i) {
                var child = children[i];
                if (keyEq(key, child.key)) return child.value;
              }
            }

            return alt;
          }

        case INDEX:
          {
            var frag = hashFragment(shift, hash);
            var bit = toBitmap(frag);

            if (node.mask & bit) {
              node = node.children[fromBitmap(node.mask, bit)];
              shift += SIZE;
              break;
            }

            return alt;
          }

        case ARRAY:
          {
            node = node.children[hashFragment(shift, hash)];

            if (node) {
              shift += SIZE;
              break;
            }

            return alt;
          }

        default:
          return alt;
      }
    }
  };

  Map.prototype.tryGetHash = function (alt, hash, key) {
    return tryGetHash(alt, hash, key, this);
  };
  /**
      Lookup the value for `key` in `map` using internal hash function.

      @see `tryGetHash`
  */


  var tryGet = hamt.tryGet = function (alt, key, map) {
    return tryGetHash(alt, map._config.hash(key), key, map);
  };

  Map.prototype.tryGet = function (alt, key) {
    return tryGet(alt, key, this);
  };
  /**
      Lookup the value for `key` in `map` using a custom `hash`.

      Returns the value or `undefined` if none.
  */


  var getHash = hamt.getHash = function (hash, key, map) {
    return tryGetHash(undefined, hash, key, map);
  };

  Map.prototype.getHash = function (hash, key) {
    return getHash(hash, key, this);
  };
  /**
      Lookup the value for `key` in `map` using internal hash function.

      @see `get`
  */


  var get = hamt.get = function (key, map) {
    return tryGetHash(undefined, map._config.hash(key), key, map);
  };

  Map.prototype.get = function (key, alt) {
    return tryGet(alt, key, this);
  };
  /**
      Does an entry exist for `key` in `map`? Uses custom `hash`.
  */


  var hasHash = hamt.has = function (hash, key, map) {
    return tryGetHash(nothing, hash, key, map) !== nothing;
  };

  Map.prototype.hasHash = function (hash, key) {
    return hasHash(hash, key, this);
  };
  /**
      Does an entry exist for `key` in `map`? Uses internal hash function.
  */


  var has = hamt.has = function (key, map) {
    return hasHash(map._config.hash(key), key, map);
  };

  Map.prototype.has = function (key) {
    return has(key, this);
  };

  var defKeyCompare = function defKeyCompare(x, y) {
    return x === y;
  };
  /**
      Create an empty map.

      @param config Configuration.
  */


  hamt.make = function (config) {
    return new Map(0, 0, {
      keyEq: config && config.keyEq || defKeyCompare,
      hash: config && config.hash || hash
    }, empty, 0);
  };
  /**
      Empty map.
  */


  hamt.empty = hamt.make();
  /**
      Does `map` contain any elements?
  */

  var isEmpty = hamt.isEmpty = function (map) {
    return map && !!isEmptyNode(map._root);
  };

  Map.prototype.isEmpty = function () {
    return isEmpty(this);
  };
  /* Updates
   ******************************************************************************/

  /**
      Alter the value stored for `key` in `map` using function `f` using
      custom hash.

      `f` is invoked with the current value for `k` if it exists,
      or no arguments if no such value exists. `modify` will always either
      update or insert a value into the map.

      Returns a map with the modified value. Does not alter `map`.
  */


  var modifyHash = hamt.modifyHash = function (f, hash, key, map) {
    var size = {
      value: map._size
    };

    var newRoot = map._root._modify(map._editable ? map._edit : NaN, map._config.keyEq, 0, f, hash, key, size);

    return map.setTree(newRoot, size.value);
  };

  Map.prototype.modifyHash = function (hash, key, f) {
    return modifyHash(f, hash, key, this);
  };
  /**
      Alter the value stored for `key` in `map` using function `f` using
      internal hash function.

      @see `modifyHash`
  */


  var modify = hamt.modify = function (f, key, map) {
    return modifyHash(f, map._config.hash(key), key, map);
  };

  Map.prototype.modify = function (key, f) {
    return modify(f, key, this);
  };
  /**
      Store `value` for `key` in `map` using custom `hash`.

      Returns a map with the modified value. Does not alter `map`.
  */


  var setHash = hamt.setHash = function (hash, key, value, map) {
    return modifyHash(constant(value), hash, key, map);
  };

  Map.prototype.setHash = function (hash, key, value) {
    return setHash(hash, key, value, this);
  };
  /**
      Store `value` for `key` in `map` using internal hash function.

      @see `setHash`
  */


  var set = hamt.set = function (key, value, map) {
    return setHash(map._config.hash(key), key, value, map);
  };

  Map.prototype.set = function (key, value) {
    return set(key, value, this);
  };
  /**
      Remove the entry for `key` in `map`.

      Returns a map with the value removed. Does not alter `map`.
  */


  var del = constant(nothing);

  var removeHash = hamt.removeHash = function (hash, key, map) {
    return modifyHash(del, hash, key, map);
  };

  Map.prototype.removeHash = Map.prototype.deleteHash = function (hash, key) {
    return removeHash(hash, key, this);
  };
  /**
      Remove the entry for `key` in `map` using internal hash function.

      @see `removeHash`
  */


  var remove = hamt.remove = function (key, map) {
    return removeHash(map._config.hash(key), key, map);
  };

  Map.prototype.remove = Map.prototype.delete = function (key) {
    return remove(key, this);
  };
  /* Mutation
   ******************************************************************************/

  /**
      Mark `map` as mutable.
   */


  var beginMutation = hamt.beginMutation = function (map) {
    return new Map(map._editable + 1, map._edit + 1, map._config, map._root, map._size);
  };

  Map.prototype.beginMutation = function () {
    return beginMutation(this);
  };
  /**
      Mark `map` as immutable.
   */


  var endMutation = hamt.endMutation = function (map) {
    map._editable = map._editable && map._editable - 1;
    return map;
  };

  Map.prototype.endMutation = function () {
    return endMutation(this);
  };
  /**
      Mutate `map` within the context of `f`.
      @param f
      @param map HAMT
  */


  var mutate = hamt.mutate = function (f, map) {
    var transient = beginMutation(map);
    f(transient);
    return endMutation(transient);
  };

  Map.prototype.mutate = function (f) {
    return mutate(f, this);
  };
  /* Traversal
   ******************************************************************************/

  /**
      Apply a continuation.
  */


  var appk = function appk(k) {
    return k && lazyVisitChildren(k[0], k[1], k[2], k[3], k[4]);
  };
  /**
      Recursively visit all values stored in an array of nodes lazily.
  */


  var lazyVisitChildren = function lazyVisitChildren(len, children, i, f, k) {
    while (i < len) {
      var child = children[i++];
      if (child && !isEmptyNode(child)) return lazyVisit(child, f, [len, children, i, f, k]);
    }

    return appk(k);
  };
  /**
      Recursively visit all values stored in `node` lazily.
  */


  var lazyVisit = function lazyVisit(node, f, k) {
    switch (node.type) {
      case LEAF:
        return {
          value: f(node),
          rest: k
        };

      case COLLISION:
      case ARRAY:
      case INDEX:
        var children = node.children;
        return lazyVisitChildren(children.length, children, 0, f, k);

      default:
        return appk(k);
    }
  };

  var DONE = {
    done: true
  };
  /**
      Javascript iterator over a map.
  */

  function MapIterator(v) {
    this.v = v;
  }

  MapIterator.prototype.next = function () {
    if (!this.v) return DONE;
    var v0 = this.v;
    this.v = appk(v0.rest);
    return v0;
  };

  MapIterator.prototype[Symbol.iterator] = function () {
    return this;
  };
  /**
      Lazily visit each value in map with function `f`.
  */


  var visit = function visit(map, f) {
    return new MapIterator(lazyVisit(map._root, f));
  };
  /**
      Get a Javascsript iterator of `map`.

      Iterates over `[key, value]` arrays.
  */


  var buildPairs = function buildPairs(x) {
    return [x.key, x.value];
  };

  var entries = hamt.entries = function (map) {
    return visit(map, buildPairs);
  };

  Map.prototype.entries = Map.prototype[Symbol.iterator] = function () {
    return entries(this);
  };
  /**
      Get array of all keys in `map`.

      Order is not guaranteed.
  */


  var buildKeys = function buildKeys(x) {
    return x.key;
  };

  var keys = hamt.keys = function (map) {
    return visit(map, buildKeys);
  };

  Map.prototype.keys = function () {
    return keys(this);
  };
  /**
      Get array of all values in `map`.

      Order is not guaranteed, duplicates are preserved.
  */


  var buildValues = function buildValues(x) {
    return x.value;
  };

  var values = hamt.values = Map.prototype.values = function (map) {
    return visit(map, buildValues);
  };

  Map.prototype.values = function () {
    return values(this);
  };
  /* Fold
   ******************************************************************************/

  /**
      Visit every entry in the map, aggregating data.

      Order of nodes is not guaranteed.

      @param f Function mapping accumulated value, value, and key to new value.
      @param z Starting value.
      @param m HAMT
  */


  var fold = hamt.fold = function (f, z, m) {
    var root = m._root;
    if (root.type === LEAF) return f(z, root.value, root.key);
    var toVisit = [root.children];
    var children = void 0;

    while (children = toVisit.pop()) {
      for (var i = 0, len = children.length; i < len;) {
        var child = children[i++];

        if (child && child.type) {
          if (child.type === LEAF) z = f(z, child.value, child.key);else toVisit.push(child.children);
        }
      }
    }

    return z;
  };

  Map.prototype.fold = function (f, z) {
    return fold(f, z, this);
  };
  /**
      Visit every entry in the map, aggregating data.

      Order of nodes is not guaranteed.

      @param f Function invoked with value and key
      @param map HAMT
  */


  var forEach = hamt.forEach = function (f, map) {
    return fold(function (_, value, key) {
      return f(value, key, map);
    }, null, map);
  };

  Map.prototype.forEach = function (f) {
    return forEach(f, this);
  };
  /* Aggregate
   ******************************************************************************/

  /**
      Get the number of entries in `map`.
  */


  var count = hamt.count = function (map) {
    return map._size;
  };

  Map.prototype.count = function () {
    return count(this);
  };

  Object.defineProperty(Map.prototype, 'size', {
    get: Map.prototype.count
  });
  /* Export
   ******************************************************************************/

  if ( module.exports) {
    module.exports = hamt;
  } else {
    undefined.hamt = hamt;
  }
  });

  class BuiltInMap {
    constructor(existing) {
      _defineProperty(this, "_map", void 0);

      this._map = new Map(existing === null || existing === void 0 ? void 0 : existing.entries());
    }

    keys() {
      return this._map.keys();
    }

    entries() {
      return this._map.entries();
    }

    get(k) {
      return this._map.get(k);
    }

    has(k) {
      return this._map.has(k);
    }

    set(k, v) {
      this._map.set(k, v);

      return this;
    }

    delete(k) {
      this._map.delete(k);

      return this;
    }

    clone() {
      return persistentMap(this);
    }

    toMap() {
      return new Map(this._map);
    }

  }

  class HashArrayMappedTrieMap {
    // Because hamt.empty is not a function there is no way to introduce type
    // parameters on it, so empty is typed as HAMTPlusMap<string, mixed>.
    // $FlowIssue
    constructor(existing) {
      _defineProperty(this, "_hamt", hamt_1.empty.beginMutation());

      if (existing instanceof HashArrayMappedTrieMap) {
        const h = existing._hamt.endMutation();

        existing._hamt = h.beginMutation();
        this._hamt = h.beginMutation();
      } else if (existing) {
        for (const [k, v] of existing.entries()) {
          this._hamt.set(k, v);
        }
      }
    }

    keys() {
      return this._hamt.keys();
    }

    entries() {
      return this._hamt.entries();
    }

    get(k) {
      return this._hamt.get(k);
    }

    has(k) {
      return this._hamt.has(k);
    }

    set(k, v) {
      this._hamt.set(k, v);

      return this;
    }

    delete(k) {
      this._hamt.delete(k);

      return this;
    }

    clone() {
      return persistentMap(this);
    }

    toMap() {
      return new Map(this._hamt);
    }

  }

  function persistentMap(existing) {
    if (Recoil_gkx('recoil_hamt_2020')) {
      return new HashArrayMappedTrieMap(existing);
    } else {
      return new BuiltInMap(existing);
    }
  }

  var Recoil_PersistentMap = {
    persistentMap
  };

  var Recoil_PersistentMap_1 = Recoil_PersistentMap.persistentMap;

  var Recoil_PersistentMap$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    persistentMap: Recoil_PersistentMap_1
  });

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */
  /**
   * Returns a set containing all of the values from the first set that are not
   * present in any of the subsequent sets.
   *
   * Note: this is written procedurally (i.e., without filterSet) for performant
   * use in tight loops.
   */

  function differenceSets(set, ...setsWithValuesToRemove) {
    const ret = new Set();

    FIRST: for (const value of set) {
      for (const otherSet of setsWithValuesToRemove) {
        if (otherSet.has(value)) {
          continue FIRST;
        }
      }

      ret.add(value);
    }

    return ret;
  }

  var Recoil_differenceSets = differenceSets;

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */
  /**
   * Returns a new Map object with the same keys as the original, but with the
   * values replaced with the output of the given callback function.
   */

  function mapMap(map, callback) {
    const result = new Map();
    map.forEach((value, key) => {
      result.set(key, callback(value, key));
    });
    return result;
  }

  var Recoil_mapMap = mapMap;

  function makeGraph() {
    return {
      nodeDeps: new Map(),
      nodeToNodeSubscriptions: new Map()
    };
  }

  function cloneGraph(graph) {
    return {
      nodeDeps: Recoil_mapMap(graph.nodeDeps, s => new Set(s)),
      nodeToNodeSubscriptions: Recoil_mapMap(graph.nodeToNodeSubscriptions, s => new Set(s))
    };
  } // Note that this overwrites the deps of existing nodes, rather than unioning
  // the new deps with the old deps.


  function mergeDepsIntoGraph(key, newDeps, graph, // If olderGraph is given then we will not overwrite changes made to the given
  // graph compared with olderGraph:
  olderGraph) {
    const {
      nodeDeps,
      nodeToNodeSubscriptions
    } = graph;
    const oldDeps = nodeDeps.get(key);

    if (oldDeps && olderGraph && oldDeps !== olderGraph.nodeDeps.get(key)) {
      return;
    } // Update nodeDeps:


    nodeDeps.set(key, newDeps); // Add new deps to nodeToNodeSubscriptions:

    const addedDeps = oldDeps == null ? newDeps : Recoil_differenceSets(newDeps, oldDeps);

    for (const dep of addedDeps) {
      if (!nodeToNodeSubscriptions.has(dep)) {
        nodeToNodeSubscriptions.set(dep, new Set());
      }

      const existing = Recoil_nullthrows(nodeToNodeSubscriptions.get(dep));
      existing.add(key);
    } // Remove removed deps from nodeToNodeSubscriptions:


    if (oldDeps) {
      const removedDeps = Recoil_differenceSets(oldDeps, newDeps);

      for (const dep of removedDeps) {
        if (!nodeToNodeSubscriptions.has(dep)) {
          return;
        }

        const existing = Recoil_nullthrows(nodeToNodeSubscriptions.get(dep));
        existing.delete(key);

        if (existing.size === 0) {
          nodeToNodeSubscriptions.delete(dep);
        }
      }
    }
  }

  function saveDepsToStore(key, deps, store, version) {
    var _storeState$nextTree, _storeState$previousT, _storeState$previousT2, _storeState$previousT3;

    const storeState = store.getState();

    if (!(version === storeState.currentTree.version || version === ((_storeState$nextTree = storeState.nextTree) === null || _storeState$nextTree === void 0 ? void 0 : _storeState$nextTree.version) || version === ((_storeState$previousT = storeState.previousTree) === null || _storeState$previousT === void 0 ? void 0 : _storeState$previousT.version))) {
      Recoil_recoverableViolation('Tried to save dependencies to a discarded tree');
    } // Merge the dependencies discovered into the store's dependency map
    // for the version that was read:


    const graph = store.getGraph(version);
    mergeDepsIntoGraph(key, deps, graph); // If this version is not the latest version, also write these dependencies
    // into later versions if they don't already have their own:

    if (version === ((_storeState$previousT2 = storeState.previousTree) === null || _storeState$previousT2 === void 0 ? void 0 : _storeState$previousT2.version)) {
      const currentGraph = store.getGraph(storeState.currentTree.version);
      mergeDepsIntoGraph(key, deps, currentGraph, graph);
    }

    if (version === ((_storeState$previousT3 = storeState.previousTree) === null || _storeState$previousT3 === void 0 ? void 0 : _storeState$previousT3.version) || version === storeState.currentTree.version) {
      var _storeState$nextTree2;

      const nextVersion = (_storeState$nextTree2 = storeState.nextTree) === null || _storeState$nextTree2 === void 0 ? void 0 : _storeState$nextTree2.version;

      if (nextVersion !== undefined) {
        const nextGraph = store.getGraph(nextVersion);
        mergeDepsIntoGraph(key, deps, nextGraph, graph);
      }
    }
  }

  var Recoil_Graph = {
    cloneGraph,
    graph: makeGraph,
    saveDepsToStore
  };

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  let nextTreeStateVersion = 0;

  const getNextTreeStateVersion = () => nextTreeStateVersion++;

  let nextStoreID = 0;

  const getNextStoreID = () => nextStoreID++;

  let nextComponentID = 0;

  const getNextComponentID = () => nextComponentID++;

  var Recoil_Keys = {
    getNextTreeStateVersion,
    getNextStoreID,
    getNextComponentID
  };

  const {
    persistentMap: persistentMap$1
  } = Recoil_PersistentMap$1;

  const {
    graph
  } = Recoil_Graph;

  const {
    getNextTreeStateVersion: getNextTreeStateVersion$1
  } = Recoil_Keys;

  function makeEmptyTreeState() {
    const version = getNextTreeStateVersion$1();
    return {
      version,
      stateID: version,
      transactionMetadata: {},
      dirtyAtoms: new Set(),
      atomValues: persistentMap$1(),
      nonvalidatedAtoms: persistentMap$1()
    };
  }

  function makeEmptyStoreState() {
    const currentTree = makeEmptyTreeState();
    return {
      currentTree,
      nextTree: null,
      previousTree: null,
      commitDepth: 0,
      knownAtoms: new Set(),
      knownSelectors: new Set(),
      transactionSubscriptions: new Map(),
      nodeTransactionSubscriptions: new Map(),
      nodeToComponentSubscriptions: new Map(),
      queuedComponentCallbacks_DEPRECATED: [],
      suspendedComponentResolvers: new Set(),
      graphsByVersion: new Map().set(currentTree.version, graph()),
      retention: {
        referenceCounts: new Map(),
        nodesRetainedByZone: new Map(),
        retainablesToCheckForRelease: new Set()
      },
      nodeCleanupFunctions: new Map()
    };
  }

  var Recoil_State = {
    makeEmptyTreeState,
    makeEmptyStoreState,
    getNextTreeStateVersion: getNextTreeStateVersion$1
  };

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  class RetentionZone {}

  function retentionZone() {
    return new RetentionZone();
  }

  var Recoil_RetentionZone = {
    RetentionZone,
    retentionZone
  };

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * Utilities for working with built-in Maps and Sets without mutating them.
   *
   * 
   * @format
   * @oncall recoil
   */

  function setByAddingToSet(set, v) {
    const next = new Set(set);
    next.add(v);
    return next;
  }

  function setByDeletingFromSet(set, v) {
    const next = new Set(set);
    next.delete(v);
    return next;
  }

  function mapBySettingInMap(map, k, v) {
    const next = new Map(map);
    next.set(k, v);
    return next;
  }

  function mapByUpdatingInMap(map, k, updater) {
    const next = new Map(map);
    next.set(k, updater(next.get(k)));
    return next;
  }

  function mapByDeletingFromMap(map, k) {
    const next = new Map(map);
    next.delete(k);
    return next;
  }

  function mapByDeletingMultipleFromMap(map, ks) {
    const next = new Map(map);
    ks.forEach(k => next.delete(k));
    return next;
  }

  var Recoil_CopyOnWrite = {
    setByAddingToSet,
    setByDeletingFromSet,
    mapBySettingInMap,
    mapByUpdatingInMap,
    mapByDeletingFromMap,
    mapByDeletingMultipleFromMap
  };

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */
  /**
   * Creates a new iterable whose output is generated by passing the input
   * iterable's values through the filter function.
   */

  function* filterIterable(iterable, predicate) {
    // Use generator to create iterable/iterator
    let index = 0;

    for (const value of iterable) {
      if (predicate(value, index++)) {
        yield value;
      }
    }
  }

  var Recoil_filterIterable = filterIterable;

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */
  /**
   * Return a proxy object based on the provided base and factories objects.
   * The proxy will include all properties of the base object as-is.
   * The factories object contains callbacks to obtain the values of the properies
   * for its keys.
   *
   * This is useful for providing users an object where some properties may be
   * lazily computed only on first access.
   */
  // $FlowIssue[unclear-type]

  function lazyProxy(base, factories) {
    const proxy = new Proxy(base, {
      // Compute and cache lazy property if not already done.
      get: (target, prop) => {
        if (!(prop in target) && prop in factories) {
          target[prop] = factories[prop]();
        }

        return target[prop];
      },
      // This method allows user to iterate keys as normal
      ownKeys: target => {

        return Object.keys(target);
      }
    }); // $FlowIssue[incompatible-return]

    return proxy;
  }

  var Recoil_lazyProxy = lazyProxy;

  const {
    getNode: getNode$1,
    getNodeMaybe: getNodeMaybe$1,
    recoilValuesForKeys: recoilValuesForKeys$1
  } = Recoil_Node;

  const {
    RetentionZone: RetentionZone$1
  } = Recoil_RetentionZone;

  const {
    setByAddingToSet: setByAddingToSet$1
  } = Recoil_CopyOnWrite;







   // flowlint-next-line unclear-type:off


  const emptySet = Object.freeze(new Set());

  class ReadOnlyRecoilValueError extends Error {}

  function initializeRetentionForNode(store, nodeKey, retainedBy) {
    if (!Recoil_gkx('recoil_memory_managament_2020')) {
      return () => undefined;
    }

    const {
      nodesRetainedByZone
    } = store.getState().retention;

    function addToZone(zone) {
      let set = nodesRetainedByZone.get(zone);

      if (!set) {
        nodesRetainedByZone.set(zone, set = new Set());
      }

      set.add(nodeKey);
    }

    if (retainedBy instanceof RetentionZone$1) {
      addToZone(retainedBy);
    } else if (Array.isArray(retainedBy)) {
      for (const zone of retainedBy) {
        addToZone(zone);
      }
    }

    return () => {
      if (!Recoil_gkx('recoil_memory_managament_2020')) {
        return;
      }

      const {
        retention
      } = store.getState();

      function deleteFromZone(zone) {
        const set = retention.nodesRetainedByZone.get(zone);
        set === null || set === void 0 ? void 0 : set.delete(nodeKey);

        if (set && set.size === 0) {
          retention.nodesRetainedByZone.delete(zone);
        }
      }

      if (retainedBy instanceof RetentionZone$1) {
        deleteFromZone(retainedBy);
      } else if (Array.isArray(retainedBy)) {
        for (const zone of retainedBy) {
          deleteFromZone(zone);
        }
      }
    };
  }

  function initializeNodeIfNewToStore(store, treeState, key, trigger) {
    const storeState = store.getState();

    if (storeState.nodeCleanupFunctions.has(key)) {
      return;
    }

    const node = getNode$1(key);
    const retentionCleanup = initializeRetentionForNode(store, key, node.retainedBy);
    const nodeCleanup = node.init(store, treeState, trigger);
    storeState.nodeCleanupFunctions.set(key, () => {
      nodeCleanup();
      retentionCleanup();
    });
  }

  function initializeNode(store, key, trigger) {
    initializeNodeIfNewToStore(store, store.getState().currentTree, key, trigger);
  }

  function cleanUpNode(store, key) {
    var _state$nodeCleanupFun;

    const state = store.getState();
    (_state$nodeCleanupFun = state.nodeCleanupFunctions.get(key)) === null || _state$nodeCleanupFun === void 0 ? void 0 : _state$nodeCleanupFun();
    state.nodeCleanupFunctions.delete(key);
  } // Get the current value loadable of a node and update the state.
  // Update dependencies and subscriptions for selectors.
  // Update saved value validation for atoms.


  function getNodeLoadable(store, state, key) {
    initializeNodeIfNewToStore(store, state, key, 'get');
    return getNode$1(key).get(store, state);
  } // Peek at the current value loadable for a node without any evaluation or state change


  function peekNodeLoadable(store, state, key) {
    return getNode$1(key).peek(store, state);
  } // Write value directly to state bypassing the Node interface as the node
  // definitions may not have been loaded yet when processing the initial snapshot.


  function setUnvalidatedAtomValue_DEPRECATED(state, key, newValue) {
    var _node$invalidate;

    const node = getNodeMaybe$1(key);
    node === null || node === void 0 ? void 0 : (_node$invalidate = node.invalidate) === null || _node$invalidate === void 0 ? void 0 : _node$invalidate.call(node, state);
    return { ...state,
      atomValues: state.atomValues.clone().delete(key),
      nonvalidatedAtoms: state.nonvalidatedAtoms.clone().set(key, newValue),
      dirtyAtoms: setByAddingToSet$1(state.dirtyAtoms, key)
    };
  } // Return the discovered dependencies and values to be written by setting
  // a node value. (Multiple values may be written due to selectors getting to
  // set upstreams; deps may be discovered because of reads in updater functions.)


  function setNodeValue(store, state, key, newValue) {
    const node = getNode$1(key);

    if (node.set == null) {
      throw new ReadOnlyRecoilValueError(`Attempt to set read-only RecoilValue: ${key}`);
    }

    const set = node.set; // so flow doesn't lose the above refinement.

    initializeNodeIfNewToStore(store, state, key, 'set');
    return set(store, state, newValue);
  }

  function peekNodeInfo(store, state, key) {
    const storeState = store.getState();
    const graph = store.getGraph(state.version);
    const type = getNode$1(key).nodeType;
    return Recoil_lazyProxy({
      type
    }, {
      // $FlowFixMe[underconstrained-implicit-instantiation]
      loadable: () => peekNodeLoadable(store, state, key),
      isActive: () => storeState.knownAtoms.has(key) || storeState.knownSelectors.has(key),
      isSet: () => type === 'selector' ? false : state.atomValues.has(key),
      isModified: () => state.dirtyAtoms.has(key),
      // Report current dependencies.  If the node hasn't been evaluated, then
      // dependencies may be missing based on the current state.
      deps: () => {
        var _graph$nodeDeps$get;

        return recoilValuesForKeys$1((_graph$nodeDeps$get = graph.nodeDeps.get(key)) !== null && _graph$nodeDeps$get !== void 0 ? _graph$nodeDeps$get : []);
      },
      // Reports all "current" subscribers.  Evaluating other nodes or
      // previous in-progress async evaluations may introduce new subscribers.
      subscribers: () => {
        var _storeState$nodeToCom, _storeState$nodeToCom2;

        return {
          nodes: recoilValuesForKeys$1(Recoil_filterIterable(getDownstreamNodes(store, state, new Set([key])), nodeKey => nodeKey !== key)),
          components: Recoil_mapIterable((_storeState$nodeToCom = (_storeState$nodeToCom2 = storeState.nodeToComponentSubscriptions.get(key)) === null || _storeState$nodeToCom2 === void 0 ? void 0 : _storeState$nodeToCom2.values()) !== null && _storeState$nodeToCom !== void 0 ? _storeState$nodeToCom : [], ([name]) => ({
            name
          }))
        };
      }
    });
  } // Find all of the recursively dependent nodes


  function getDownstreamNodes(store, state, keys) {
    const visitedNodes = new Set();
    const visitingNodes = Array.from(keys);
    const graph = store.getGraph(state.version);

    for (let key = visitingNodes.pop(); key; key = visitingNodes.pop()) {
      var _graph$nodeToNodeSubs;

      visitedNodes.add(key);
      const subscribedNodes = (_graph$nodeToNodeSubs = graph.nodeToNodeSubscriptions.get(key)) !== null && _graph$nodeToNodeSubs !== void 0 ? _graph$nodeToNodeSubs : emptySet;

      for (const downstreamNode of subscribedNodes) {
        if (!visitedNodes.has(downstreamNode)) {
          visitingNodes.push(downstreamNode);
        }
      }
    }

    return visitedNodes;
  }

  var Recoil_FunctionalCore = {
    getNodeLoadable,
    peekNodeLoadable,
    setNodeValue,
    initializeNode,
    cleanUpNode,
    setUnvalidatedAtomValue_DEPRECATED,
    peekNodeInfo,
    getDownstreamNodes
  };

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  let _invalidateMemoizedSnapshot = null;

  function setInvalidateMemoizedSnapshot(invalidate) {
    _invalidateMemoizedSnapshot = invalidate;
  }

  function invalidateMemoizedSnapshot() {
    var _invalidateMemoizedSn;

    (_invalidateMemoizedSn = _invalidateMemoizedSnapshot) === null || _invalidateMemoizedSn === void 0 ? void 0 : _invalidateMemoizedSn();
  }

  var Recoil_SnapshotCache = {
    setInvalidateMemoizedSnapshot,
    invalidateMemoizedSnapshot
  };

  const {
    getDownstreamNodes: getDownstreamNodes$1,
    getNodeLoadable: getNodeLoadable$1,
    setNodeValue: setNodeValue$1
  } = Recoil_FunctionalCore;

  const {
    getNextComponentID: getNextComponentID$1
  } = Recoil_Keys;

  const {
    getNode: getNode$2,
    getNodeMaybe: getNodeMaybe$2
  } = Recoil_Node;

  const {
    DefaultValue: DefaultValue$1
  } = Recoil_Node;

  const {
    reactMode: reactMode$1
  } = Recoil_ReactMode;

  const {
    AbstractRecoilValue: AbstractRecoilValue$1,
    RecoilState: RecoilState$1,
    RecoilValueReadOnly: RecoilValueReadOnly$1,
    isRecoilValue: isRecoilValue$1
  } = Recoil_RecoilValue$1;

  const {
    invalidateMemoizedSnapshot: invalidateMemoizedSnapshot$1
  } = Recoil_SnapshotCache;







  function getRecoilValueAsLoadable(store, {
    key
  }, treeState = store.getState().currentTree) {
    var _storeState$nextTree, _storeState$previousT;

    // Reading from an older tree can cause bugs because the dependencies that we
    // discover during the read are lost.
    const storeState = store.getState();

    if (!(treeState.version === storeState.currentTree.version || treeState.version === ((_storeState$nextTree = storeState.nextTree) === null || _storeState$nextTree === void 0 ? void 0 : _storeState$nextTree.version) || treeState.version === ((_storeState$previousT = storeState.previousTree) === null || _storeState$previousT === void 0 ? void 0 : _storeState$previousT.version))) {
      Recoil_recoverableViolation('Tried to read from a discarded tree');
    }

    const loadable = getNodeLoadable$1(store, treeState, key);

    if (loadable.state === 'loading') {
      loadable.contents.catch(() => {
        /**
         * HACK: intercept thrown error here to prevent an uncaught promise exception. Ideally this would happen closer to selector
         * execution (perhaps introducing a new ERROR class to be resolved by async selectors that are in an error state)
         */
        return;
      });
    }

    return loadable;
  }

  function applyAtomValueWrites(atomValues, writes) {
    const result = atomValues.clone();
    writes.forEach((v, k) => {
      if (v.state === 'hasValue' && v.contents instanceof DefaultValue$1) {
        result.delete(k);
      } else {
        result.set(k, v);
      }
    });
    return result;
  }

  function valueFromValueOrUpdater(store, state, {
    key
  }, valueOrUpdater) {
    if (typeof valueOrUpdater === 'function') {
      // Updater form: pass in the current value. Throw if the current value
      // is unavailable (namely when updating an async selector that's
      // pending or errored):
      const current = getNodeLoadable$1(store, state, key);

      if (current.state === 'loading') {
        const msg = `Tried to set atom or selector "${key}" using an updater function while the current state is pending, this is not currently supported.`;
        Recoil_recoverableViolation(msg);
        throw Recoil_err(msg);
      } else if (current.state === 'hasError') {
        throw current.contents;
      } // T itself may be a function, so our refinement is not sufficient:


      return valueOrUpdater(current.contents); // flowlint-line unclear-type:off
    } else {
      return valueOrUpdater;
    }
  }

  function applyAction(store, state, action) {
    if (action.type === 'set') {
      const {
        recoilValue,
        valueOrUpdater
      } = action;
      const newValue = valueFromValueOrUpdater(store, state, recoilValue, valueOrUpdater);
      const writes = setNodeValue$1(store, state, recoilValue.key, newValue);

      for (const [key, loadable] of writes.entries()) {
        writeLoadableToTreeState(state, key, loadable);
      }
    } else if (action.type === 'setLoadable') {
      const {
        recoilValue: {
          key
        },
        loadable
      } = action;
      writeLoadableToTreeState(state, key, loadable);
    } else if (action.type === 'markModified') {
      const {
        recoilValue: {
          key
        }
      } = action;
      state.dirtyAtoms.add(key);
    } else if (action.type === 'setUnvalidated') {
      var _node$invalidate;

      // Write value directly to state bypassing the Node interface as the node
      // definitions may not have been loaded yet when processing the initial snapshot.
      const {
        recoilValue: {
          key
        },
        unvalidatedValue
      } = action;
      const node = getNodeMaybe$2(key);
      node === null || node === void 0 ? void 0 : (_node$invalidate = node.invalidate) === null || _node$invalidate === void 0 ? void 0 : _node$invalidate.call(node, state);
      state.atomValues.delete(key);
      state.nonvalidatedAtoms.set(key, unvalidatedValue);
      state.dirtyAtoms.add(key);
    } else {
      Recoil_recoverableViolation(`Unknown action ${action.type}`);
    }
  }

  function writeLoadableToTreeState(state, key, loadable) {
    if (loadable.state === 'hasValue' && loadable.contents instanceof DefaultValue$1) {
      state.atomValues.delete(key);
    } else {
      state.atomValues.set(key, loadable);
    }

    state.dirtyAtoms.add(key);
    state.nonvalidatedAtoms.delete(key);
  }

  function applyActionsToStore(store, actions) {
    store.replaceState(state => {
      const newState = copyTreeState(state);

      for (const action of actions) {
        applyAction(store, newState, action);
      }

      invalidateDownstreams(store, newState);
      invalidateMemoizedSnapshot$1();
      return newState;
    });
  }

  function queueOrPerformStateUpdate(store, action) {
    if (batchStack.length) {
      const actionsByStore = batchStack[batchStack.length - 1];
      let actions = actionsByStore.get(store);

      if (!actions) {
        actionsByStore.set(store, actions = []);
      }

      actions.push(action);
    } else {
      applyActionsToStore(store, [action]);
    }
  }

  const batchStack = [];

  function batchStart() {
    const actionsByStore = new Map();
    batchStack.push(actionsByStore);
    return () => {
      for (const [store, actions] of actionsByStore) {
        applyActionsToStore(store, actions);
      }

      const popped = batchStack.pop();

      if (popped !== actionsByStore) {
        Recoil_recoverableViolation('Incorrect order of batch popping');
      }
    };
  }

  function copyTreeState(state) {
    return { ...state,
      atomValues: state.atomValues.clone(),
      nonvalidatedAtoms: state.nonvalidatedAtoms.clone(),
      dirtyAtoms: new Set(state.dirtyAtoms)
    };
  }

  function invalidateDownstreams(store, state) {
    // Inform any nodes that were changed or downstream of changes so that they
    // can clear out any caches as needed due to the update:
    const downstreams = getDownstreamNodes$1(store, state, state.dirtyAtoms);

    for (const key of downstreams) {
      var _getNodeMaybe, _getNodeMaybe$invalid;

      (_getNodeMaybe = getNodeMaybe$2(key)) === null || _getNodeMaybe === void 0 ? void 0 : (_getNodeMaybe$invalid = _getNodeMaybe.invalidate) === null || _getNodeMaybe$invalid === void 0 ? void 0 : _getNodeMaybe$invalid.call(_getNodeMaybe, state);
    }
  }

  function setRecoilValue(store, recoilValue, valueOrUpdater) {
    queueOrPerformStateUpdate(store, {
      type: 'set',
      recoilValue,
      valueOrUpdater
    });
  }

  function setRecoilValueLoadable(store, recoilValue, loadable) {
    if (loadable instanceof DefaultValue$1) {
      return setRecoilValue(store, recoilValue, loadable);
    }

    queueOrPerformStateUpdate(store, {
      type: 'setLoadable',
      recoilValue,
      loadable: loadable
    });
  }

  function markRecoilValueModified(store, recoilValue) {
    queueOrPerformStateUpdate(store, {
      type: 'markModified',
      recoilValue
    });
  }

  function setUnvalidatedRecoilValue(store, recoilValue, unvalidatedValue) {
    queueOrPerformStateUpdate(store, {
      type: 'setUnvalidated',
      recoilValue,
      unvalidatedValue
    });
  }

  function subscribeToRecoilValue(store, {
    key
  }, callback, componentDebugName = null) {
    const subID = getNextComponentID$1();
    const storeState = store.getState();

    if (!storeState.nodeToComponentSubscriptions.has(key)) {
      storeState.nodeToComponentSubscriptions.set(key, new Map());
    }

    Recoil_nullthrows(storeState.nodeToComponentSubscriptions.get(key)).set(subID, [componentDebugName !== null && componentDebugName !== void 0 ? componentDebugName : '<not captured>', callback]); // Handle the case that, during the same tick that we are subscribing, an atom
    // has been updated by some effect handler. Otherwise we will miss the update.

    const mode = reactMode$1();

    if (mode.early && (mode.mode === 'LEGACY' || mode.mode === 'MUTABLE_SOURCE')) {
      const nextTree = store.getState().nextTree;

      if (nextTree && nextTree.dirtyAtoms.has(key)) {
        callback(nextTree);
      }
    }

    return {
      release: () => {
        const releaseStoreState = store.getState();
        const subs = releaseStoreState.nodeToComponentSubscriptions.get(key);

        if (subs === undefined || !subs.has(subID)) {
          Recoil_recoverableViolation(`Subscription missing at release time for atom ${key}. This is a bug in Recoil.`);
          return;
        }

        subs.delete(subID);

        if (subs.size === 0) {
          releaseStoreState.nodeToComponentSubscriptions.delete(key);
        }
      }
    };
  }

  function refreshRecoilValue(store, recoilValue) {
    var _node$clearCache;

    const {
      currentTree
    } = store.getState();
    const node = getNode$2(recoilValue.key);
    (_node$clearCache = node.clearCache) === null || _node$clearCache === void 0 ? void 0 : _node$clearCache.call(node, store, currentTree);
  }

  var Recoil_RecoilValueInterface = {
    RecoilValueReadOnly: RecoilValueReadOnly$1,
    AbstractRecoilValue: AbstractRecoilValue$1,
    RecoilState: RecoilState$1,
    getRecoilValueAsLoadable,
    setRecoilValue,
    setRecoilValueLoadable,
    markRecoilValueModified,
    setUnvalidatedRecoilValue,
    subscribeToRecoilValue,
    isRecoilValue: isRecoilValue$1,
    applyAtomValueWrites,
    // TODO Remove export when deprecating initialStoreState_DEPRECATED in RecoilRoot
    batchStart,
    writeLoadableToTreeState,
    invalidateDownstreams,
    copyTreeState,
    refreshRecoilValue
  };

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */
  /**
   * The someSet() method tests whether some elements in the given Set pass the
   * test implemented by the provided function.
   */

  function someSet(set, callback, context) {
    const iterator = set.entries();
    let current = iterator.next();

    while (!current.done) {
      const entry = current.value;

      if (callback.call(context, entry[1], entry[0], set)) {
        return true;
      }

      current = iterator.next();
    }

    return false;
  }

  var Recoil_someSet = someSet;

  const {
    cleanUpNode: cleanUpNode$1
  } = Recoil_FunctionalCore;

  const {
    deleteNodeConfigIfPossible: deleteNodeConfigIfPossible$1,
    getNode: getNode$3
  } = Recoil_Node;

  const {
    RetentionZone: RetentionZone$2
  } = Recoil_RetentionZone;







   // Components that aren't mounted after suspending for this long will be assumed
  // to be discarded and their resources released.


  const SUSPENSE_TIMEOUT_MS = 120000;
  const emptySet$1 = new Set();

  function releaseRetainablesNowOnCurrentTree(store, retainables) {
    const storeState = store.getState();
    const treeState = storeState.currentTree;

    if (storeState.nextTree) {
      Recoil_recoverableViolation('releaseNodesNowOnCurrentTree should only be called at the end of a batch');
      return; // leak memory rather than erase something that's about to be used.
    }

    const nodes = new Set();

    for (const r of retainables) {
      if (r instanceof RetentionZone$2) {
        for (const n of nodesRetainedByZone(storeState, r)) {
          nodes.add(n);
        }
      } else {
        nodes.add(r);
      }
    }

    const releasableNodes = findReleasableNodes(store, nodes);

    for (const node of releasableNodes) {
      releaseNode(store, treeState, node);
    }
  }

  function findReleasableNodes(store, searchFromNodes) {
    const storeState = store.getState();
    const treeState = storeState.currentTree;
    const graph = store.getGraph(treeState.version);
    const releasableNodes = new Set(); // mutated to collect answer

    const nonReleasableNodes = new Set();
    findReleasableNodesInner(searchFromNodes);
    return releasableNodes;

    function findReleasableNodesInner(searchFromNodes) {
      const releasableNodesFoundThisIteration = new Set();
      const downstreams = getDownstreamNodesInTopologicalOrder(store, treeState, searchFromNodes, releasableNodes, // don't descend into these
      nonReleasableNodes // don't descend into these
      ); // Find which of the downstream nodes are releasable and which are not:

      for (const node of downstreams) {
        var _storeState$retention;

        // Not releasable if configured to be retained forever:
        if (getNode$3(node).retainedBy === 'recoilRoot') {
          nonReleasableNodes.add(node);
          continue;
        } // Not releasable if retained directly by a component:


        if (((_storeState$retention = storeState.retention.referenceCounts.get(node)) !== null && _storeState$retention !== void 0 ? _storeState$retention : 0) > 0) {
          nonReleasableNodes.add(node);
          continue;
        } // Not releasable if retained by a zone:


        if (zonesThatCouldRetainNode(node).some(z => storeState.retention.referenceCounts.get(z))) {
          nonReleasableNodes.add(node);
          continue;
        } // Not releasable if it has a non-releasable child (which will already be in
        // nonReleasableNodes because we are going in topological order):


        const nodeChildren = graph.nodeToNodeSubscriptions.get(node);

        if (nodeChildren && Recoil_someSet(nodeChildren, child => nonReleasableNodes.has(child))) {
          nonReleasableNodes.add(node);
          continue;
        }

        releasableNodes.add(node);
        releasableNodesFoundThisIteration.add(node);
      } // If we found any releasable nodes, we need to walk UP from those nodes to
      // find whether their parents can now be released as well:


      const parents = new Set();

      for (const node of releasableNodesFoundThisIteration) {
        for (const parent of (_graph$nodeDeps$get = graph.nodeDeps.get(node)) !== null && _graph$nodeDeps$get !== void 0 ? _graph$nodeDeps$get : emptySet$1) {
          var _graph$nodeDeps$get;

          if (!releasableNodes.has(parent)) {
            parents.add(parent);
          }
        }
      }

      if (parents.size) {
        findReleasableNodesInner(parents);
      }
    }
  } // Children before parents


  function getDownstreamNodesInTopologicalOrder(store, treeState, nodes, // Mutable set is destroyed in place
  doNotDescendInto1, doNotDescendInto2) {
    const graph = store.getGraph(treeState.version);
    const answer = [];
    const visited = new Set();

    while (nodes.size > 0) {
      visit(Recoil_nullthrows(nodes.values().next().value));
    }

    return answer;

    function visit(node) {
      if (doNotDescendInto1.has(node) || doNotDescendInto2.has(node)) {
        nodes.delete(node);
        return;
      }

      if (visited.has(node)) {
        return;
      }

      const children = graph.nodeToNodeSubscriptions.get(node);

      if (children) {
        for (const child of children) {
          visit(child);
        }
      }

      visited.add(node);
      nodes.delete(node);
      answer.push(node);
    }
  }

  function releaseNode(store, treeState, node) {
    if (!Recoil_gkx('recoil_memory_managament_2020')) {
      return;
    } // Atom effects, in-closure caches, etc.:


    cleanUpNode$1(store, node); // Delete from store state:

    const storeState = store.getState();
    storeState.knownAtoms.delete(node);
    storeState.knownSelectors.delete(node);
    storeState.nodeTransactionSubscriptions.delete(node);
    storeState.retention.referenceCounts.delete(node);
    const zones = zonesThatCouldRetainNode(node);

    for (const zone of zones) {
      var _storeState$retention2;

      (_storeState$retention2 = storeState.retention.nodesRetainedByZone.get(zone)) === null || _storeState$retention2 === void 0 ? void 0 : _storeState$retention2.delete(node);
    } // Note that we DO NOT delete from nodeToComponentSubscriptions because this
    // already happens when the last component that was retaining the node unmounts,
    // and this could happen either before or after that.
    // Delete from TreeState and dep graph:


    treeState.atomValues.delete(node);
    treeState.dirtyAtoms.delete(node);
    treeState.nonvalidatedAtoms.delete(node);
    const graph = storeState.graphsByVersion.get(treeState.version);

    if (graph) {
      const deps = graph.nodeDeps.get(node);

      if (deps !== undefined) {
        graph.nodeDeps.delete(node);

        for (const dep of deps) {
          var _graph$nodeToNodeSubs;

          (_graph$nodeToNodeSubs = graph.nodeToNodeSubscriptions.get(dep)) === null || _graph$nodeToNodeSubs === void 0 ? void 0 : _graph$nodeToNodeSubs.delete(node);
        }
      } // No need to delete sub's deps as there should be no subs at this point.
      // But an invariant would require deleting nodes in topological order.


      graph.nodeToNodeSubscriptions.delete(node);
    } // Node config (for family members only as their configs can be recreated, and
    // only if they are not retained within any other Stores):


    deleteNodeConfigIfPossible$1(node);
  }

  function nodesRetainedByZone(storeState, zone) {
    var _storeState$retention3;

    return (_storeState$retention3 = storeState.retention.nodesRetainedByZone.get(zone)) !== null && _storeState$retention3 !== void 0 ? _storeState$retention3 : emptySet$1;
  }

  function zonesThatCouldRetainNode(node) {
    const retainedBy = getNode$3(node).retainedBy;

    if (retainedBy === undefined || retainedBy === 'components' || retainedBy === 'recoilRoot') {
      return [];
    } else if (retainedBy instanceof RetentionZone$2) {
      return [retainedBy];
    } else {
      return retainedBy; // it's an array of zones
    }
  }

  function scheduleOrPerformPossibleReleaseOfRetainable(store, retainable) {
    const state = store.getState();

    if (state.nextTree) {
      state.retention.retainablesToCheckForRelease.add(retainable);
    } else {
      releaseRetainablesNowOnCurrentTree(store, new Set([retainable]));
    }
  }

  function updateRetainCount(store, retainable, delta) {
    var _map$get;

    if (!Recoil_gkx('recoil_memory_managament_2020')) {
      return;
    }

    const map = store.getState().retention.referenceCounts;
    const newCount = ((_map$get = map.get(retainable)) !== null && _map$get !== void 0 ? _map$get : 0) + delta;

    if (newCount === 0) {
      updateRetainCountToZero(store, retainable);
    } else {
      map.set(retainable, newCount);
    }
  }

  function updateRetainCountToZero(store, retainable) {
    if (!Recoil_gkx('recoil_memory_managament_2020')) {
      return;
    }

    const map = store.getState().retention.referenceCounts;
    map.delete(retainable);
    scheduleOrPerformPossibleReleaseOfRetainable(store, retainable);
  }

  function releaseScheduledRetainablesNow(store) {
    if (!Recoil_gkx('recoil_memory_managament_2020')) {
      return;
    }

    const state = store.getState();
    releaseRetainablesNowOnCurrentTree(store, state.retention.retainablesToCheckForRelease);
    state.retention.retainablesToCheckForRelease.clear();
  }

  function retainedByOptionWithDefault(r) {
    // The default will change from 'recoilRoot' to 'components' in the future.
    return r === undefined ? 'recoilRoot' : r;
  }

  var Recoil_Retention = {
    SUSPENSE_TIMEOUT_MS,
    updateRetainCount,
    updateRetainCountToZero,
    releaseScheduledRetainablesNow,
    retainedByOptionWithDefault
  };

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * This is to export esstiential functions from react-dom
   * for our web build
   *
   * 
   * @format
   * @oncall recoil
   */
  const {
    unstable_batchedUpdates
  } = reactDom;

  var ReactBatchedUpdates = {
    unstable_batchedUpdates
  };

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * This is to export esstiential functions from react-dom
   * for our web build
   *
   * 
   * @format
   * @oncall recoil
   */
  // @fb-only: const {unstable_batchedUpdates} = require('ReactDOMComet');
  // prettier-ignore
  const {
    unstable_batchedUpdates: unstable_batchedUpdates$1
  } = ReactBatchedUpdates; // @oss-only


  var Recoil_ReactBatchedUpdates = {
    unstable_batchedUpdates: unstable_batchedUpdates$1
  };

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */
  const {
    batchStart: batchStart$1
  } = Recoil_RecoilValueInterface;

  const {
    unstable_batchedUpdates: unstable_batchedUpdates$2
  } = Recoil_ReactBatchedUpdates; // flowlint-next-line unclear-type:off


  /*
   * During SSR, unstable_batchedUpdates may be undefined so this
   * falls back to a basic function that executes the batch
   */
  let batcher = unstable_batchedUpdates$2 || (batchFn => batchFn());
  /**
   * Sets the provided batcher function as the batcher function used by Recoil.
   *
   * Set the batcher to a custom batcher for your renderer,
   * if you use a renderer other than React DOM or React Native.
   */


  const setBatcher = newBatcher => {
    batcher = newBatcher;
  };
  /**
   * Returns the current batcher function.
   */


  const getBatcher = () => batcher;
  /**
   * Calls the current batcher function and passes the
   * provided callback function.
   */


  const batchUpdates = callback => {
    batcher(() => {
      let batchEnd = () => undefined;

      try {
        batchEnd = batchStart$1();
        callback();
      } finally {
        batchEnd();
      }
    });
  };

  var Recoil_Batching = {
    getBatcher,
    setBatcher,
    batchUpdates
  };

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */
  /**
   * Combines multiple Iterables into a single Iterable.
   * Traverses the input Iterables in the order provided and maintains the order
   * of their elements.
   *
   * Example:
   * ```
   * const r = Array.from(concatIterables(['a', 'b'], ['c'], ['d', 'e', 'f']));
   * r == ['a', 'b', 'c', 'd', 'e', 'f'];
   * ```
   */

  function* concatIterables(iters) {
    for (const iter of iters) {
      for (const val of iter) {
        yield val;
      }
    }
  }

  var Recoil_concatIterables = concatIterables;

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */
  /* eslint-disable fb-www/typeof-undefined */

  const isSSR = // $FlowFixMe(site=recoil) Window does not have a FlowType definition https://github.com/facebook/flow/issues/6709
  typeof Window === 'undefined' || typeof window === 'undefined';
  /* eslint-enable fb-www/typeof-undefined */

  const isWindow = value => !isSSR && ( // $FlowFixMe(site=recoil) Window does not have a FlowType definition https://github.com/facebook/flow/issues/6709
  value === window || value instanceof Window);

  const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative'; // eslint-disable-line fb-www/typeof-undefined

  var Recoil_Environment = {
    isSSR,
    isReactNative,
    isWindow
  };

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */
  /**
   * Caches a function's results based on the key returned by the passed
   * hashFunction.
   */

  function memoizeWithArgsHash(fn, hashFunction) {
    let cache;
    return (...args) => {
      if (!cache) {
        cache = {};
      }

      const key = hashFunction(...args);

      if (!Object.hasOwnProperty.call(cache, key)) {
        cache[key] = fn(...args);
      }

      return cache[key];
    };
  }
  /**
   * Caches a function's results based on a comparison of the arguments.
   * Only caches the last return of the function.
   * Defaults to reference equality
   */


  function memoizeOneWithArgsHash(fn, hashFunction) {
    let lastKey;
    let lastResult; // breaking cache when arguments change

    return (...args) => {
      const key = hashFunction(...args);

      if (lastKey === key) {
        return lastResult;
      }

      lastKey = key;
      lastResult = fn(...args);
      return lastResult;
    };
  }
  /**
   * Caches a function's results based on a comparison of the arguments.
   * Only caches the last return of the function.
   * Defaults to reference equality
   */


  function memoizeOneWithArgsHashAndInvalidation(fn, hashFunction) {
    let lastKey;
    let lastResult; // breaking cache when arguments change

    const memoizedFn = (...args) => {
      const key = hashFunction(...args);

      if (lastKey === key) {
        return lastResult;
      }

      lastKey = key;
      lastResult = fn(...args);
      return lastResult;
    };

    const invalidate = () => {
      lastKey = null;
    };

    return [memoizedFn, invalidate];
  }

  var Recoil_Memoize = {
    memoizeWithArgsHash,
    memoizeOneWithArgsHash,
    memoizeOneWithArgsHashAndInvalidation
  };

  const {
    batchUpdates: batchUpdates$1
  } = Recoil_Batching;

  const {
    initializeNode: initializeNode$1,
    peekNodeInfo: peekNodeInfo$1
  } = Recoil_FunctionalCore;

  const {
    graph: graph$1
  } = Recoil_Graph;

  const {
    getNextStoreID: getNextStoreID$1
  } = Recoil_Keys;

  const {
    DEFAULT_VALUE: DEFAULT_VALUE$1,
    recoilValues: recoilValues$1,
    recoilValuesForKeys: recoilValuesForKeys$2
  } = Recoil_Node;

  const {
    AbstractRecoilValue: AbstractRecoilValue$2,
    getRecoilValueAsLoadable: getRecoilValueAsLoadable$1,
    setRecoilValue: setRecoilValue$1,
    setUnvalidatedRecoilValue: setUnvalidatedRecoilValue$1
  } = Recoil_RecoilValueInterface;

  const {
    updateRetainCount: updateRetainCount$1
  } = Recoil_Retention;

  const {
    setInvalidateMemoizedSnapshot: setInvalidateMemoizedSnapshot$1
  } = Recoil_SnapshotCache;

  const {
    getNextTreeStateVersion: getNextTreeStateVersion$2,
    makeEmptyStoreState: makeEmptyStoreState$1
  } = Recoil_State;



  const {
    isSSR: isSSR$1
  } = Recoil_Environment;









  const {
    memoizeOneWithArgsHashAndInvalidation: memoizeOneWithArgsHashAndInvalidation$1
  } = Recoil_Memoize;



   // Opaque at this surface because it's part of the public API from here.


  const retainWarning = `
Recoil Snapshots only last for the duration of the callback they are provided to. To keep a Snapshot longer, do this:

  const release = snapshot.retain();
  try {
    await doSomethingWithSnapshot(snapshot);
  } finally {
    release();
  }

This is currently a DEV-only warning but will become a thrown exception in the next release of Recoil.
`; // A "Snapshot" is "read-only" and captures a specific set of values of atoms.
  // However, the data-flow-graph and selector values may evolve as selector
  // evaluation functions are executed and async selectors resolve.

  class Snapshot {
    // eslint-disable-next-line fb-www/no-uninitialized-properties
    constructor(storeState, parentStoreID) {
      _defineProperty(this, "_store", void 0);

      _defineProperty(this, "_refCount", 1);

      _defineProperty(this, "getLoadable", recoilValue => {
        this.checkRefCount_INTERNAL();
        return getRecoilValueAsLoadable$1(this._store, recoilValue);
      });

      _defineProperty(this, "getPromise", recoilValue => {
        this.checkRefCount_INTERNAL();
        return this.getLoadable(recoilValue).toPromise();
      });

      _defineProperty(this, "getNodes_UNSTABLE", opt => {
        this.checkRefCount_INTERNAL(); // TODO Deal with modified selectors

        if ((opt === null || opt === void 0 ? void 0 : opt.isModified) === true) {
          if ((opt === null || opt === void 0 ? void 0 : opt.isInitialized) === false) {
            return [];
          }

          const state = this._store.getState().currentTree;

          return recoilValuesForKeys$2(state.dirtyAtoms);
        }

        const knownAtoms = this._store.getState().knownAtoms;

        const knownSelectors = this._store.getState().knownSelectors;

        return (opt === null || opt === void 0 ? void 0 : opt.isInitialized) == null ? recoilValues$1.values() : opt.isInitialized === true ? recoilValuesForKeys$2(Recoil_concatIterables([knownAtoms, knownSelectors])) : Recoil_filterIterable(recoilValues$1.values(), ({
          key
        }) => !knownAtoms.has(key) && !knownSelectors.has(key));
      });

      _defineProperty(this, "getInfo_UNSTABLE", ({
        key
      }) => {
        this.checkRefCount_INTERNAL();
        return peekNodeInfo$1(this._store, this._store.getState().currentTree, key);
      });

      _defineProperty(this, "map", mapper => {
        this.checkRefCount_INTERNAL();
        const mutableSnapshot = new MutableSnapshot(this, batchUpdates$1);
        mapper(mutableSnapshot); // if removing batchUpdates from `set` add it here

        return mutableSnapshot;
      });

      _defineProperty(this, "asyncMap", async mapper => {
        this.checkRefCount_INTERNAL();
        const mutableSnapshot = new MutableSnapshot(this, batchUpdates$1);
        mutableSnapshot.retain(); // Retain new snapshot during async mapper

        await mapper(mutableSnapshot); // Continue to retain the new snapshot for the user, but auto-release it
        // after the next tick, the same as a new synchronous snapshot.

        mutableSnapshot.autoRelease_INTERNAL();
        return mutableSnapshot;
      });

      this._store = {
        storeID: getNextStoreID$1(),
        parentStoreID,
        getState: () => storeState,
        replaceState: replacer => {
          // no batching, so nextTree is never active
          storeState.currentTree = replacer(storeState.currentTree);
        },
        getGraph: version => {
          const graphs = storeState.graphsByVersion;

          if (graphs.has(version)) {
            return Recoil_nullthrows(graphs.get(version));
          }

          const newGraph = graph$1();
          graphs.set(version, newGraph);
          return newGraph;
        },
        subscribeToTransactions: () => ({
          release: () => {}
        }),
        addTransactionMetadata: () => {
          throw Recoil_err('Cannot subscribe to Snapshots');
        }
      }; // Initialize any nodes that are live in the parent store (primarily so that
      // this snapshot gets counted towards the node's live stores count).
      // TODO Optimize this when cloning snapshots for callbacks

      for (const nodeKey of this._store.getState().knownAtoms) {
        initializeNode$1(this._store, nodeKey, 'get');
        updateRetainCount$1(this._store, nodeKey, 1);
      }

      this.autoRelease_INTERNAL();
    }

    retain() {
      if (this._refCount <= 0) {
        {
          throw Recoil_err('Snapshot has already been released.');
        }
      }

      this._refCount++;
      let released = false;
      return () => {
        if (!released) {
          released = true;

          this._release();
        }
      };
    }
    /**
     * Release the snapshot on the next tick.  This means the snapshot is retained
     * during the execution of the current function using it.
     */


    autoRelease_INTERNAL() {
      if (!isSSR$1) {
        // Use timeout of 10 to workaround Firefox issue: https://github.com/facebookexperimental/Recoil/issues/1936
        window.setTimeout(() => this._release(), 10);
      }
    }

    _release() {
      this._refCount--;

      if (this._refCount === 0) {
        this._store.getState().nodeCleanupFunctions.forEach(cleanup => cleanup());

        this._store.getState().nodeCleanupFunctions.clear();

        if (!Recoil_gkx('recoil_memory_managament_2020')) {
          return;
        } // Temporarily nerfing this to allow us to find broken call sites without
        // actually breaking anybody yet.
        // for (const k of this._store.getState().knownAtoms) {
        //   updateRetainCountToZero(this._store, k);
        // }

      } else if (this._refCount < 0) {
        {
          Recoil_recoverableViolation('Snapshot released an extra time.');
        }
      }
    }

    isRetained() {
      return this._refCount > 0;
    }

    checkRefCount_INTERNAL() {
      if (Recoil_gkx('recoil_memory_managament_2020') && this._refCount <= 0) {
        {
          Recoil_recoverableViolation(retainWarning);
        } // What we will ship later:
        // throw err(retainWarning);

      }
    }

    getStore_INTERNAL() {
      this.checkRefCount_INTERNAL();
      return this._store;
    }

    getID() {
      this.checkRefCount_INTERNAL();
      return this._store.getState().currentTree.stateID;
    }

    getStoreID() {
      this.checkRefCount_INTERNAL();
      return this._store.storeID;
    } // We want to allow the methods to be destructured and used as accessors

    /* eslint-disable fb-www/extra-arrow-initializer */

    /* eslint-enable fb-www/extra-arrow-initializer */


  }

  function cloneStoreState(store, treeState, bumpVersion = false) {
    const storeState = store.getState();
    const version = bumpVersion ? getNextTreeStateVersion$2() : treeState.version;
    return {
      // Always clone the TreeState to isolate stores from accidental mutations.
      // For example, reading a selector from a cloned snapshot shouldn't cache
      // in the original treestate which may cause the original to skip
      // initialization of upstream atoms.
      currentTree: {
        // TODO snapshots shouldn't really have versions because a new version number
        // is always assigned when the snapshot is gone to.
        version: bumpVersion ? version : treeState.version,
        stateID: bumpVersion ? version : treeState.stateID,
        transactionMetadata: { ...treeState.transactionMetadata
        },
        dirtyAtoms: new Set(treeState.dirtyAtoms),
        atomValues: treeState.atomValues.clone(),
        nonvalidatedAtoms: treeState.nonvalidatedAtoms.clone()
      },
      commitDepth: 0,
      nextTree: null,
      previousTree: null,
      knownAtoms: new Set(storeState.knownAtoms),
      // FIXME here's a copy
      knownSelectors: new Set(storeState.knownSelectors),
      // FIXME here's a copy
      transactionSubscriptions: new Map(),
      nodeTransactionSubscriptions: new Map(),
      nodeToComponentSubscriptions: new Map(),
      queuedComponentCallbacks_DEPRECATED: [],
      suspendedComponentResolvers: new Set(),
      graphsByVersion: new Map().set(version, store.getGraph(treeState.version)),
      retention: {
        referenceCounts: new Map(),
        nodesRetainedByZone: new Map(),
        retainablesToCheckForRelease: new Set()
      },
      // FIXME here's a copy
      // Create blank cleanup handlers for atoms so snapshots don't re-run
      // atom effects.
      nodeCleanupFunctions: new Map(Recoil_mapIterable(storeState.nodeCleanupFunctions.entries(), ([key]) => [key, () => {}]))
    };
  } // Factory to build a fresh snapshot


  function freshSnapshot(initializeState) {
    const snapshot = new Snapshot(makeEmptyStoreState$1());
    return initializeState != null ? snapshot.map(initializeState) : snapshot;
  } // Factory to clone a snapshot state


  const [memoizedCloneSnapshot, invalidateMemoizedSnapshot$2] = memoizeOneWithArgsHashAndInvalidation$1( // $FlowFixMe[missing-local-annot]
  (store, version) => {
    var _storeState$nextTree;

    const storeState = store.getState();
    const treeState = version === 'latest' ? (_storeState$nextTree = storeState.nextTree) !== null && _storeState$nextTree !== void 0 ? _storeState$nextTree : storeState.currentTree : Recoil_nullthrows(storeState.previousTree);
    return new Snapshot(cloneStoreState(store, treeState), store.storeID);
  }, (store, version) => {
    var _store$getState$nextT, _store$getState$previ;

    return String(version) + String(store.storeID) + String((_store$getState$nextT = store.getState().nextTree) === null || _store$getState$nextT === void 0 ? void 0 : _store$getState$nextT.version) + String(store.getState().currentTree.version) + String((_store$getState$previ = store.getState().previousTree) === null || _store$getState$previ === void 0 ? void 0 : _store$getState$previ.version);
  }); // Avoid circular dependencies

  setInvalidateMemoizedSnapshot$1(invalidateMemoizedSnapshot$2);

  function cloneSnapshot(store, version = 'latest') {
    const snapshot = memoizedCloneSnapshot(store, version);

    if (!snapshot.isRetained()) {
      invalidateMemoizedSnapshot$2();
      return memoizedCloneSnapshot(store, version);
    }

    return snapshot;
  }

  class MutableSnapshot extends Snapshot {
    constructor(snapshot, batch) {
      super(cloneStoreState(snapshot.getStore_INTERNAL(), snapshot.getStore_INTERNAL().getState().currentTree, true), snapshot.getStoreID());

      _defineProperty(this, "_batch", void 0);

      _defineProperty(this, "set", (recoilState, newValueOrUpdater) => {
        this.checkRefCount_INTERNAL();
        const store = this.getStore_INTERNAL(); // This batchUpdates ensures this `set` is applied immediately and you can
        // read the written value after calling `set`. I would like to remove this
        // behavior and only batch in `Snapshot.map`, but this would be a breaking
        // change potentially.

        this._batch(() => {
          updateRetainCount$1(store, recoilState.key, 1);
          setRecoilValue$1(this.getStore_INTERNAL(), recoilState, newValueOrUpdater);
        });
      });

      _defineProperty(this, "reset", recoilState => {
        this.checkRefCount_INTERNAL();
        const store = this.getStore_INTERNAL(); // See note at `set` about batched updates.

        this._batch(() => {
          updateRetainCount$1(store, recoilState.key, 1);
          setRecoilValue$1(this.getStore_INTERNAL(), recoilState, DEFAULT_VALUE$1);
        });
      });

      _defineProperty(this, "setUnvalidatedAtomValues_DEPRECATED", values => {
        this.checkRefCount_INTERNAL();
        const store = this.getStore_INTERNAL(); // See note at `set` about batched updates.

        batchUpdates$1(() => {
          for (const [k, v] of values.entries()) {
            updateRetainCount$1(store, k, 1);
            setUnvalidatedRecoilValue$1(store, new AbstractRecoilValue$2(k), v);
          }
        });
      });

      this._batch = batch;
    }

  }

  var Recoil_Snapshot = {
    Snapshot,
    MutableSnapshot,
    freshSnapshot,
    cloneSnapshot
  };

  var Recoil_Snapshot_1 = Recoil_Snapshot.Snapshot;
  var Recoil_Snapshot_2 = Recoil_Snapshot.MutableSnapshot;
  var Recoil_Snapshot_3 = Recoil_Snapshot.freshSnapshot;
  var Recoil_Snapshot_4 = Recoil_Snapshot.cloneSnapshot;

  var Recoil_Snapshot$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    Snapshot: Recoil_Snapshot_1,
    MutableSnapshot: Recoil_Snapshot_2,
    freshSnapshot: Recoil_Snapshot_3,
    cloneSnapshot: Recoil_Snapshot_4
  });

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  function unionSets(...sets) {
    const result = new Set();

    for (const set of sets) {
      for (const value of set) {
        result.add(value);
      }
    }

    return result;
  }

  var Recoil_unionSets = unionSets;

  const {
    useRef
  } = react;
  /**
   * The same as `useRef()` except that if a function is specified then it will
   * call that function to get the value to initialize the reference with.
   * This is similar to how `useState()` behaves when given a function.  It allows
   * the user to avoid generating the initial value for subsequent renders.
   * The tradeoff is that to set the reference to a function itself you need to
   * nest it: useRefInitOnce(() => () => {...});
   */


  function useRefInitOnce(initialValue) {
    // $FlowExpectedError[incompatible-call]
    const ref = useRef(initialValue);

    if (ref.current === initialValue && typeof initialValue === 'function') {
      // $FlowExpectedError[incompatible-use]
      ref.current = initialValue();
    }

    return ref;
  }

  var Recoil_useRefInitOnce = useRefInitOnce;

  // @fb-only: const RecoilusagelogEvent = require('RecoilusagelogEvent');
  // @fb-only: const RecoilUsageLogFalcoEvent = require('RecoilUsageLogFalcoEvent');
  // @fb-only: const URI = require('URI');


  const {
    getNextTreeStateVersion: getNextTreeStateVersion$3,
    makeEmptyStoreState: makeEmptyStoreState$2
  } = Recoil_State;

  const {
    cleanUpNode: cleanUpNode$2,
    getDownstreamNodes: getDownstreamNodes$2,
    initializeNode: initializeNode$2,
    setNodeValue: setNodeValue$2,
    setUnvalidatedAtomValue_DEPRECATED: setUnvalidatedAtomValue_DEPRECATED$1
  } = Recoil_FunctionalCore;

  const {
    graph: graph$2
  } = Recoil_Graph;

  const {
    cloneGraph: cloneGraph$1
  } = Recoil_Graph;

  const {
    getNextStoreID: getNextStoreID$2
  } = Recoil_Keys;

  const {
    createMutableSource: createMutableSource$1,
    reactMode: reactMode$2
  } = Recoil_ReactMode;

  const {
    applyAtomValueWrites: applyAtomValueWrites$1
  } = Recoil_RecoilValueInterface;

  const {
    releaseScheduledRetainablesNow: releaseScheduledRetainablesNow$1
  } = Recoil_Retention;

  const {
    freshSnapshot: freshSnapshot$1
  } = Recoil_Snapshot$1;



  const {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef: useRef$1,
    useState
  } = react;















  function notInAContext() {
    throw Recoil_err('This component must be used inside a <RecoilRoot> component.');
  }

  const defaultStore = Object.freeze({
    storeID: getNextStoreID$2(),
    getState: notInAContext,
    replaceState: notInAContext,
    getGraph: notInAContext,
    subscribeToTransactions: notInAContext,
    addTransactionMetadata: notInAContext
  });
  let stateReplacerIsBeingExecuted = false;

  function startNextTreeIfNeeded(store) {
    if (stateReplacerIsBeingExecuted) {
      throw Recoil_err('An atom update was triggered within the execution of a state updater function. State updater functions provided to Recoil must be pure functions.');
    }

    const storeState = store.getState();

    if (storeState.nextTree === null) {
      if (Recoil_gkx('recoil_memory_managament_2020') && Recoil_gkx('recoil_release_on_cascading_update_killswitch_2021')) {
        // If this is a cascading update (that is, rendering due to one state change
        // invokes a second state change), we won't have cleaned up retainables yet
        // because this normally happens after notifying components. Do it before
        // proceeding with the cascading update so that it remains predictable:
        if (storeState.commitDepth > 0) {
          releaseScheduledRetainablesNow$1(store);
        }
      }

      const version = storeState.currentTree.version;
      const nextVersion = getNextTreeStateVersion$3();
      storeState.nextTree = { ...storeState.currentTree,
        version: nextVersion,
        stateID: nextVersion,
        dirtyAtoms: new Set(),
        transactionMetadata: {}
      };
      storeState.graphsByVersion.set(nextVersion, cloneGraph$1(Recoil_nullthrows(storeState.graphsByVersion.get(version))));
    }
  }

  const AppContext = react.createContext({
    current: defaultStore
  });

  const useStoreRef = () => useContext(AppContext); // $FlowExpectedError[incompatible-call]


  const MutableSourceContext = react.createContext(null);

  function useRecoilMutableSource() {
    const mutableSource = useContext(MutableSourceContext);

    if (mutableSource == null) {
      Recoil_expectationViolation('Attempted to use a Recoil hook outside of a <RecoilRoot>. ' + '<RecoilRoot> must be an ancestor of any component that uses ' + 'Recoil hooks.');
    }

    return mutableSource;
  }

  function notifyComponents(store, storeState, treeState) {
    const dependentNodes = getDownstreamNodes$2(store, treeState, treeState.dirtyAtoms);

    for (const key of dependentNodes) {
      const comps = storeState.nodeToComponentSubscriptions.get(key);

      if (comps) {
        for (const [_subID, [_debugName, callback]] of comps) {
          callback(treeState);
        }
      }
    }
  }

  function sendEndOfBatchNotifications(store) {
    const storeState = store.getState();
    const treeState = storeState.currentTree; // Inform transaction subscribers of the transaction:

    const dirtyAtoms = treeState.dirtyAtoms;

    if (dirtyAtoms.size) {
      // Execute Node-specific subscribers before global subscribers
      for (const [key, subscriptions] of storeState.nodeTransactionSubscriptions) {
        if (dirtyAtoms.has(key)) {
          for (const [_, subscription] of subscriptions) {
            subscription(store);
          }
        }
      }

      for (const [_, subscription] of storeState.transactionSubscriptions) {
        subscription(store);
      }

      if (!reactMode$2().early || storeState.suspendedComponentResolvers.size > 0) {
        // Notifying components is needed to wake from suspense, even when using
        // early rendering.
        notifyComponents(store, storeState, treeState); // Wake all suspended components so the right one(s) can try to re-render.
        // We need to wake up components not just when some asynchronous selector
        // resolved, but also when changing synchronous values because this may cause
        // a selector to change from asynchronous to synchronous, in which case there
        // would be no follow-up asynchronous resolution to wake us up.
        // TODO OPTIMIZATION Only wake up related downstream components

        storeState.suspendedComponentResolvers.forEach(cb => cb());
        storeState.suspendedComponentResolvers.clear();
      }
    } // Special behavior ONLY invoked by useInterface.
    // FIXME delete queuedComponentCallbacks_DEPRECATED when deleting useInterface.


    storeState.queuedComponentCallbacks_DEPRECATED.forEach(cb => cb(treeState));
    storeState.queuedComponentCallbacks_DEPRECATED.splice(0, storeState.queuedComponentCallbacks_DEPRECATED.length);
  }

  function endBatch(store) {
    const storeState = store.getState();
    storeState.commitDepth++;

    try {
      const {
        nextTree
      } = storeState; // Ignore commits that are not because of Recoil transactions -- namely,
      // because something above RecoilRoot re-rendered:

      if (nextTree == null) {
        return;
      } // nextTree is now committed -- note that copying and reset occurs when
      // a transaction begins, in startNextTreeIfNeeded:


      storeState.previousTree = storeState.currentTree;
      storeState.currentTree = nextTree;
      storeState.nextTree = null;
      sendEndOfBatchNotifications(store);

      if (storeState.previousTree != null) {
        storeState.graphsByVersion.delete(storeState.previousTree.version);
      } else {
        Recoil_recoverableViolation('Ended batch with no previous state, which is unexpected', 'recoil');
      }

      storeState.previousTree = null;

      if (Recoil_gkx('recoil_memory_managament_2020')) {
        // Only release retainables if there were no writes during the end of the
        // batch.  This avoids releasing something we might be about to use.
        if (nextTree == null) {
          releaseScheduledRetainablesNow$1(store);
        }
      }
    } finally {
      storeState.commitDepth--;
    }
  }
  /*
   * The purpose of the Batcher is to observe when React batches end so that
   * Recoil state changes can be batched. Whenever Recoil state changes, we call
   * setState on the batcher. Then we wait for that change to be committed, which
   * signifies the end of the batch. That's when we respond to the Recoil change.
   */


  function Batcher({
    setNotifyBatcherOfChange
  }) {
    const storeRef = useStoreRef();
    const [, setState] = useState([]); // $FlowFixMe[incompatible-call]

    setNotifyBatcherOfChange(() => setState({}));
    useEffect(() => {
      // $FlowFixMe[incompatible-call]
      setNotifyBatcherOfChange(() => setState({})); // If an asynchronous selector resolves after the Batcher is unmounted,
      // notifyBatcherOfChange will still be called. An error gets thrown whenever
      // setState is called after a component is already unmounted, so this sets
      // notifyBatcherOfChange to be a no-op.

      return () => {
        setNotifyBatcherOfChange(() => {});
      };
    }, [setNotifyBatcherOfChange]);
    useEffect(() => {
      // enqueueExecution runs this function immediately; it is only used to
      // manipulate the order of useEffects during tests, since React seems to
      // call useEffect in an unpredictable order sometimes.
      Recoil_Queue.enqueueExecution('Batcher', () => {
        endBatch(storeRef.current);
      });
    });
    return null;
  }

  {
    if (typeof window !== 'undefined' && !window.$recoilDebugStates) {
      window.$recoilDebugStates = [];
    }
  } // When removing this deprecated function, remove stateBySettingRecoilValue
  // which will no longer be needed.


  function initialStoreState_DEPRECATED(store, initializeState) {
    const initial = makeEmptyStoreState$2();
    initializeState({
      set: (atom, value) => {
        const state = initial.currentTree;
        const writes = setNodeValue$2(store, state, atom.key, value);
        const writtenNodes = new Set(writes.keys());
        const nonvalidatedAtoms = state.nonvalidatedAtoms.clone();

        for (const n of writtenNodes) {
          nonvalidatedAtoms.delete(n);
        }

        initial.currentTree = { ...state,
          dirtyAtoms: Recoil_unionSets(state.dirtyAtoms, writtenNodes),
          atomValues: applyAtomValueWrites$1(state.atomValues, writes),
          // NB: PLEASE un-export applyAtomValueWrites when deleting this code
          nonvalidatedAtoms
        };
      },
      setUnvalidatedAtomValues: atomValues => {
        // FIXME replace this with a mutative loop
        atomValues.forEach((v, k) => {
          initial.currentTree = setUnvalidatedAtomValue_DEPRECATED$1(initial.currentTree, k, v);
        });
      }
    });
    return initial;
  } // Initialize state snapshot for <RecoilRoot> for the initializeState prop.
  // Atom effect initialization takes precedence over this prop.
  // Any atom effects will be run before initialization, but then cleaned up,
  // they are then re-run when used as part of rendering.  These semantics are
  // compatible with React StrictMode where effects may be re-run multiple times
  // but state initialization only happens once the first time.


  function initialStoreState(initializeState) {
    // Initialize a snapshot and get its store
    const snapshot = freshSnapshot$1(initializeState);
    const storeState = snapshot.getStore_INTERNAL().getState(); // Counteract the snapshot auto-release

    snapshot.retain(); // Cleanup any effects run during initialization and clear the handlers so
    // they will re-initialize if used during rendering.  This allows atom effect
    // initialization to take precedence over initializeState and be compatible
    // with StrictMode semantics.

    storeState.nodeCleanupFunctions.forEach(cleanup => cleanup());
    storeState.nodeCleanupFunctions.clear();
    return storeState;
  }

  let nextID = 0;

  function RecoilRoot_INTERNAL({
    initializeState_DEPRECATED,
    initializeState,
    store_INTERNAL: storeProp,
    // For use with React "context bridging"
    children
  }) {
    // prettier-ignore
    // @fb-only: useEffect(() => {
    // @fb-only: if (gkx('recoil_usage_logging')) {
    // @fb-only: try {
    // @fb-only: RecoilUsageLogFalcoEvent.log(() => ({
    // @fb-only: type: RecoilusagelogEvent.RECOIL_ROOT_MOUNTED,
    // @fb-only: path: URI.getRequestURI().getPath(),
    // @fb-only: }));
    // @fb-only: } catch {
    // @fb-only: recoverableViolation(
    // @fb-only: 'Error when logging Recoil Usage event',
    // @fb-only: 'recoil',
    // @fb-only: );
    // @fb-only: }
    // @fb-only: }
    // @fb-only: }, []);
    let storeStateRef; // eslint-disable-line prefer-const

    const getGraph = version => {
      const graphs = storeStateRef.current.graphsByVersion;

      if (graphs.has(version)) {
        return Recoil_nullthrows(graphs.get(version));
      }

      const newGraph = graph$2();
      graphs.set(version, newGraph);
      return newGraph;
    };

    const subscribeToTransactions = (callback, key) => {
      if (key == null) {
        // Global transaction subscriptions
        const {
          transactionSubscriptions
        } = storeRef.current.getState();
        const id = nextID++;
        transactionSubscriptions.set(id, callback);
        return {
          release: () => {
            transactionSubscriptions.delete(id);
          }
        };
      } else {
        // Node-specific transaction subscriptions:
        const {
          nodeTransactionSubscriptions
        } = storeRef.current.getState();

        if (!nodeTransactionSubscriptions.has(key)) {
          nodeTransactionSubscriptions.set(key, new Map());
        }

        const id = nextID++;
        Recoil_nullthrows(nodeTransactionSubscriptions.get(key)).set(id, callback);
        return {
          release: () => {
            const subs = nodeTransactionSubscriptions.get(key);

            if (subs) {
              subs.delete(id);

              if (subs.size === 0) {
                nodeTransactionSubscriptions.delete(key);
              }
            }
          }
        };
      }
    };

    const addTransactionMetadata = metadata => {
      startNextTreeIfNeeded(storeRef.current);

      for (const k of Object.keys(metadata)) {
        Recoil_nullthrows(storeRef.current.getState().nextTree).transactionMetadata[k] = metadata[k];
      }
    };

    const replaceState = replacer => {
      startNextTreeIfNeeded(storeRef.current); // Use replacer to get the next state:

      const nextTree = Recoil_nullthrows(storeStateRef.current.nextTree);
      let replaced;

      try {
        stateReplacerIsBeingExecuted = true;
        replaced = replacer(nextTree);
      } finally {
        stateReplacerIsBeingExecuted = false;
      }

      if (replaced === nextTree) {
        return;
      }

      {
        if (typeof window !== 'undefined') {
          window.$recoilDebugStates.push(replaced); // TODO this shouldn't happen here because it's not batched
        }
      } // Save changes to nextTree and schedule a React update:


      storeStateRef.current.nextTree = replaced;

      if (reactMode$2().early) {
        notifyComponents(storeRef.current, storeStateRef.current, replaced);
      }

      Recoil_nullthrows(notifyBatcherOfChange.current)();
    };

    const notifyBatcherOfChange = useRef$1(null);
    const setNotifyBatcherOfChange = useCallback(x => {
      notifyBatcherOfChange.current = x;
    }, [notifyBatcherOfChange]);
    const storeRef = Recoil_useRefInitOnce(() => storeProp !== null && storeProp !== void 0 ? storeProp : {
      storeID: getNextStoreID$2(),
      getState: () => storeStateRef.current,
      replaceState,
      getGraph,
      subscribeToTransactions,
      addTransactionMetadata
    });

    if (storeProp != null) {
      storeRef.current = storeProp;
    }

    storeStateRef = Recoil_useRefInitOnce(() => initializeState_DEPRECATED != null ? initialStoreState_DEPRECATED(storeRef.current, initializeState_DEPRECATED) : initializeState != null ? initialStoreState(initializeState) : makeEmptyStoreState$2());
    const mutableSource = useMemo(() => createMutableSource$1 === null || createMutableSource$1 === void 0 ? void 0 : createMutableSource$1(storeStateRef, () => storeStateRef.current.currentTree.version), [storeStateRef]); // Cleanup when the <RecoilRoot> is unmounted

    useEffect(() => {
      // React is free to call effect cleanup handlers and effects at will, the
      // deps array is only an optimization.  For example, React strict mode
      // will execute each effect twice for testing.  Therefore, we need symmetry
      // to re-initialize all known atoms after they were cleaned up.
      const store = storeRef.current;

      for (const atomKey of new Set(store.getState().knownAtoms)) {
        initializeNode$2(store, atomKey, 'get');
      }

      return () => {
        for (const atomKey of store.getState().knownAtoms) {
          cleanUpNode$2(store, atomKey);
        }
      };
    }, [storeRef]);
    return /*#__PURE__*/react.createElement(AppContext.Provider, {
      value: storeRef
    }, /*#__PURE__*/react.createElement(MutableSourceContext.Provider, {
      value: mutableSource
    }, /*#__PURE__*/react.createElement(Batcher, {
      setNotifyBatcherOfChange: setNotifyBatcherOfChange
    }), children));
  }

  function RecoilRoot(props) {
    const {
      override,
      ...propsExceptOverride
    } = props;
    const ancestorStoreRef = useStoreRef();

    if (override === false && ancestorStoreRef.current !== defaultStore) {
      // If ancestorStoreRef.current !== defaultStore, it means that this
      // RecoilRoot is not nested within another.
      return props.children;
    }

    return /*#__PURE__*/react.createElement(RecoilRoot_INTERNAL, propsExceptOverride);
  }

  function useRecoilStoreID() {
    return useStoreRef().current.storeID;
  }

  var Recoil_RecoilRoot = {
    RecoilRoot,
    useStoreRef,
    useRecoilMutableSource,
    useRecoilStoreID,
    notifyComponents_FOR_TESTING: notifyComponents,
    sendEndOfBatchNotifications_FOR_TESTING: sendEndOfBatchNotifications
  };

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  function shallowArrayEqual(a, b) {
    if (a === b) {
      return true;
    }

    if (a.length !== b.length) {
      return false;
    }

    for (let i = 0, l = a.length; i < l; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }

    return true;
  }

  var Recoil_shallowArrayEqual = shallowArrayEqual;

  const {
    useEffect: useEffect$1,
    useRef: useRef$2
  } = react;

  function usePrevious(value) {
    const ref = useRef$2();
    useEffect$1(() => {
      // $FlowFixMe[incompatible-type]
      ref.current = value;
    });
    return ref.current;
  }

  var Recoil_usePrevious = usePrevious;

  const {
    useStoreRef: useStoreRef$1
  } = Recoil_RecoilRoot;

  const {
    SUSPENSE_TIMEOUT_MS: SUSPENSE_TIMEOUT_MS$1
  } = Recoil_Retention;

  const {
    updateRetainCount: updateRetainCount$2
  } = Recoil_Retention;

  const {
    RetentionZone: RetentionZone$3
  } = Recoil_RetentionZone;

  const {
    useEffect: useEffect$2,
    useRef: useRef$3
  } = react;

  const {
    isSSR: isSSR$2
  } = Recoil_Environment;





   // I don't see a way to avoid the any type here because we want to accept readable
  // and writable values with any type parameter, but normally with writable ones
  // RecoilState<SomeT> is not a subtype of RecoilState<mixed>.


  // flowlint-line unclear-type:off
  function useRetain(toRetain) {
    if (!Recoil_gkx('recoil_memory_managament_2020')) {
      return;
    } // eslint-disable-next-line fb-www/react-hooks


    return useRetain_ACTUAL(toRetain);
  }

  function useRetain_ACTUAL(toRetain) {
    const array = Array.isArray(toRetain) ? toRetain : [toRetain];
    const retainables = array.map(a => a instanceof RetentionZone$3 ? a : a.key);
    const storeRef = useStoreRef$1();
    useEffect$2(() => {
      if (!Recoil_gkx('recoil_memory_managament_2020')) {
        return;
      }

      const store = storeRef.current;

      if (timeoutID.current && !isSSR$2) {
        // Already performed a temporary retain on render, simply cancel the release
        // of that temporary retain.
        window.clearTimeout(timeoutID.current);
        timeoutID.current = null;
      } else {
        for (const r of retainables) {
          updateRetainCount$2(store, r, 1);
        }
      }

      return () => {
        for (const r of retainables) {
          updateRetainCount$2(store, r, -1);
        }
      }; // eslint-disable-next-line fb-www/react-hooks-deps
    }, [storeRef, ...retainables]); // We want to retain if the component suspends. This is terrible but the Suspense
    // API affords us no better option. If we suspend and never commit after some
    // seconds, then release. The 'actual' retain/release in the effect above
    // cancels this.

    const timeoutID = useRef$3();
    const previousRetainables = Recoil_usePrevious(retainables);

    if (!isSSR$2 && (previousRetainables === undefined || !Recoil_shallowArrayEqual(previousRetainables, retainables))) {
      const store = storeRef.current;

      for (const r of retainables) {
        updateRetainCount$2(store, r, 1);
      }

      if (previousRetainables) {
        for (const r of previousRetainables) {
          updateRetainCount$2(store, r, -1);
        }
      }

      if (timeoutID.current) {
        window.clearTimeout(timeoutID.current);
      }

      timeoutID.current = window.setTimeout(() => {
        timeoutID.current = null;

        for (const r of retainables) {
          updateRetainCount$2(store, r, -1);
        }
      }, SUSPENSE_TIMEOUT_MS$1);
    }
  }

  var Recoil_useRetain = useRetain;

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */
  /**
   * THIS CODE HAS BEEN COMMENTED OUT INTENTIONALLY
   *
   * This technique of getting the component name is imperfect, since it both only
   * works in a non-minified code base, and more importantly introduces performance
   * problems since it relies in throwing errors which is an expensive operation.
   *
   * At some point we may want to reevaluate this technique hence why we have commented
   * this code out, rather than delete it all together.
   */
  // const {useRef} = require('react');
  // const gkx = require('recoil-shared/util/Recoil_gkx');
  // const stackTraceParser = require('recoil-shared/util/Recoil_stackTraceParser');

  function useComponentName() {
    // const nameRef = useRef();
    // if (__DEV__) {
    //   if (gkx('recoil_infer_component_names')) {
    //     if (nameRef.current === undefined) {
    //       // There is no blessed way to determine the calling React component from
    //       // within a hook. This hack uses the fact that hooks must start with 'use'
    //       // and that hooks are either called by React Components or other hooks. It
    //       // follows therefore, that to find the calling component, you simply need
    //       // to look down the stack and find the first function which doesn't start
    //       // with 'use'. We are only enabling this in dev for now, since once the
    //       // codebase is minified, the naming assumptions no longer hold true.
    //       // eslint-disable-next-line fb-www/no-new-error
    //       const frames = stackTraceParser(new Error().stack);
    //       for (const {methodName} of frames) {
    //         // I observed cases where the frame was of the form 'Object.useXXX'
    //         // hence why I'm searching for hooks following a word boundary
    //         if (!methodName.match(/\buse[^\b]+$/)) {
    //           return (nameRef.current = methodName);
    //         }
    //       }
    //       nameRef.current = null;
    //     }
    //     return nameRef.current ?? '<unable to determine component name>';
    //   }
    // }
    // @fb-only: return "<component name only available when both in dev mode and when passing GK 'recoil_infer_component_names'>";
    return '<component name not available>'; // @oss-only
  }

  var Recoil_useComponentName = useComponentName;

  const {
    batchUpdates: batchUpdates$2
  } = Recoil_Batching;

  const {
    DEFAULT_VALUE: DEFAULT_VALUE$2
  } = Recoil_Node;

  const {
    currentRendererSupportsUseSyncExternalStore: currentRendererSupportsUseSyncExternalStore$1,
    reactMode: reactMode$3,
    useMutableSource: useMutableSource$1,
    useSyncExternalStore: useSyncExternalStore$1
  } = Recoil_ReactMode;

  const {
    useRecoilMutableSource: useRecoilMutableSource$1,
    useStoreRef: useStoreRef$2
  } = Recoil_RecoilRoot;

  const {
    isRecoilValue: isRecoilValue$2
  } = Recoil_RecoilValue$1;

  const {
    AbstractRecoilValue: AbstractRecoilValue$3,
    getRecoilValueAsLoadable: getRecoilValueAsLoadable$2,
    setRecoilValue: setRecoilValue$2,
    setUnvalidatedRecoilValue: setUnvalidatedRecoilValue$2,
    subscribeToRecoilValue: subscribeToRecoilValue$1
  } = Recoil_RecoilValueInterface;



  const {
    useCallback: useCallback$1,
    useEffect: useEffect$3,
    useMemo: useMemo$1,
    useRef: useRef$4,
    useState: useState$1
  } = react;

  const {
    setByAddingToSet: setByAddingToSet$2
  } = Recoil_CopyOnWrite;



  const {
    isSSR: isSSR$3
  } = Recoil_Environment;













  function handleLoadable(loadable, recoilValue, storeRef) {
    // We can't just throw the promise we are waiting on to Suspense.  If the
    // upstream dependencies change it may produce a state in which the component
    // can render, but it would still be suspended on a Promise that may never resolve.
    if (loadable.state === 'hasValue') {
      return loadable.contents;
    } else if (loadable.state === 'loading') {
      const promise = new Promise(resolve => {
        const suspendedComponentResolvers = storeRef.current.getState().suspendedComponentResolvers;
        suspendedComponentResolvers.add(resolve); // SSR should clear out the wake-up resolver if the Promise is resolved
        // to avoid infinite loops.  (See https://github.com/facebookexperimental/Recoil/pull/2073)

        if (isSSR$3 && Recoil_isPromise(loadable.contents)) {
          loadable.contents.finally(() => {
            suspendedComponentResolvers.delete(resolve);
          });
        }
      }); // $FlowExpectedError Flow(prop-missing) for integrating with tools that inspect thrown promises @fb-only
      // @fb-only: promise.displayName = `Recoil State: ${recoilValue.key}`;

      throw promise;
    } else if (loadable.state === 'hasError') {
      throw loadable.contents;
    } else {
      throw Recoil_err(`Invalid value of loadable atom "${recoilValue.key}"`);
    }
  }

  function validateRecoilValue(recoilValue, hookName // $FlowFixMe[missing-local-annot]
  ) {
    if (!isRecoilValue$2(recoilValue)) {
      throw Recoil_err(`Invalid argument to ${hookName}: expected an atom or selector but got ${String(recoilValue)}`);
    }
  }

  /**
   * Various things are broken with useRecoilInterface, particularly concurrent
   * mode, React strict mode, and memory management. They will not be fixed.
   * */
  function useRecoilInterface_DEPRECATED() {
    const componentName = Recoil_useComponentName();
    const storeRef = useStoreRef$2(); // eslint-disable-next-line fb-www/react-no-unused-state-hook

    const [, forceUpdate] = useState$1([]);
    const recoilValuesUsed = useRef$4(new Set());
    recoilValuesUsed.current = new Set(); // Track the RecoilValues used just during this render

    const previousSubscriptions = useRef$4(new Set());
    const subscriptions = useRef$4(new Map());
    const unsubscribeFrom = useCallback$1(key => {
      const sub = subscriptions.current.get(key);

      if (sub) {
        sub.release();
        subscriptions.current.delete(key);
      }
    }, [subscriptions]);
    const updateState = useCallback$1((_state, key) => {
      if (subscriptions.current.has(key)) {
        forceUpdate([]);
      }
    }, []); // Effect to add/remove subscriptions as nodes are used

    useEffect$3(() => {
      const store = storeRef.current;
      Recoil_differenceSets(recoilValuesUsed.current, previousSubscriptions.current).forEach(key => {
        if (subscriptions.current.has(key)) {
          Recoil_expectationViolation(`Double subscription to RecoilValue "${key}"`);
          return;
        }

        const sub = subscribeToRecoilValue$1(store, new AbstractRecoilValue$3(key), state => updateState(state, key), componentName);
        subscriptions.current.set(key, sub);
        /**
         * Since we're subscribing in an effect we need to update to the latest
         * value of the atom since it may have changed since we rendered. We can
         * go ahead and do that now, unless we're in the middle of a batch --
         * in which case we should do it at the end of the batch, due to the
         * following edge case: Suppose an atom is updated in another useEffect
         * of this same component. Then the following sequence of events occur:
         * 1. Atom is updated and subs fired (but we may not be subscribed
         *    yet depending on order of effects, so we miss this) Updated value
         *    is now in nextTree, but not currentTree.
         * 2. This effect happens. We subscribe and update.
         * 3. From the update we re-render and read currentTree, with old value.
         * 4. Batcher's effect sets currentTree to nextTree.
         * In this sequence we miss the update. To avoid that, add the update
         * to queuedComponentCallback if a batch is in progress.
         */
        // FIXME delete queuedComponentCallbacks_DEPRECATED when deleting useInterface.

        const state = store.getState();

        if (state.nextTree) {
          store.getState().queuedComponentCallbacks_DEPRECATED.push(() => {
            updateState(store.getState(), key);
          });
        } else {
          updateState(store.getState(), key);
        }
      });
      Recoil_differenceSets(previousSubscriptions.current, recoilValuesUsed.current).forEach(key => {
        unsubscribeFrom(key);
      });
      previousSubscriptions.current = recoilValuesUsed.current;
    }); // Effect to unsubscribe from all when unmounting

    useEffect$3(() => {
      const currentSubscriptions = subscriptions.current; // Restore subscriptions that were cleared due to StrictMode running this effect twice

      Recoil_differenceSets(recoilValuesUsed.current, new Set(currentSubscriptions.keys())).forEach(key => {
        const sub = subscribeToRecoilValue$1(storeRef.current, new AbstractRecoilValue$3(key), state => updateState(state, key), componentName);
        currentSubscriptions.set(key, sub);
      });
      return () => currentSubscriptions.forEach((_, key) => unsubscribeFrom(key));
    }, [componentName, storeRef, unsubscribeFrom, updateState]);
    return useMemo$1(() => {
      // eslint-disable-next-line no-shadow
      function useSetRecoilState(recoilState) {
        {
          validateRecoilValue(recoilState, 'useSetRecoilState');
        }

        return newValueOrUpdater => {
          setRecoilValue$2(storeRef.current, recoilState, newValueOrUpdater);
        };
      } // eslint-disable-next-line no-shadow


      function useResetRecoilState(recoilState) {
        {
          validateRecoilValue(recoilState, 'useResetRecoilState');
        }

        return () => setRecoilValue$2(storeRef.current, recoilState, DEFAULT_VALUE$2);
      } // eslint-disable-next-line no-shadow


      function useRecoilValueLoadable(recoilValue) {
        var _storeState$nextTree;

        {
          validateRecoilValue(recoilValue, 'useRecoilValueLoadable');
        }

        if (!recoilValuesUsed.current.has(recoilValue.key)) {
          recoilValuesUsed.current = setByAddingToSet$2(recoilValuesUsed.current, recoilValue.key);
        } // TODO Restore optimization to memoize lookup


        const storeState = storeRef.current.getState();
        return getRecoilValueAsLoadable$2(storeRef.current, recoilValue, reactMode$3().early ? (_storeState$nextTree = storeState.nextTree) !== null && _storeState$nextTree !== void 0 ? _storeState$nextTree : storeState.currentTree : storeState.currentTree);
      } // eslint-disable-next-line no-shadow


      function useRecoilValue(recoilValue) {
        {
          validateRecoilValue(recoilValue, 'useRecoilValue');
        }

        const loadable = useRecoilValueLoadable(recoilValue);
        return handleLoadable(loadable, recoilValue, storeRef);
      } // eslint-disable-next-line no-shadow


      function useRecoilState(recoilState) {
        {
          validateRecoilValue(recoilState, 'useRecoilState');
        }

        return [useRecoilValue(recoilState), useSetRecoilState(recoilState)];
      } // eslint-disable-next-line no-shadow


      function useRecoilStateLoadable(recoilState) {
        {
          validateRecoilValue(recoilState, 'useRecoilStateLoadable');
        }

        return [useRecoilValueLoadable(recoilState), useSetRecoilState(recoilState)];
      }

      return {
        getRecoilValue: useRecoilValue,
        getRecoilValueLoadable: useRecoilValueLoadable,
        getRecoilState: useRecoilState,
        getRecoilStateLoadable: useRecoilStateLoadable,
        getSetRecoilState: useSetRecoilState,
        getResetRecoilState: useResetRecoilState
      };
    }, [recoilValuesUsed, storeRef]);
  }

  const recoilComponentGetRecoilValueCount_FOR_TESTING = {
    current: 0
  };

  function useRecoilValueLoadable_SYNC_EXTERNAL_STORE(recoilValue) {
    const storeRef = useStoreRef$2();
    const componentName = Recoil_useComponentName();
    const getSnapshot = useCallback$1(() => {
      var _storeState$nextTree2;

      {
        recoilComponentGetRecoilValueCount_FOR_TESTING.current++;
      }

      const store = storeRef.current;
      const storeState = store.getState();
      const treeState = reactMode$3().early ? (_storeState$nextTree2 = storeState.nextTree) !== null && _storeState$nextTree2 !== void 0 ? _storeState$nextTree2 : storeState.currentTree : storeState.currentTree;
      const loadable = getRecoilValueAsLoadable$2(store, recoilValue, treeState);
      return {
        loadable,
        key: recoilValue.key
      };
    }, [storeRef, recoilValue]); // Memoize the state to avoid unnecessary rerenders

    const memoizePreviousSnapshot = useCallback$1(getState => {
      let prevState;
      return () => {
        var _prevState, _prevState2;

        const nextState = getState();

        if ((_prevState = prevState) !== null && _prevState !== void 0 && _prevState.loadable.is(nextState.loadable) && ((_prevState2 = prevState) === null || _prevState2 === void 0 ? void 0 : _prevState2.key) === nextState.key) {
          return prevState;
        }

        prevState = nextState;
        return nextState;
      };
    }, []);
    const getMemoizedSnapshot = useMemo$1(() => memoizePreviousSnapshot(getSnapshot), [getSnapshot, memoizePreviousSnapshot]);
    const subscribe = useCallback$1(notify => {
      const store = storeRef.current;
      const subscription = subscribeToRecoilValue$1(store, recoilValue, notify, componentName);
      return subscription.release;
    }, [storeRef, recoilValue, componentName]);
    return useSyncExternalStore$1(subscribe, getMemoizedSnapshot, // getSnapshot()
    getMemoizedSnapshot // getServerSnapshot() for SSR support
    ).loadable;
  }

  function useRecoilValueLoadable_MUTABLE_SOURCE(recoilValue) {
    const storeRef = useStoreRef$2();
    const getLoadable = useCallback$1(() => {
      var _storeState$nextTree3;

      const store = storeRef.current;
      const storeState = store.getState();
      const treeState = reactMode$3().early ? (_storeState$nextTree3 = storeState.nextTree) !== null && _storeState$nextTree3 !== void 0 ? _storeState$nextTree3 : storeState.currentTree : storeState.currentTree;
      return getRecoilValueAsLoadable$2(store, recoilValue, treeState);
    }, [storeRef, recoilValue]);
    const getLoadableWithTesting = useCallback$1(() => {
      {
        recoilComponentGetRecoilValueCount_FOR_TESTING.current++;
      }

      return getLoadable();
    }, [getLoadable]);
    const componentName = Recoil_useComponentName();
    const subscribe = useCallback$1((_storeState, notify) => {
      const store = storeRef.current;
      const subscription = subscribeToRecoilValue$1(store, recoilValue, () => {
        if (!Recoil_gkx('recoil_suppress_rerender_in_callback')) {
          return notify();
        } // Only re-render if the value has changed.
        // This will evaluate the atom/selector now as well as when the
        // component renders, but that may help with prefetching.


        const newLoadable = getLoadable();

        if (!prevLoadableRef.current.is(newLoadable)) {
          notify();
        } // If the component is suspended then the effect setting prevLoadableRef
        // will not run.  So, set the previous value here when its subscription
        // is fired to wake it up.  We can't just rely on this, though, because
        // this only executes when an atom/selector is dirty and the atom/selector
        // passed to the hook can dynamically change.


        prevLoadableRef.current = newLoadable;
      }, componentName);
      return subscription.release;
    }, [storeRef, recoilValue, componentName, getLoadable]);
    const source = useRecoilMutableSource$1();

    if (source == null) {
      throw Recoil_err('Recoil hooks must be used in components contained within a <RecoilRoot> component.');
    }

    const loadable = useMutableSource$1(source, getLoadableWithTesting, subscribe);
    const prevLoadableRef = useRef$4(loadable);
    useEffect$3(() => {
      prevLoadableRef.current = loadable;
    });
    return loadable;
  }

  function useRecoilValueLoadable_TRANSITION_SUPPORT(recoilValue) {
    const storeRef = useStoreRef$2();
    const componentName = Recoil_useComponentName(); // Accessors to get the current state

    const getLoadable = useCallback$1(() => {
      var _storeState$nextTree4;

      {
        recoilComponentGetRecoilValueCount_FOR_TESTING.current++;
      }

      const store = storeRef.current;
      const storeState = store.getState();
      const treeState = reactMode$3().early ? (_storeState$nextTree4 = storeState.nextTree) !== null && _storeState$nextTree4 !== void 0 ? _storeState$nextTree4 : storeState.currentTree : storeState.currentTree;
      return getRecoilValueAsLoadable$2(store, recoilValue, treeState);
    }, [storeRef, recoilValue]);
    const getState = useCallback$1(() => ({
      loadable: getLoadable(),
      key: recoilValue.key
    }), [getLoadable, recoilValue.key]); // Memoize state snapshots

    const updateState = useCallback$1(prevState => {
      const nextState = getState();
      return prevState.loadable.is(nextState.loadable) && prevState.key === nextState.key ? prevState : nextState;
    }, [getState]); // Subscribe to Recoil state changes

    useEffect$3(() => {
      const subscription = subscribeToRecoilValue$1(storeRef.current, recoilValue, _state => {
        setState(updateState);
      }, componentName); // Update state in case we are using a different key

      setState(updateState);
      return subscription.release;
    }, [componentName, recoilValue, storeRef, updateState]); // Get the current state

    const [state, setState] = useState$1(getState); // If we changed keys, then return the state for the new key.
    // This is important in case the old key would cause the component to suspend.
    // We don't have to set the new state here since the subscribing effect above
    // will do that.

    return state.key !== recoilValue.key ? getState().loadable : state.loadable;
  }

  function useRecoilValueLoadable_LEGACY(recoilValue) {
    const storeRef = useStoreRef$2(); // eslint-disable-next-line fb-www/react-no-unused-state-hook

    const [, forceUpdate] = useState$1([]);
    const componentName = Recoil_useComponentName();
    const getLoadable = useCallback$1(() => {
      var _storeState$nextTree5;

      {
        recoilComponentGetRecoilValueCount_FOR_TESTING.current++;
      }

      const store = storeRef.current;
      const storeState = store.getState();
      const treeState = reactMode$3().early ? (_storeState$nextTree5 = storeState.nextTree) !== null && _storeState$nextTree5 !== void 0 ? _storeState$nextTree5 : storeState.currentTree : storeState.currentTree;
      return getRecoilValueAsLoadable$2(store, recoilValue, treeState);
    }, [storeRef, recoilValue]);
    const loadable = getLoadable();
    const prevLoadableRef = useRef$4(loadable);
    useEffect$3(() => {
      prevLoadableRef.current = loadable;
    });
    useEffect$3(() => {
      const store = storeRef.current;
      const storeState = store.getState();
      const subscription = subscribeToRecoilValue$1(store, recoilValue, _state => {
        var _prevLoadableRef$curr;

        if (!Recoil_gkx('recoil_suppress_rerender_in_callback')) {
          return forceUpdate([]);
        }

        const newLoadable = getLoadable();

        if (!((_prevLoadableRef$curr = prevLoadableRef.current) !== null && _prevLoadableRef$curr !== void 0 && _prevLoadableRef$curr.is(newLoadable))) {
          // $FlowFixMe[incompatible-call]
          forceUpdate(newLoadable);
        }

        prevLoadableRef.current = newLoadable;
      }, componentName);
      /**
       * Since we're subscribing in an effect we need to update to the latest
       * value of the atom since it may have changed since we rendered. We can
       * go ahead and do that now, unless we're in the middle of a batch --
       * in which case we should do it at the end of the batch, due to the
       * following edge case: Suppose an atom is updated in another useEffect
       * of this same component. Then the following sequence of events occur:
       * 1. Atom is updated and subs fired (but we may not be subscribed
       *    yet depending on order of effects, so we miss this) Updated value
       *    is now in nextTree, but not currentTree.
       * 2. This effect happens. We subscribe and update.
       * 3. From the update we re-render and read currentTree, with old value.
       * 4. Batcher's effect sets currentTree to nextTree.
       * In this sequence we miss the update. To avoid that, add the update
       * to queuedComponentCallback if a batch is in progress.
       */

      if (storeState.nextTree) {
        store.getState().queuedComponentCallbacks_DEPRECATED.push(() => {
          // $FlowFixMe[incompatible-type]
          prevLoadableRef.current = null;
          forceUpdate([]);
        });
      } else {
        var _prevLoadableRef$curr2;

        if (!Recoil_gkx('recoil_suppress_rerender_in_callback')) {
          return forceUpdate([]);
        }

        const newLoadable = getLoadable();

        if (!((_prevLoadableRef$curr2 = prevLoadableRef.current) !== null && _prevLoadableRef$curr2 !== void 0 && _prevLoadableRef$curr2.is(newLoadable))) {
          // $FlowFixMe[incompatible-call]
          forceUpdate(newLoadable);
        }

        prevLoadableRef.current = newLoadable;
      }

      return subscription.release;
    }, [componentName, getLoadable, recoilValue, storeRef]);
    return loadable;
  }
  /**
    Like useRecoilValue(), but either returns the value if available or
    just undefined if not available for any reason, such as pending or error.
  */


  function useRecoilValueLoadable(recoilValue) {
    {
      validateRecoilValue(recoilValue, 'useRecoilValueLoadable');
    }

    if (Recoil_gkx('recoil_memory_managament_2020')) {
      // eslint-disable-next-line fb-www/react-hooks
      Recoil_useRetain(recoilValue);
    }

    return {
      TRANSITION_SUPPORT: useRecoilValueLoadable_TRANSITION_SUPPORT,
      // Recoil will attemp to detect if `useSyncExternalStore()` is supported with
      // `reactMode()` before calling it.  However, sometimes the host React
      // environment supports it but uses additional React renderers (such as with
      // `react-three-fiber`) which do not.  While this is technically a user issue
      // by using a renderer with React 18+ that doesn't fully support React 18 we
      // don't want to break users if it can be avoided. As the current renderer can
      // change at runtime, we need to dynamically check and fallback if necessary.
      SYNC_EXTERNAL_STORE: currentRendererSupportsUseSyncExternalStore$1() ? useRecoilValueLoadable_SYNC_EXTERNAL_STORE : useRecoilValueLoadable_TRANSITION_SUPPORT,
      MUTABLE_SOURCE: useRecoilValueLoadable_MUTABLE_SOURCE,
      LEGACY: useRecoilValueLoadable_LEGACY
    }[reactMode$3().mode](recoilValue);
  }
  /**
    Returns the value represented by the RecoilValue.
    If the value is pending, it will throw a Promise to suspend the component,
    if the value is an error it will throw it for the nearest React error boundary.
    This will also subscribe the component for any updates in the value.
    */


  function useRecoilValue(recoilValue) {
    {
      validateRecoilValue(recoilValue, 'useRecoilValue');
    }

    const storeRef = useStoreRef$2();
    const loadable = useRecoilValueLoadable(recoilValue);
    return handleLoadable(loadable, recoilValue, storeRef);
  }
  /**
    Returns a function that allows the value of a RecoilState to be updated, but does
    not subscribe the component to changes to that RecoilState.
  */


  function useSetRecoilState(recoilState) {
    {
      validateRecoilValue(recoilState, 'useSetRecoilState');
    }

    const storeRef = useStoreRef$2();
    return useCallback$1(newValueOrUpdater => {
      setRecoilValue$2(storeRef.current, recoilState, newValueOrUpdater);
    }, [storeRef, recoilState]);
  }
  /**
    Returns a function that will reset the value of a RecoilState to its default
  */


  function useResetRecoilState(recoilState) {
    {
      validateRecoilValue(recoilState, 'useResetRecoilState');
    }

    const storeRef = useStoreRef$2();
    return useCallback$1(() => {
      setRecoilValue$2(storeRef.current, recoilState, DEFAULT_VALUE$2);
    }, [storeRef, recoilState]);
  }
  /**
    Equivalent to useState(). Allows the value of the RecoilState to be read and written.
    Subsequent updates to the RecoilState will cause the component to re-render. If the
    RecoilState is pending, this will suspend the component and initiate the
    retrieval of the value. If evaluating the RecoilState resulted in an error, this will
    throw the error so that the nearest React error boundary can catch it.
  */


  function useRecoilState(recoilState) {
    {
      validateRecoilValue(recoilState, 'useRecoilState');
    }

    return [useRecoilValue(recoilState), useSetRecoilState(recoilState)];
  }
  /**
    Like useRecoilState(), but does not cause Suspense or React error handling. Returns
    an object that indicates whether the RecoilState is available, pending, or
    unavailable due to an error.
  */


  function useRecoilStateLoadable(recoilState) {
    {
      validateRecoilValue(recoilState, 'useRecoilStateLoadable');
    }

    return [useRecoilValueLoadable(recoilState), useSetRecoilState(recoilState)];
  }

  function useSetUnvalidatedAtomValues() {
    const storeRef = useStoreRef$2();
    return (values, transactionMetadata = {}) => {
      batchUpdates$2(() => {
        storeRef.current.addTransactionMetadata(transactionMetadata);
        values.forEach((value, key) => setUnvalidatedRecoilValue$2(storeRef.current, new AbstractRecoilValue$3(key), value));
      });
    };
  }
  /**
   * Experimental variants of hooks with support for useTransition()
   */


  function useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE(recoilValue) {
    {
      validateRecoilValue(recoilValue, 'useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE');

      if (!reactMode$3().early) {
        Recoil_recoverableViolation('Attepmt to use a hook with UNSTABLE_TRANSITION_SUPPORT in a rendering mode incompatible with concurrent rendering.  Try enabling the recoil_sync_external_store or recoil_transition_support GKs.');
      }
    }

    if (Recoil_gkx('recoil_memory_managament_2020')) {
      // eslint-disable-next-line fb-www/react-hooks
      Recoil_useRetain(recoilValue);
    }

    return useRecoilValueLoadable_TRANSITION_SUPPORT(recoilValue);
  }

  function useRecoilValue_TRANSITION_SUPPORT_UNSTABLE(recoilValue) {
    {
      validateRecoilValue(recoilValue, 'useRecoilValue_TRANSITION_SUPPORT_UNSTABLE');
    }

    const storeRef = useStoreRef$2();
    const loadable = useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE(recoilValue);
    return handleLoadable(loadable, recoilValue, storeRef);
  }

  function useRecoilState_TRANSITION_SUPPORT_UNSTABLE(recoilState) {
    {
      validateRecoilValue(recoilState, 'useRecoilState_TRANSITION_SUPPORT_UNSTABLE');
    }

    return [useRecoilValue_TRANSITION_SUPPORT_UNSTABLE(recoilState), useSetRecoilState(recoilState)];
  }

  var Recoil_Hooks = {
    recoilComponentGetRecoilValueCount_FOR_TESTING,
    useRecoilInterface: useRecoilInterface_DEPRECATED,
    useRecoilState,
    useRecoilStateLoadable,
    useRecoilValue,
    useRecoilValueLoadable,
    useResetRecoilState,
    useSetRecoilState,
    useSetUnvalidatedAtomValues,
    useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE,
    useRecoilValue_TRANSITION_SUPPORT_UNSTABLE,
    useRecoilState_TRANSITION_SUPPORT_UNSTABLE
  };

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */
  /**
   * Returns a map containing all of the keys + values from the original map where
   * the given callback returned true.
   */

  function filterMap(map, callback) {
    const result = new Map();

    for (const [key, value] of map) {
      if (callback(value, key)) {
        result.set(key, value);
      }
    }

    return result;
  }

  var Recoil_filterMap = filterMap;

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */
  /**
   * Returns a set containing all of the values from the original set where
   * the given callback returned true.
   */

  function filterSet(set, callback) {
    const result = new Set();

    for (const value of set) {
      if (callback(value)) {
        result.add(value);
      }
    }

    return result;
  }

  var Recoil_filterSet = filterSet;

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  function mergeMaps(...maps) {
    const result = new Map();

    for (let i = 0; i < maps.length; i++) {
      const iterator = maps[i].keys();
      let nextKey;

      while (!(nextKey = iterator.next()).done) {
        // $FlowIssue[incompatible-call] - map/iterator knows nothing about flow types
        result.set(nextKey.value, maps[i].get(nextKey.value));
      }
    }

    return result;
  }

  var Recoil_mergeMaps = mergeMaps;

  const {
    batchUpdates: batchUpdates$3
  } = Recoil_Batching;

  const {
    DEFAULT_VALUE: DEFAULT_VALUE$3,
    getNode: getNode$4,
    nodes: nodes$1
  } = Recoil_Node;

  const {
    useStoreRef: useStoreRef$3
  } = Recoil_RecoilRoot;

  const {
    AbstractRecoilValue: AbstractRecoilValue$4,
    setRecoilValueLoadable: setRecoilValueLoadable$1
  } = Recoil_RecoilValueInterface;

  const {
    SUSPENSE_TIMEOUT_MS: SUSPENSE_TIMEOUT_MS$2
  } = Recoil_Retention;

  const {
    cloneSnapshot: cloneSnapshot$1
  } = Recoil_Snapshot$1;

  const {
    useCallback: useCallback$2,
    useEffect: useEffect$4,
    useRef: useRef$5,
    useState: useState$2
  } = react;

  const {
    isSSR: isSSR$4
  } = Recoil_Environment;















  function useTransactionSubscription(callback) {
    const storeRef = useStoreRef$3();
    useEffect$4(() => {
      const sub = storeRef.current.subscribeToTransactions(callback);
      return sub.release;
    }, [callback, storeRef]);
  }

  function externallyVisibleAtomValuesInState(state) {
    const atomValues = state.atomValues.toMap();
    const persistedAtomContentsValues = Recoil_mapMap(Recoil_filterMap(atomValues, (v, k) => {
      const node = getNode$4(k);
      const persistence = node.persistence_UNSTABLE;
      return persistence != null && persistence.type !== 'none' && v.state === 'hasValue';
    }), v => v.contents); // Merge in nonvalidated atoms; we may not have defs for them but they will
    // all have persistence on or they wouldn't be there in the first place.

    return Recoil_mergeMaps(state.nonvalidatedAtoms.toMap(), persistedAtomContentsValues);
  }

  /**
    Calls the given callback after any atoms have been modified and the consequent
    component re-renders have been committed. This is intended for persisting
    the values of the atoms to storage. The stored values can then be restored
    using the useSetUnvalidatedAtomValues hook.

    The callback receives the following info:

    atomValues: The current value of every atom that is both persistable (persistence
                type not set to 'none') and whose value is available (not in an
                error or loading state).

    previousAtomValues: The value of every persistable and available atom before
                 the transaction began.

    atomInfo: A map containing the persistence settings for each atom. Every key
              that exists in atomValues will also exist in atomInfo.

    modifiedAtoms: The set of atoms that were written to during the transaction.

    transactionMetadata: Arbitrary information that was added via the
            useSetUnvalidatedAtomValues hook. Useful for ignoring the useSetUnvalidatedAtomValues
            transaction, to avoid loops.
  */
  function useTransactionObservation_DEPRECATED(callback) {
    useTransactionSubscription(useCallback$2(store => {
      let previousTree = store.getState().previousTree;
      const currentTree = store.getState().currentTree;

      if (!previousTree) {
        Recoil_recoverableViolation('Transaction subscribers notified without a previous tree being present -- this is a bug in Recoil');
        previousTree = store.getState().currentTree; // attempt to trundle on
      }

      const atomValues = externallyVisibleAtomValuesInState(currentTree);
      const previousAtomValues = externallyVisibleAtomValuesInState(previousTree);
      const atomInfo = Recoil_mapMap(nodes$1, node => {
        var _node$persistence_UNS, _node$persistence_UNS2, _node$persistence_UNS3, _node$persistence_UNS4;

        return {
          persistence_UNSTABLE: {
            type: (_node$persistence_UNS = (_node$persistence_UNS2 = node.persistence_UNSTABLE) === null || _node$persistence_UNS2 === void 0 ? void 0 : _node$persistence_UNS2.type) !== null && _node$persistence_UNS !== void 0 ? _node$persistence_UNS : 'none',
            backButton: (_node$persistence_UNS3 = (_node$persistence_UNS4 = node.persistence_UNSTABLE) === null || _node$persistence_UNS4 === void 0 ? void 0 : _node$persistence_UNS4.backButton) !== null && _node$persistence_UNS3 !== void 0 ? _node$persistence_UNS3 : false
          }
        };
      }); // Filter on existance in atomValues so that externally-visible rules
      // are also applied to modified atoms (specifically exclude selectors):

      const modifiedAtoms = Recoil_filterSet(currentTree.dirtyAtoms, k => atomValues.has(k) || previousAtomValues.has(k));
      callback({
        atomValues,
        previousAtomValues,
        atomInfo,
        modifiedAtoms,
        transactionMetadata: { ...currentTree.transactionMetadata
        }
      });
    }, [callback]));
  }

  function useRecoilTransactionObserver(callback) {
    useTransactionSubscription(useCallback$2(store => {
      const snapshot = cloneSnapshot$1(store, 'latest');
      const previousSnapshot = cloneSnapshot$1(store, 'previous');
      callback({
        snapshot,
        previousSnapshot
      });
    }, [callback]));
  } // Return a snapshot of the current state and subscribe to all state changes


  function useRecoilSnapshot() {
    const storeRef = useStoreRef$3();
    const [snapshot, setSnapshot] = useState$2(() => cloneSnapshot$1(storeRef.current));
    const previousSnapshot = Recoil_usePrevious(snapshot);
    const timeoutID = useRef$5();
    const releaseRef = useRef$5();
    useTransactionSubscription(useCallback$2(store => setSnapshot(cloneSnapshot$1(store)), [])); // Retain snapshot for duration component is mounted

    useEffect$4(() => {
      const release = snapshot.retain(); // Release the retain from the rendering call

      if (timeoutID.current && !isSSR$4) {
        var _releaseRef$current;

        window.clearTimeout(timeoutID.current);
        timeoutID.current = null;
        (_releaseRef$current = releaseRef.current) === null || _releaseRef$current === void 0 ? void 0 : _releaseRef$current.call(releaseRef);
        releaseRef.current = null;
      }

      return () => {
        // Defer the release.  If "Fast Refresh"" is used then the component may
        // re-render with the same state.  The previous cleanup will then run and
        // then the new effect will run. We don't want the snapshot to be released
        // by that cleanup before the new effect has a chance to retain it again.
        // Use timeout of 10 to workaround Firefox issue: https://github.com/facebookexperimental/Recoil/issues/1936
        window.setTimeout(release, 10);
      };
    }, [snapshot]); // Retain snapshot until above effect is run.
    // Release after a threshold in case component is suspended.

    if (previousSnapshot !== snapshot && !isSSR$4) {
      // Release the previous snapshot
      if (timeoutID.current) {
        var _releaseRef$current2;

        window.clearTimeout(timeoutID.current);
        timeoutID.current = null;
        (_releaseRef$current2 = releaseRef.current) === null || _releaseRef$current2 === void 0 ? void 0 : _releaseRef$current2.call(releaseRef);
        releaseRef.current = null;
      }

      releaseRef.current = snapshot.retain();
      timeoutID.current = window.setTimeout(() => {
        var _releaseRef$current3;

        timeoutID.current = null;
        (_releaseRef$current3 = releaseRef.current) === null || _releaseRef$current3 === void 0 ? void 0 : _releaseRef$current3.call(releaseRef);
        releaseRef.current = null;
      }, SUSPENSE_TIMEOUT_MS$2);
    }

    return snapshot;
  }

  function gotoSnapshot(store, snapshot) {
    var _storeState$nextTree;

    const storeState = store.getState();
    const prev = (_storeState$nextTree = storeState.nextTree) !== null && _storeState$nextTree !== void 0 ? _storeState$nextTree : storeState.currentTree;
    const next = snapshot.getStore_INTERNAL().getState().currentTree;
    batchUpdates$3(() => {
      const keysToUpdate = new Set();

      for (const keys of [prev.atomValues.keys(), next.atomValues.keys()]) {
        for (const key of keys) {
          var _prev$atomValues$get, _next$atomValues$get;

          if (((_prev$atomValues$get = prev.atomValues.get(key)) === null || _prev$atomValues$get === void 0 ? void 0 : _prev$atomValues$get.contents) !== ((_next$atomValues$get = next.atomValues.get(key)) === null || _next$atomValues$get === void 0 ? void 0 : _next$atomValues$get.contents) && getNode$4(key).shouldRestoreFromSnapshots) {
            keysToUpdate.add(key);
          }
        }
      }

      keysToUpdate.forEach(key => {
        setRecoilValueLoadable$1(store, new AbstractRecoilValue$4(key), next.atomValues.has(key) ? Recoil_nullthrows(next.atomValues.get(key)) : DEFAULT_VALUE$3);
      });
      store.replaceState(state => ({ ...state,
        stateID: snapshot.getID()
      }));
    });
  }

  function useGotoRecoilSnapshot() {
    const storeRef = useStoreRef$3();
    return useCallback$2(snapshot => gotoSnapshot(storeRef.current, snapshot), [storeRef]);
  }

  var Recoil_SnapshotHooks = {
    useRecoilSnapshot,
    gotoSnapshot,
    useGotoRecoilSnapshot,
    useRecoilTransactionObserver,
    useTransactionObservation_DEPRECATED,
    useTransactionSubscription_DEPRECATED: useTransactionSubscription
  };

  const {
    peekNodeInfo: peekNodeInfo$2
  } = Recoil_FunctionalCore;

  const {
    useStoreRef: useStoreRef$4
  } = Recoil_RecoilRoot;

  function useGetRecoilValueInfo() {
    const storeRef = useStoreRef$4(); // $FlowFixMe[incompatible-return]

    return ({
      key
    }) => peekNodeInfo$2(storeRef.current, storeRef.current.getState().currentTree, key);
  }

  var Recoil_useGetRecoilValueInfo = useGetRecoilValueInfo;

  const {
    reactMode: reactMode$4
  } = Recoil_ReactMode;

  const {
    RecoilRoot: RecoilRoot$1,
    useStoreRef: useStoreRef$5
  } = Recoil_RecoilRoot;



  const {
    useMemo: useMemo$2
  } = react;

  function useRecoilBridgeAcrossReactRoots() {
    // The test fails when using useMutableSource(), but only if act() is used
    // for the nested root.  So, this may only be a testing environment issue.
    if (reactMode$4().mode === 'MUTABLE_SOURCE') {
      // eslint-disable-next-line fb-www/no-console
      console.warn('Warning: There are known issues using useRecoilBridgeAcrossReactRoots() in recoil_mutable_source rendering mode.  Please consider upgrading to recoil_sync_external_store mode.');
    }

    const store = useStoreRef$5().current;
    return useMemo$2(() => {
      // eslint-disable-next-line no-shadow
      function RecoilBridge({
        children
      }) {
        return /*#__PURE__*/react.createElement(RecoilRoot$1, {
          store_INTERNAL: store
        }, children);
      }

      return RecoilBridge;
    }, [store]);
  }

  var Recoil_useRecoilBridgeAcrossReactRoots = useRecoilBridgeAcrossReactRoots;

  const {
    loadableWithValue: loadableWithValue$1
  } = Recoil_Loadable$1;

  const {
    initializeNode: initializeNode$3
  } = Recoil_FunctionalCore;

  const {
    DEFAULT_VALUE: DEFAULT_VALUE$4,
    getNode: getNode$5
  } = Recoil_Node;

  const {
    copyTreeState: copyTreeState$1,
    getRecoilValueAsLoadable: getRecoilValueAsLoadable$3,
    invalidateDownstreams: invalidateDownstreams$1,
    writeLoadableToTreeState: writeLoadableToTreeState$1
  } = Recoil_RecoilValueInterface;



  function isAtom(recoilValue) {
    return getNode$5(recoilValue.key).nodeType === 'atom';
  }

  class TransactionInterfaceImpl {
    constructor(store, treeState) {
      _defineProperty(this, "_store", void 0);

      _defineProperty(this, "_treeState", void 0);

      _defineProperty(this, "_changes", void 0);

      _defineProperty(this, "get", recoilValue => {
        if (this._changes.has(recoilValue.key)) {
          // $FlowIssue[incompatible-return]
          return this._changes.get(recoilValue.key);
        }

        if (!isAtom(recoilValue)) {
          throw Recoil_err('Reading selectors within atomicUpdate is not supported');
        }

        const loadable = getRecoilValueAsLoadable$3(this._store, recoilValue, this._treeState);

        if (loadable.state === 'hasValue') {
          return loadable.contents;
        } else if (loadable.state === 'hasError') {
          throw loadable.contents;
        } else {
          throw Recoil_err(`Expected Recoil atom ${recoilValue.key} to have a value, but it is in a loading state.`);
        }
      });

      _defineProperty(this, "set", (recoilState, valueOrUpdater) => {
        if (!isAtom(recoilState)) {
          throw Recoil_err('Setting selectors within atomicUpdate is not supported');
        }

        if (typeof valueOrUpdater === 'function') {
          const current = this.get(recoilState);

          this._changes.set(recoilState.key, valueOrUpdater(current)); // flowlint-line unclear-type:off

        } else {
          // Initialize atom and run effects if not initialized yet
          initializeNode$3(this._store, recoilState.key, 'set');

          this._changes.set(recoilState.key, valueOrUpdater);
        }
      });

      _defineProperty(this, "reset", recoilState => {
        this.set(recoilState, DEFAULT_VALUE$4);
      });

      this._store = store;
      this._treeState = treeState;
      this._changes = new Map();
    } // Allow destructing
    // eslint-disable-next-line fb-www/extra-arrow-initializer


    newTreeState_INTERNAL() {
      if (this._changes.size === 0) {
        return this._treeState;
      }

      const newState = copyTreeState$1(this._treeState);

      for (const [k, v] of this._changes) {
        writeLoadableToTreeState$1(newState, k, loadableWithValue$1(v));
      }

      invalidateDownstreams$1(this._store, newState);
      return newState;
    }

  }

  function atomicUpdater(store) {
    return fn => {
      store.replaceState(treeState => {
        const changeset = new TransactionInterfaceImpl(store, treeState);
        fn(changeset);
        return changeset.newTreeState_INTERNAL();
      });
    };
  }

  var Recoil_AtomicUpdates = {
    atomicUpdater
  };

  var Recoil_AtomicUpdates_1 = Recoil_AtomicUpdates.atomicUpdater;

  var Recoil_AtomicUpdates$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    atomicUpdater: Recoil_AtomicUpdates_1
  });

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  function invariant(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  var invariant_1 = invariant;

  // @oss-only


  var Recoil_invariant = invariant_1;

  const {
    atomicUpdater: atomicUpdater$1
  } = Recoil_AtomicUpdates$1;

  const {
    batchUpdates: batchUpdates$4
  } = Recoil_Batching;

  const {
    DEFAULT_VALUE: DEFAULT_VALUE$5
  } = Recoil_Node;

  const {
    useStoreRef: useStoreRef$6
  } = Recoil_RecoilRoot;

  const {
    refreshRecoilValue: refreshRecoilValue$1,
    setRecoilValue: setRecoilValue$3
  } = Recoil_RecoilValueInterface;

  const {
    cloneSnapshot: cloneSnapshot$2
  } = Recoil_Snapshot$1;

  const {
    gotoSnapshot: gotoSnapshot$1
  } = Recoil_SnapshotHooks;

  const {
    useCallback: useCallback$3
  } = react;









  class Sentinel {}

  const SENTINEL = new Sentinel();

  function recoilCallback(store, fn, args, extraInterface) {
    let ret = SENTINEL;
    let releaseSnapshot;
    batchUpdates$4(() => {
      const errMsg = 'useRecoilCallback() expects a function that returns a function: ' + 'it accepts a function of the type (RecoilInterface) => (Args) => ReturnType ' + 'and returns a callback function (Args) => ReturnType, where RecoilInterface is ' + 'an object {snapshot, set, ...} and Args and ReturnType are the argument and return ' + 'types of the callback you want to create.  Please see the docs ' + 'at recoiljs.org for details.';

      if (typeof fn !== 'function') {
        throw Recoil_err(errMsg);
      } // Clone the snapshot lazily to avoid overhead if the callback does not use it.
      // Note that this means the snapshot may represent later state from when
      // the callback was called if it first accesses the snapshot asynchronously.


      const callbackInterface = Recoil_lazyProxy({ ...(extraInterface !== null && extraInterface !== void 0 ? extraInterface : {}),
        // flowlint-line unclear-type:off
        // $FlowFixMe[missing-local-annot]
        set: (node, newValue) => setRecoilValue$3(store, node, newValue),
        // $FlowFixMe[missing-local-annot]
        reset: node => setRecoilValue$3(store, node, DEFAULT_VALUE$5),
        // $FlowFixMe[missing-local-annot]
        refresh: node => refreshRecoilValue$1(store, node),
        gotoSnapshot: snapshot => gotoSnapshot$1(store, snapshot),
        transact_UNSTABLE: transaction => atomicUpdater$1(store)(transaction)
      }, {
        snapshot: () => {
          const snapshot = cloneSnapshot$2(store);
          releaseSnapshot = snapshot.retain();
          return snapshot;
        }
      });
      const callback = fn(callbackInterface);

      if (typeof callback !== 'function') {
        throw Recoil_err(errMsg);
      }

      ret = callback(...args);
    });
    !!(ret instanceof Sentinel) ?  Recoil_invariant(false, 'batchUpdates should return immediately')  : void 0;

    if (Recoil_isPromise(ret)) {
      ret = ret.finally(() => {
        var _releaseSnapshot;

        (_releaseSnapshot = releaseSnapshot) === null || _releaseSnapshot === void 0 ? void 0 : _releaseSnapshot();
      });
    } else {
      var _releaseSnapshot2;

      (_releaseSnapshot2 = releaseSnapshot) === null || _releaseSnapshot2 === void 0 ? void 0 : _releaseSnapshot2();
    }

    return ret;
  }

  function useRecoilCallback(fn, deps) {
    const storeRef = useStoreRef$6();
    return useCallback$3( // $FlowIssue[incompatible-call]
    (...args) => {
      return recoilCallback(storeRef.current, fn, args);
    }, deps != null ? [...deps, storeRef] : undefined // eslint-disable-line fb-www/react-hooks-deps
    );
  }

  var Recoil_useRecoilCallback = {
    recoilCallback,
    useRecoilCallback
  };

  const {
    useStoreRef: useStoreRef$7
  } = Recoil_RecoilRoot;

  const {
    refreshRecoilValue: refreshRecoilValue$2
  } = Recoil_RecoilValueInterface;

  const {
    useCallback: useCallback$4
  } = react;

  function useRecoilRefresher(recoilValue) {
    const storeRef = useStoreRef$7();
    return useCallback$4(() => {
      const store = storeRef.current;
      refreshRecoilValue$2(store, recoilValue);
    }, [recoilValue, storeRef]);
  }

  var Recoil_useRecoilRefresher = useRecoilRefresher;

  const {
    atomicUpdater: atomicUpdater$2
  } = Recoil_AtomicUpdates$1;

  const {
    useStoreRef: useStoreRef$8
  } = Recoil_RecoilRoot;

  const {
    useMemo: useMemo$3
  } = react;

  function useRecoilTransaction(fn, deps) {
    const storeRef = useStoreRef$8();
    return useMemo$3(() => (...args) => {
      const atomicUpdate = atomicUpdater$2(storeRef.current);
      atomicUpdate(transactionInterface => {
        fn(transactionInterface)(...args);
      });
    }, deps != null ? [...deps, storeRef] : undefined // eslint-disable-line fb-www/react-hooks-deps
    );
  }

  var Recoil_useRecoilTransaction = useRecoilTransaction;

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  class WrappedValue {
    constructor(value) {
      _defineProperty(this, "value", void 0);

      this.value = value;
    }

  }

  var Recoil_Wrapper = {
    WrappedValue
  };

  var Recoil_Wrapper_1 = Recoil_Wrapper.WrappedValue;

  var Recoil_Wrapper$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    WrappedValue: Recoil_Wrapper_1
  });

  const {
    isFastRefreshEnabled: isFastRefreshEnabled$2
  } = Recoil_ReactMode;



  class ChangedPathError extends Error {}

  class TreeCache {
    // $FlowIssue[unclear-type]
    constructor(options) {
      var _options$onHit, _options$onSet, _options$mapNodeValue;

      _defineProperty(this, "_name", void 0);

      _defineProperty(this, "_numLeafs", void 0);

      _defineProperty(this, "_root", void 0);

      _defineProperty(this, "_onHit", void 0);

      _defineProperty(this, "_onSet", void 0);

      _defineProperty(this, "_mapNodeValue", void 0);

      this._name = options === null || options === void 0 ? void 0 : options.name;
      this._numLeafs = 0;
      this._root = null;
      this._onHit = (_options$onHit = options === null || options === void 0 ? void 0 : options.onHit) !== null && _options$onHit !== void 0 ? _options$onHit : () => {};
      this._onSet = (_options$onSet = options === null || options === void 0 ? void 0 : options.onSet) !== null && _options$onSet !== void 0 ? _options$onSet : () => {};
      this._mapNodeValue = (_options$mapNodeValue = options === null || options === void 0 ? void 0 : options.mapNodeValue) !== null && _options$mapNodeValue !== void 0 ? _options$mapNodeValue : val => val;
    }

    size() {
      return this._numLeafs;
    } // $FlowIssue[unclear-type]


    root() {
      return this._root;
    }

    get(getNodeValue, handlers) {
      var _this$getLeafNode;

      return (_this$getLeafNode = this.getLeafNode(getNodeValue, handlers)) === null || _this$getLeafNode === void 0 ? void 0 : _this$getLeafNode.value;
    }

    getLeafNode(getNodeValue, handlers) {
      if (this._root == null) {
        return undefined;
      } // Iterate down the tree based on the current node values until we hit a leaf
      // $FlowIssue[unclear-type]


      let node = this._root;

      while (node) {
        handlers === null || handlers === void 0 ? void 0 : handlers.onNodeVisit(node);

        if (node.type === 'leaf') {
          this._onHit(node);

          return node;
        }

        const nodeValue = this._mapNodeValue(getNodeValue(node.nodeKey));

        node = node.branches.get(nodeValue);
      }

      return undefined;
    }

    set(route, value, handlers) {
      const addLeaf = () => {
        var _node2, _node3, _this$_root2, _handlers$onNodeVisit2;

        // First, setup the branch nodes for the route:
        // Iterate down the tree to find or add branch nodes following the route
        let node;
        let branchKey;

        for (const [nodeKey, nodeValue] of route) {
          var _node, _handlers$onNodeVisit, _this$_root;

          // If the previous root was a leaf, while we not have a get(), it means
          // the selector has inconsistent values or implementation changed.
          const root = this._root;

          if ((root === null || root === void 0 ? void 0 : root.type) === 'leaf') {
            throw this.invalidCacheError();
          } // node now refers to the next node down in the tree


          const parent = node; // $FlowFixMe[prop-missing]
          // $FlowFixMe[incompatible-type]

          node = parent ? parent.branches.get(branchKey) : root; // $FlowFixMe[prop-missing]
          // $FlowFixMe[incompatible-type]

          node = (_node = node) !== null && _node !== void 0 ? _node : {
            type: 'branch',
            nodeKey,
            parent,
            branches: new Map(),
            branchKey
          }; // If we found an existing node, confirm it has a consistent value

          if (node.type !== 'branch' || node.nodeKey !== nodeKey) {
            throw this.invalidCacheError();
          } // Add the branch node to the tree


          parent === null || parent === void 0 ? void 0 : parent.branches.set(branchKey, node);
          handlers === null || handlers === void 0 ? void 0 : (_handlers$onNodeVisit = handlers.onNodeVisit) === null || _handlers$onNodeVisit === void 0 ? void 0 : _handlers$onNodeVisit.call(handlers, node); // Prepare for next iteration and install root if it is new.

          branchKey = this._mapNodeValue(nodeValue);
          this._root = (_this$_root = this._root) !== null && _this$_root !== void 0 ? _this$_root : node;
        } // Second, setup the leaf node:
        // If there is an existing leaf for this route confirm it is consistent


        const oldLeaf = node ? (_node2 = node) === null || _node2 === void 0 ? void 0 : _node2.branches.get(branchKey) : this._root;

        if (oldLeaf != null && (oldLeaf.type !== 'leaf' || oldLeaf.branchKey !== branchKey)) {
          throw this.invalidCacheError();
        } // Create a new or replacement leaf.


        const leafNode = {
          type: 'leaf',
          value,
          parent: node,
          branchKey
        }; // Install the leaf and call handlers

        (_node3 = node) === null || _node3 === void 0 ? void 0 : _node3.branches.set(branchKey, leafNode);
        this._root = (_this$_root2 = this._root) !== null && _this$_root2 !== void 0 ? _this$_root2 : leafNode;
        this._numLeafs++;

        this._onSet(leafNode);

        handlers === null || handlers === void 0 ? void 0 : (_handlers$onNodeVisit2 = handlers.onNodeVisit) === null || _handlers$onNodeVisit2 === void 0 ? void 0 : _handlers$onNodeVisit2.call(handlers, leafNode);
      };

      try {
        addLeaf();
      } catch (error) {
        // If the cache was stale or observed inconsistent values, such as with
        // Fast Refresh, then clear it and rebuild with the new values.
        if (error instanceof ChangedPathError) {
          this.clear();
          addLeaf();
        } else {
          throw error;
        }
      }
    } // Returns true if leaf was actually deleted from the tree


    delete(leaf) {
      const root = this.root();

      if (!root) {
        return false;
      }

      if (leaf === root) {
        this._root = null;
        this._numLeafs = 0;
        return true;
      } // Iterate up from the leaf deleteing it from it's parent's branches.


      let node = leaf.parent;
      let branchKey = leaf.branchKey;

      while (node) {
        var _node4;

        node.branches.delete(branchKey); // Stop iterating if we hit the root.

        if (node === root) {
          if (node.branches.size === 0) {
            this._root = null;
            this._numLeafs = 0;
          } else {
            this._numLeafs--;
          }

          return true;
        } // Stop iterating if there are other branches since we don't need to
        // remove any more nodes.


        if (node.branches.size > 0) {
          break;
        } // Iterate up to our parent


        branchKey = (_node4 = node) === null || _node4 === void 0 ? void 0 : _node4.branchKey;
        node = node.parent;
      } // Confirm that the leaf we are deleting is actually attached to our tree


      for (; node !== root; node = node.parent) {
        if (node == null) {
          return false;
        }
      }

      this._numLeafs--;
      return true;
    }

    clear() {
      this._numLeafs = 0;
      this._root = null;
    }

    invalidCacheError() {
      const CHANGED_PATH_ERROR_MESSAGE = isFastRefreshEnabled$2() ? 'Possible Fast Refresh module reload detected.  ' + 'This may also be caused by an selector returning inconsistent values. ' + 'Resetting cache.' : 'Invalid cache values.  This happens when selectors do not return ' + 'consistent values for the same input dependency values.  That may also ' + 'be caused when using Fast Refresh to change a selector implementation.  ' + 'Resetting cache.';
      Recoil_recoverableViolation(CHANGED_PATH_ERROR_MESSAGE + (this._name != null ? ` - ${this._name}` : ''));
      throw new ChangedPathError();
    }

  }

  var Recoil_TreeCache = {
    TreeCache
  };

  var Recoil_TreeCache_1 = Recoil_TreeCache.TreeCache;

  var Recoil_TreeCache$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    TreeCache: Recoil_TreeCache_1
  });

  class LRUCache {
    constructor(options) {
      var _options$mapKey;

      _defineProperty(this, "_maxSize", void 0);

      _defineProperty(this, "_size", void 0);

      _defineProperty(this, "_head", void 0);

      _defineProperty(this, "_tail", void 0);

      _defineProperty(this, "_map", void 0);

      _defineProperty(this, "_keyMapper", void 0);

      this._maxSize = options.maxSize;
      this._size = 0;
      this._head = null;
      this._tail = null;
      this._map = new Map();
      this._keyMapper = (_options$mapKey = options.mapKey) !== null && _options$mapKey !== void 0 ? _options$mapKey : v => v;
    }

    head() {
      return this._head;
    }

    tail() {
      return this._tail;
    }

    size() {
      return this._size;
    }

    maxSize() {
      return this._maxSize;
    }

    has(key) {
      return this._map.has(this._keyMapper(key));
    }

    get(key) {
      const mappedKey = this._keyMapper(key);

      const node = this._map.get(mappedKey);

      if (!node) {
        return undefined;
      }

      this.set(key, node.value);
      return node.value;
    }

    set(key, val) {
      const mappedKey = this._keyMapper(key);

      const existingNode = this._map.get(mappedKey);

      if (existingNode) {
        this.delete(key);
      }

      const head = this.head();
      const node = {
        key,
        right: head,
        left: null,
        value: val
      };

      if (head) {
        head.left = node;
      } else {
        this._tail = node;
      }

      this._map.set(mappedKey, node);

      this._head = node;
      this._size++;

      this._maybeDeleteLRU();
    }

    _maybeDeleteLRU() {
      if (this.size() > this.maxSize()) {
        this.deleteLru();
      }
    }

    deleteLru() {
      const tail = this.tail();

      if (tail) {
        this.delete(tail.key);
      }
    }

    delete(key) {
      const mappedKey = this._keyMapper(key);

      if (!this._size || !this._map.has(mappedKey)) {
        return;
      }

      const node = Recoil_nullthrows(this._map.get(mappedKey));
      const right = node.right;
      const left = node.left;

      if (right) {
        right.left = node.left;
      }

      if (left) {
        left.right = node.right;
      }

      if (node === this.head()) {
        this._head = right;
      }

      if (node === this.tail()) {
        this._tail = left;
      }

      this._map.delete(mappedKey);

      this._size--;
    }

    clear() {
      this._size = 0;
      this._head = null;
      this._tail = null;
      this._map = new Map();
    }

  }

  var Recoil_LRUCache = {
    LRUCache
  };

  var Recoil_LRUCache_1 = Recoil_LRUCache.LRUCache;

  var Recoil_LRUCache$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    LRUCache: Recoil_LRUCache_1
  });

  const {
    LRUCache: LRUCache$1
  } = Recoil_LRUCache$1;

  const {
    TreeCache: TreeCache$1
  } = Recoil_TreeCache$1;

  function treeCacheLRU({
    name,
    maxSize,
    mapNodeValue = v => v
  }) {
    const lruCache = new LRUCache$1({
      maxSize
    });
    const cache = new TreeCache$1({
      name,
      mapNodeValue,
      onHit: node => {
        lruCache.set(node, true);
      },
      onSet: node => {
        const lruNode = lruCache.tail();
        lruCache.set(node, true);

        if (lruNode && cache.size() > maxSize) {
          // $FlowFixMe[incompatible-call]
          cache.delete(lruNode.key);
        }
      }
    });
    return cache;
  }

  var Recoil_treeCacheLRU = treeCacheLRU;

  const TIME_WARNING_THRESHOLD_MS = 15;

  function stringify(x, opt, key) {
    // A optimization to avoid the more expensive JSON.stringify() for simple strings
    // This may lose protection for u2028 and u2029, though.
    if (typeof x === 'string' && !x.includes('"') && !x.includes('\\')) {
      return `"${x}"`;
    } // Handle primitive types


    switch (typeof x) {
      case 'undefined':
        return '';
      // JSON.stringify(undefined) returns undefined, but we always want to return a string

      case 'boolean':
        return x ? 'true' : 'false';

      case 'number':
      case 'symbol':
        // case 'bigint': // BigInt is not supported in www
        return String(x);

      case 'string':
        // Add surrounding quotes and escape internal quotes
        return JSON.stringify(x);

      case 'function':
        if ((opt === null || opt === void 0 ? void 0 : opt.allowFunctions) !== true) {
          throw Recoil_err('Attempt to serialize function in a Recoil cache key');
        }

        return `__FUNCTION(${x.name})__`;
    }

    if (x === null) {
      return 'null';
    } // Fallback case for unknown types


    if (typeof x !== 'object') {
      var _JSON$stringify;

      return (_JSON$stringify = JSON.stringify(x)) !== null && _JSON$stringify !== void 0 ? _JSON$stringify : '';
    } // Deal with all promises as equivalent for now.


    if (Recoil_isPromise(x)) {
      return '__PROMISE__';
    } // Arrays handle recursive stringification


    if (Array.isArray(x)) {
      // $FlowFixMe[missing-local-annot]
      return `[${x.map((v, i) => stringify(v, opt, i.toString()))}]`;
    } // If an object defines a toJSON() method, then use that to override the
    // serialization.  This matches the behavior of JSON.stringify().
    // Pass the key for compatibility.
    // Immutable.js collections define this method to allow us to serialize them.


    if (typeof x.toJSON === 'function') {
      // flowlint-next-line unclear-type: off
      return stringify(x.toJSON(key), opt, key);
    } // For built-in Maps, sort the keys in a stable order instead of the
    // default insertion order.  Support non-string keys.


    if (x instanceof Map) {
      const obj = {};

      for (const [k, v] of x) {
        // Stringify will escape any nested quotes
        obj[typeof k === 'string' ? k : stringify(k, opt)] = v;
      }

      return stringify(obj, opt, key);
    } // For built-in Sets, sort the keys in a stable order instead of the
    // default insertion order.


    if (x instanceof Set) {
      return stringify( // $FlowFixMe[missing-local-annot]
      Array.from(x).sort((a, b) => stringify(a, opt).localeCompare(stringify(b, opt))), opt, key);
    } // Anything else that is iterable serialize as an Array.


    if (Symbol !== undefined && x[Symbol.iterator] != null && typeof x[Symbol.iterator] === 'function') {
      // flowlint-next-line unclear-type: off
      return stringify(Array.from(x), opt, key);
    } // For all other Objects, sort the keys in a stable order.


    return `{${Object.keys(x).filter(k => x[k] !== undefined).sort() // stringify the key to add quotes and escape any nested slashes or quotes.
  .map(k => `${stringify(k, opt)}:${stringify(x[k], opt, k)}`).join(',')}}`;
  } // Utility similar to JSON.stringify() except:
  // * Serialize built-in Sets as an Array
  // * Serialize built-in Maps as an Object.  Supports non-string keys.
  // * Serialize other iterables as arrays
  // * Sort the keys of Objects and Maps to have a stable order based on string conversion.
  //    This overrides their default insertion order.
  // * Still uses toJSON() of any object to override serialization
  // * Support Symbols (though don't guarantee uniqueness)
  // * We could support BigInt, but Flow doesn't seem to like it.
  // See Recoil_stableStringify-test.js for examples


  function stableStringify(x, opt = {
    allowFunctions: false
  }) {
    {
      if (typeof window !== 'undefined') {
        const startTime = window.performance ? window.performance.now() : 0;
        const str = stringify(x, opt);
        const endTime = window.performance ? window.performance.now() : 0;

        if (endTime - startTime > TIME_WARNING_THRESHOLD_MS) {
          /* eslint-disable fb-www/no-console */
          console.groupCollapsed(`Recoil: Spent ${endTime - startTime}ms computing a cache key`);
          console.warn(x, str);
          console.groupEnd();
          /* eslint-enable fb-www/no-console */
        }

        return str;
      }
    }

    return stringify(x, opt);
  }

  var Recoil_stableStringify = stableStringify;

  const {
    TreeCache: TreeCache$2
  } = Recoil_TreeCache$1;









  const defaultPolicy = {
    equality: 'reference',
    eviction: 'keep-all',
    maxSize: Infinity
  };

  function treeCacheFromPolicy({
    equality = defaultPolicy.equality,
    eviction = defaultPolicy.eviction,
    maxSize = defaultPolicy.maxSize
  } = defaultPolicy, name) {
    const valueMapper = getValueMapper(equality);
    return getTreeCache(eviction, maxSize, valueMapper, name);
  }

  function getValueMapper(equality) {
    switch (equality) {
      case 'reference':
        return val => val;

      case 'value':
        return val => Recoil_stableStringify(val);
    }

    throw Recoil_err(`Unrecognized equality policy ${equality}`);
  }

  function getTreeCache(eviction, maxSize, mapNodeValue, name) {
    switch (eviction) {
      case 'keep-all':
        return new TreeCache$2({
          name,
          mapNodeValue
        });

      case 'lru':
        return Recoil_treeCacheLRU({
          name,
          maxSize: Recoil_nullthrows(maxSize),
          mapNodeValue
        });

      case 'most-recent':
        return Recoil_treeCacheLRU({
          name,
          maxSize: 1,
          mapNodeValue
        });
    }

    throw Recoil_err(`Unrecognized eviction policy ${eviction}`);
  }

  var Recoil_treeCacheFromPolicy = treeCacheFromPolicy;

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  function isNode(object) {
    var _ownerDocument, _doc$defaultView;

    if (typeof window === 'undefined') {
      return false;
    }

    const doc = object != null ? (_ownerDocument = object.ownerDocument) !== null && _ownerDocument !== void 0 ? _ownerDocument : object : document;
    const defaultView = (_doc$defaultView = doc.defaultView) !== null && _doc$defaultView !== void 0 ? _doc$defaultView : window;
    return !!(object != null && (typeof defaultView.Node === 'function' ? object instanceof defaultView.Node : typeof object === 'object' && typeof object.nodeType === 'number' && typeof object.nodeName === 'string'));
  }

  var Recoil_isNode = isNode;

  const {
    isReactNative: isReactNative$1,
    isWindow: isWindow$1
  } = Recoil_Environment;





  function shouldNotBeFrozen(value) {
    // Primitives and functions:
    if (value === null || typeof value !== 'object') {
      return true;
    } // React elements:


    switch (typeof value.$$typeof) {
      case 'symbol':
        return true;

      case 'number':
        return true;
    } // Immutable structures:


    if (value['@@__IMMUTABLE_ITERABLE__@@'] != null || value['@@__IMMUTABLE_KEYED__@@'] != null || value['@@__IMMUTABLE_INDEXED__@@'] != null || value['@@__IMMUTABLE_ORDERED__@@'] != null || value['@@__IMMUTABLE_RECORD__@@'] != null) {
      return true;
    } // DOM nodes:


    if (Recoil_isNode(value)) {
      return true;
    }

    if (Recoil_isPromise(value)) {
      return true;
    }

    if (value instanceof Error) {
      return true;
    }

    if (ArrayBuffer.isView(value)) {
      return true;
    } // Some environments, just as Jest, don't work with the instanceof check


    if (!isReactNative$1 && isWindow$1(value)) {
      return true;
    }

    return false;
  } // Recursively freeze a value to enforce it is read-only.
  // This may also have minimal performance improvements for enumerating
  // objects (based on browser implementations, of course)


  function deepFreezeValue(value) {
    if (typeof value !== 'object' || shouldNotBeFrozen(value)) {
      return;
    }

    Object.freeze(value); // Make all properties read-only

    for (const key in value) {
      // $FlowIssue[method-unbinding] added when improving typing for this parameters
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const prop = value[key]; // Prevent infinite recurssion for circular references.

        if (typeof prop === 'object' && prop != null && !Object.isFrozen(prop)) {
          deepFreezeValue(prop);
        }
      }
    }

    Object.seal(value); // This also makes existing properties non-configurable.
  }

  var Recoil_deepFreezeValue = deepFreezeValue;

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * This is a stub for some integration into FB internal stuff
   *
   * 
   * @format
   * @oncall recoil
   */
  function startPerfBlock(_id) {
    return () => null;
  }

  var Recoil_PerformanceTimings = {
    startPerfBlock
  };

  const {
    isLoadable: isLoadable$1,
    loadableWithError: loadableWithError$1,
    loadableWithPromise: loadableWithPromise$1,
    loadableWithValue: loadableWithValue$2
  } = Recoil_Loadable$1;

  const {
    WrappedValue: WrappedValue$1
  } = Recoil_Wrapper$1;



  const {
    getNodeLoadable: getNodeLoadable$2,
    peekNodeLoadable: peekNodeLoadable$1,
    setNodeValue: setNodeValue$3
  } = Recoil_FunctionalCore;

  const {
    saveDepsToStore: saveDepsToStore$1
  } = Recoil_Graph;

  const {
    DEFAULT_VALUE: DEFAULT_VALUE$6,
    getConfigDeletionHandler: getConfigDeletionHandler$1,
    getNode: getNode$6,
    registerNode: registerNode$1
  } = Recoil_Node;

  const {
    isRecoilValue: isRecoilValue$3
  } = Recoil_RecoilValue$1;

  const {
    markRecoilValueModified: markRecoilValueModified$1
  } = Recoil_RecoilValueInterface;

  const {
    retainedByOptionWithDefault: retainedByOptionWithDefault$1
  } = Recoil_Retention;

  const {
    recoilCallback: recoilCallback$1
  } = Recoil_useRecoilCallback;



















  const {
    startPerfBlock: startPerfBlock$1
  } = Recoil_PerformanceTimings;



  class Canceled {}

  const CANCELED = new Canceled();
  /**
   * An ExecutionID is an arbitrary ID that lets us distinguish executions from
   * each other. This is necessary as we need a way of solving this problem:
   * "given 3 async executions, only update state for the 'latest' execution when
   * it finishes running regardless of when the other 2 finish". ExecutionIDs
   * provide a convenient way of identifying executions so that we can track and
   * manage them over time.
   */

  const dependencyStack = []; // for detecting circular dependencies.

  const waitingStores = new Map();

  const getNewExecutionID = (() => {
    let executionID = 0;
    return () => executionID++;
  })();
  /* eslint-disable no-redeclare */


  function selector(options) {
    let recoilValue = null;
    const {
      key,
      get,
      cachePolicy_UNSTABLE: cachePolicy
    } = options;
    const set = options.set != null ? options.set : undefined; // flow

    {
      if (typeof key !== 'string') {
        throw Recoil_err('A key option with a unique string value must be provided when creating a selector.');
      }

      if (typeof get !== 'function') {
        throw Recoil_err('Selectors must specify a get callback option to get the selector value.');
      }
    } // This is every discovered dependency across all executions


    const discoveredDependencyNodeKeys = new Set();
    const cache = Recoil_treeCacheFromPolicy(cachePolicy !== null && cachePolicy !== void 0 ? cachePolicy : {
      equality: 'reference',
      eviction: 'keep-all'
    }, key);
    const retainedBy = retainedByOptionWithDefault$1(options.retainedBy_UNSTABLE);
    const executionInfoMap = new Map();
    let liveStoresCount = 0;

    function selectorIsLive() {
      return !Recoil_gkx('recoil_memory_managament_2020') || liveStoresCount > 0;
    }

    function selectorInit(store) {
      store.getState().knownSelectors.add(key);
      liveStoresCount++;
      return () => {
        liveStoresCount--;
      };
    }

    function selectorShouldDeleteConfigOnRelease() {
      return getConfigDeletionHandler$1(key) !== undefined && !selectorIsLive();
    }

    function resolveAsync(store, state, executionID, loadable, depValues) {
      setCache(state, loadable, depValues);
      notifyStoresOfResolvedAsync(store, executionID);
    }

    function notifyStoresOfResolvedAsync(store, executionID) {
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


    function notifyStoresOfNewAsyncDep(store, executionID) {
      if (isLatestExecution(store, executionID)) {
        const executionInfo = Recoil_nullthrows(getExecutionInfo(store));
        executionInfo.stateVersions.clear();
        notifyWaitingStores(executionID, false);
      }
    }

    function notifyWaitingStores(executionID, clearWaitlist) {
      const stores = waitingStores.get(executionID);

      if (stores != null) {
        for (const waitingStore of stores) {
          markRecoilValueModified$1(waitingStore, Recoil_nullthrows(recoilValue));
        }

        if (clearWaitlist) {
          waitingStores.delete(executionID);
        }
      }
    }

    function markStoreWaitingForResolvedAsync(store, executionID) {
      let stores = waitingStores.get(executionID);

      if (stores == null) {
        waitingStores.set(executionID, stores = new Set());
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


    function wrapResultPromise(store, promise, state, depValues, executionID, loadingDepsState) {
      return promise.then(value => {
        if (!selectorIsLive()) {
          // The selector was released since the request began; ignore the response.
          clearExecutionInfo(store);
          throw CANCELED;
        }

        const loadable = loadableWithValue$2(value);
        resolveAsync(store, state, executionID, loadable, depValues);
        return value;
      }).catch(errorOrPromise => {
        if (!selectorIsLive()) {
          // The selector was released since the request began; ignore the response.
          clearExecutionInfo(store);
          throw CANCELED;
        }

        if (Recoil_isPromise(errorOrPromise)) {
          return wrapPendingDependencyPromise(store, errorOrPromise, state, depValues, executionID, loadingDepsState);
        }

        const loadable = loadableWithError$1(errorOrPromise);
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


    function wrapPendingDependencyPromise(store, promise, state, existingDeps, executionID, loadingDepsState) {
      return promise.then(resolvedDep => {
        if (!selectorIsLive()) {
          // The selector was released since the request began; ignore the response.
          clearExecutionInfo(store);
          throw CANCELED;
        } // Check if we are handling a pending Recoil dependency or if the user
        // threw their own Promise to "suspend" a selector evaluation.  We need
        // to check that the loadingDepPromise actually matches the promise that
        // we caught in case the selector happened to catch the promise we threw
        // for a pending Recoil dependency from `getRecoilValue()` and threw
        // their own promise instead.


        if (loadingDepsState.loadingDepKey != null && loadingDepsState.loadingDepPromise === promise) {
          /**
           * Note for async atoms, this means we are changing the atom's value
           * in the store for the given version. This should be alright because
           * the version of state is now stale and a new version will have
           * already been triggered by the atom being resolved (see this logic
           * in Recoil_atom.js)
           */
          state.atomValues.set(loadingDepsState.loadingDepKey, loadableWithValue$2(resolvedDep));
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
          if (isLatestExecution(store, executionID) || getExecutionInfo(store) == null) {
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
        } // Retry the selector evaluation now that the dependency has resolved


        const [loadable, depValues] = evaluateSelectorGetter(store, state, executionID);

        if (loadable.state !== 'loading') {
          resolveAsync(store, state, executionID, loadable, depValues);
        }

        if (loadable.state === 'hasError') {
          throw loadable.contents;
        }

        return loadable.contents;
      }).catch(error => {
        // The selector was released since the request began; ignore the response.
        if (error instanceof Canceled) {
          throw CANCELED;
        }

        if (!selectorIsLive()) {
          clearExecutionInfo(store);
          throw CANCELED;
        }

        const loadable = loadableWithError$1(error);
        resolveAsync(store, state, executionID, loadable, existingDeps);
        throw error;
      });
    }

    function updateDeps(store, state, deps, executionID) {
      var _store$getState, _store$getState$curre, _store$getState2, _store$getState2$next;

      if (isLatestExecution(store, executionID) || state.version === ((_store$getState = store.getState()) === null || _store$getState === void 0 ? void 0 : (_store$getState$curre = _store$getState.currentTree) === null || _store$getState$curre === void 0 ? void 0 : _store$getState$curre.version) || state.version === ((_store$getState2 = store.getState()) === null || _store$getState2 === void 0 ? void 0 : (_store$getState2$next = _store$getState2.nextTree) === null || _store$getState2$next === void 0 ? void 0 : _store$getState2$next.version)) {
        var _store$getState$nextT, _store$getState3, _store$getState3$next;

        saveDepsToStore$1(key, deps, store, (_store$getState$nextT = (_store$getState3 = store.getState()) === null || _store$getState3 === void 0 ? void 0 : (_store$getState3$next = _store$getState3.nextTree) === null || _store$getState3$next === void 0 ? void 0 : _store$getState3$next.version) !== null && _store$getState$nextT !== void 0 ? _store$getState$nextT : store.getState().currentTree.version);
      }

      for (const nodeKey of deps) {
        discoveredDependencyNodeKeys.add(nodeKey);
      }
    }

    function evaluateSelectorGetter(store, state, executionID) {
      const endPerfBlock = startPerfBlock$1(key); // TODO T63965866: use execution ID here

      let duringSynchronousExecution = true;
      let duringAsynchronousExecution = true;

      const finishEvaluation = () => {
        endPerfBlock();
        duringAsynchronousExecution = false;
      };

      let result;
      let resultIsError = false;
      let loadable;
      const loadingDepsState = {
        loadingDepKey: null,
        loadingDepPromise: null
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

      const depValues = new Map();

      function getRecoilValue({
        key: depKey
      }) {
        const depLoadable = getNodeLoadable$2(store, state, depKey);
        depValues.set(depKey, depLoadable); // We need to update asynchronous dependencies as we go so the selector
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

        throw Recoil_err('Invalid Loadable state');
      }

      const getCallback = fn => {
        return (...args) => {
          if (duringAsynchronousExecution) {
            throw Recoil_err('Callbacks from getCallback() should only be called asynchronously after the selector is evalutated.  It can be used for selectors to return objects with callbacks that can work with Recoil state without a subscription.');
          }

          !(recoilValue != null) ?  Recoil_invariant(false, 'Recoil Value can never be null')  : void 0;
          return recoilCallback$1(store, fn, args, {
            node: recoilValue
          } // flowlint-line unclear-type:off
          );
        };
      };

      try {
        result = get({
          get: getRecoilValue,
          getCallback
        });
        result = isRecoilValue$3(result) ? getRecoilValue(result) : result;

        if (isLoadable$1(result)) {
          if (result.state === 'hasError') {
            resultIsError = true;
          }

          result = result.contents;
        }

        if (Recoil_isPromise(result)) {
          result = wrapResultPromise(store, result, state, depValues, executionID, loadingDepsState).finally(finishEvaluation);
        } else {
          finishEvaluation();
        }

        result = result instanceof WrappedValue$1 ? result.value : result;
      } catch (errorOrDepPromise) {
        result = errorOrDepPromise;

        if (Recoil_isPromise(result)) {
          result = wrapPendingDependencyPromise(store, result, state, depValues, executionID, loadingDepsState).finally(finishEvaluation);
        } else {
          resultIsError = true;
          finishEvaluation();
        }
      }

      if (resultIsError) {
        loadable = loadableWithError$1(result);
      } else if (Recoil_isPromise(result)) {
        loadable = loadableWithPromise$1(result);
      } else {
        loadable = loadableWithValue$2(result);
      }

      duringSynchronousExecution = false;
      updateExecutionInfoDepValues(store, executionID, depValues);
      updateDeps(store, state, new Set(depValues.keys()), executionID);
      return [loadable, depValues];
    }

    function getLoadableFromCacheAndUpdateDeps(store, state) {
      // First, look up in the state cache
      // If it's here, then the deps in the store should already be valid.
      let cachedLoadable = state.atomValues.get(key);

      if (cachedLoadable != null) {
        return cachedLoadable;
      } // Second, look up in the selector cache and update the deps in the store


      const depsAfterCacheLookup = new Set();

      try {
        cachedLoadable = cache.get(nodeKey => {
          !(typeof nodeKey === 'string') ? "development" !== "production" ? Recoil_invariant(false, 'Cache nodeKey is type string') : Recoil_invariant(false) : void 0;
          return getNodeLoadable$2(store, state, nodeKey).contents;
        }, {
          onNodeVisit: node => {
            if (node.type === 'branch' && node.nodeKey !== key) {
              depsAfterCacheLookup.add(node.nodeKey);
            }
          }
        });
      } catch (error) {
        throw Recoil_err(`Problem with cache lookup for selector "${key}": ${error.message}`);
      }

      if (cachedLoadable) {
        var _getExecutionInfo;

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

        updateDeps(store, state, depsAfterCacheLookup, (_getExecutionInfo = getExecutionInfo(store)) === null || _getExecutionInfo === void 0 ? void 0 : _getExecutionInfo.executionID);
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


    function getSelectorLoadableAndUpdateDeps(store, state) {
      // First, see if our current state is cached
      const cachedVal = getLoadableFromCacheAndUpdateDeps(store, state);

      if (cachedVal != null) {
        clearExecutionInfo(store);
        return cachedVal;
      } // Second, check if there is already an ongoing execution based on the current state


      const inProgressExecutionInfo = getInProgressExecutionInfo(store, state);

      if (inProgressExecutionInfo != null) {
        var _inProgressExecutionI;

        if (((_inProgressExecutionI = inProgressExecutionInfo.loadingLoadable) === null || _inProgressExecutionI === void 0 ? void 0 : _inProgressExecutionI.state) === 'loading') {
          markStoreWaitingForResolvedAsync(store, inProgressExecutionInfo.executionID);
        } // FIXME: check after the fact to see if we made the right choice by waiting


        return inProgressExecutionInfo.loadingLoadable;
      } // Third, start a new evaluation of the selector


      const newExecutionID = getNewExecutionID();
      const [loadable, newDepValues] = evaluateSelectorGetter(store, state, newExecutionID);
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


    function getInProgressExecutionInfo(store, state) {
      // Sort the pending executions so that our current store is checked first.
      const pendingExecutions = Recoil_concatIterables([executionInfoMap.has(store) ? [Recoil_nullthrows(executionInfoMap.get(store))] : [], Recoil_mapIterable(Recoil_filterIterable(executionInfoMap, ([s]) => s !== store), ([, execInfo]) => execInfo)]);

      function anyDepChanged(execDepValues) {
        for (const [depKey, execLoadable] of execDepValues) {
          if (!getNodeLoadable$2(store, state, depKey).is(execLoadable)) {
            return true;
          }
        }

        return false;
      }

      for (const execInfo of pendingExecutions) {
        if ( // If this execution was already checked to be valid with this version
        // of state, then let's use it!
        execInfo.stateVersions.get(state.version) || // If the deps for the execution match our current state, then it's valid
        !anyDepChanged(execInfo.depValuesDiscoveredSoFarDuringAsyncWork)) {
          execInfo.stateVersions.set(state.version, true);
          return execInfo;
        } else {
          execInfo.stateVersions.set(state.version, false);
        }
      }

      return undefined;
    }

    function getExecutionInfo(store) {
      return executionInfoMap.get(store);
    }
    /**
     * This function will update the selector's execution info when the selector
     * has either finished running an execution or has started a new execution. If
     * the given loadable is in a 'loading' state, the intention is that a new
     * execution has started. Otherwise, the intention is that an execution has
     * just finished.
     */


    function setExecutionInfo(store, newExecutionID, loadable, depValues, state) {
      executionInfoMap.set(store, {
        depValuesDiscoveredSoFarDuringAsyncWork: depValues,
        executionID: newExecutionID,
        loadingLoadable: loadable,
        stateVersions: new Map([[state.version, true]])
      });
    }

    function updateExecutionInfoDepValues(store, executionID, depValues) {
      // We only need to bother updating the deps for the latest execution because
      // that's all getInProgressExecutionInfo() will be looking for.
      if (isLatestExecution(store, executionID)) {
        const executionInfo = getExecutionInfo(store);

        if (executionInfo != null) {
          executionInfo.depValuesDiscoveredSoFarDuringAsyncWork = depValues;
        }
      }
    }

    function clearExecutionInfo(store) {
      executionInfoMap.delete(store);
    }

    function isLatestExecution(store, executionID) {
      var _getExecutionInfo2;

      return executionID === ((_getExecutionInfo2 = getExecutionInfo(store)) === null || _getExecutionInfo2 === void 0 ? void 0 : _getExecutionInfo2.executionID);
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


    function depValuesToDepRoute(depValues) {
      return Array.from(depValues.entries()).map(([depKey, valLoadable]) => [depKey, valLoadable.contents]);
    }

    function setCache(state, loadable, depValues) {
      {
        if (loadable.state !== 'loading' && Boolean(options.dangerouslyAllowMutability) === false) {
          Recoil_deepFreezeValue(loadable.contents);
        }
      }

      state.atomValues.set(key, loadable);

      try {
        cache.set(depValuesToDepRoute(depValues), loadable);
      } catch (error) {
        throw Recoil_err(`Problem with setting cache for selector "${key}": ${error.message}`);
      }
    }

    function detectCircularDependencies(fn) {
      if (dependencyStack.includes(key)) {
        const message = `Recoil selector has circular dependencies: ${dependencyStack.slice(dependencyStack.indexOf(key)).join(' \u2192 ')}`;
        return loadableWithError$1(Recoil_err(message));
      }

      dependencyStack.push(key);

      try {
        return fn();
      } finally {
        dependencyStack.pop();
      }
    }

    function selectorPeek(store, state) {
      const cachedLoadable = state.atomValues.get(key);

      if (cachedLoadable != null) {
        return cachedLoadable;
      }

      return cache.get(nodeKey => {
        var _peekNodeLoadable;

        !(typeof nodeKey === 'string') ?  Recoil_invariant(false, 'Cache nodeKey is type string')  : void 0;
        return (_peekNodeLoadable = peekNodeLoadable$1(store, state, nodeKey)) === null || _peekNodeLoadable === void 0 ? void 0 : _peekNodeLoadable.contents;
      });
    }

    function selectorGet(store, state) {
      return detectCircularDependencies(() => getSelectorLoadableAndUpdateDeps(store, state));
    }

    function invalidateSelector(state) {
      state.atomValues.delete(key);
    }

    function clearSelectorCache(store, treeState) {
      !(recoilValue != null) ?  Recoil_invariant(false, 'Recoil Value can never be null')  : void 0;

      for (const nodeKey of discoveredDependencyNodeKeys) {
        var _node$clearCache;

        const node = getNode$6(nodeKey);
        (_node$clearCache = node.clearCache) === null || _node$clearCache === void 0 ? void 0 : _node$clearCache.call(node, store, treeState);
      }

      discoveredDependencyNodeKeys.clear();
      invalidateSelector(treeState);
      cache.clear();
      markRecoilValueModified$1(store, recoilValue);
    }

    if (set != null) {
      /**
       * ES5 strict mode prohibits defining non-top-level function declarations,
       * so don't use function declaration syntax here
       */
      const selectorSet = (store, state, newValue) => {
        let syncSelectorSetFinished = false;
        const writes = new Map();

        function getRecoilValue({
          key: depKey
        }) {
          if (syncSelectorSetFinished) {
            throw Recoil_err('Recoil: Async selector sets are not currently supported.');
          }

          const loadable = getNodeLoadable$2(store, state, depKey);

          if (loadable.state === 'hasValue') {
            return loadable.contents;
          } else if (loadable.state === 'loading') {
            const msg = `Getting value of asynchronous atom or selector "${depKey}" in a pending state while setting selector "${key}" is not yet supported.`;
            Recoil_recoverableViolation(msg);
            throw Recoil_err(msg);
          } else {
            throw loadable.contents;
          }
        }

        function setRecoilState(recoilState, valueOrUpdater // $FlowFixMe[missing-local-annot]
        ) {
          if (syncSelectorSetFinished) {
            const msg = 'Recoil: Async selector sets are not currently supported.';
            Recoil_recoverableViolation(msg);
            throw Recoil_err(msg);
          }

          const setValue = typeof valueOrUpdater === 'function' ? // cast to any because we can't restrict type S from being a function itself without losing support for opaque types
          // flowlint-next-line unclear-type:off
          valueOrUpdater(getRecoilValue(recoilState)) : valueOrUpdater;
          const upstreamWrites = setNodeValue$3(store, state, recoilState.key, setValue);
          upstreamWrites.forEach((v, k) => writes.set(k, v));
        }

        function resetRecoilState(recoilState) {
          setRecoilState(recoilState, DEFAULT_VALUE$6);
        }

        const ret = set({
          set: setRecoilState,
          get: getRecoilValue,
          reset: resetRecoilState
        }, newValue); // set should be a void method, but if the user makes it `async`, then it
        // will return a Promise, which we don't currently support.

        if (ret !== undefined) {
          throw Recoil_isPromise(ret) ? Recoil_err('Recoil: Async selector sets are not currently supported.') : Recoil_err('Recoil: selector set should be a void function.');
        }

        syncSelectorSetFinished = true;
        return writes;
      };

      return recoilValue = registerNode$1({
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
        retainedBy
      });
    } else {
      return recoilValue = registerNode$1({
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
        retainedBy
      });
    }
  }
  /* eslint-enable no-redeclare */
  // $FlowIssue[incompatible-use]
  // $FlowFixMe[missing-local-annot]


  selector.value = value => new WrappedValue$1(value);

  var Recoil_selector = selector;

  // @fb-only: import type {ScopeRules} from 'Recoil_ScopedAtom';
  // @fb-only: const {scopedAtom} = require('Recoil_ScopedAtom');
  const {
    isLoadable: isLoadable$2,
    loadableWithError: loadableWithError$2,
    loadableWithPromise: loadableWithPromise$2,
    loadableWithValue: loadableWithValue$3
  } = Recoil_Loadable$1;

  const {
    WrappedValue: WrappedValue$2
  } = Recoil_Wrapper$1;

  const {
    peekNodeInfo: peekNodeInfo$3
  } = Recoil_FunctionalCore;

  const {
    DEFAULT_VALUE: DEFAULT_VALUE$7,
    DefaultValue: DefaultValue$2,
    getConfigDeletionHandler: getConfigDeletionHandler$2,
    registerNode: registerNode$2,
    setConfigDeletionHandler: setConfigDeletionHandler$1
  } = Recoil_Node;

  const {
    isRecoilValue: isRecoilValue$4
  } = Recoil_RecoilValue$1;

  const {
    getRecoilValueAsLoadable: getRecoilValueAsLoadable$4,
    markRecoilValueModified: markRecoilValueModified$2,
    setRecoilValue: setRecoilValue$4,
    setRecoilValueLoadable: setRecoilValueLoadable$2
  } = Recoil_RecoilValueInterface;

  const {
    retainedByOptionWithDefault: retainedByOptionWithDefault$2
  } = Recoil_Retention;















  const unwrap = x => x instanceof WrappedValue$2 ? x.value : x;

  function baseAtom(options) {
    const {
      key,
      persistence_UNSTABLE: persistence
    } = options;
    const retainedBy = retainedByOptionWithDefault$2(options.retainedBy_UNSTABLE);
    let liveStoresCount = 0;

    function unwrapPromise(promise) {
      return loadableWithPromise$2(promise.then(value => {
        defaultLoadable = loadableWithValue$3(value);
        return value;
      }).catch(error => {
        defaultLoadable = loadableWithError$2(error);
        throw error;
      }));
    }

    let defaultLoadable = Recoil_isPromise(options.default) ? unwrapPromise(options.default) : isLoadable$2(options.default) ? options.default.state === 'loading' ? unwrapPromise(options.default.contents) : options.default : // $FlowFixMe[incompatible-call]
    loadableWithValue$3(unwrap(options.default));
    maybeFreezeValueOrPromise(defaultLoadable.contents);
    let cachedAnswerForUnvalidatedValue = undefined; // Cleanup handlers for this atom
    // Rely on stable reference equality of the store to use it as a key per <RecoilRoot>

    const cleanupEffectsByStore = new Map();

    function maybeFreezeValueOrPromise(valueOrPromise) {
      {
        if (options.dangerouslyAllowMutability !== true) {
          if (Recoil_isPromise(valueOrPromise)) {
            return valueOrPromise.then(value => {
              Recoil_deepFreezeValue(value);
              return value;
            });
          } else {
            Recoil_deepFreezeValue(valueOrPromise);
            return valueOrPromise;
          }
        }
      }

      return valueOrPromise;
    }

    function wrapPendingPromise(store, promise) {
      const wrappedPromise = promise.then(value => {
        var _store$getState$nextT, _state$atomValues$get;

        const state = (_store$getState$nextT = store.getState().nextTree) !== null && _store$getState$nextT !== void 0 ? _store$getState$nextT : store.getState().currentTree;

        if (((_state$atomValues$get = state.atomValues.get(key)) === null || _state$atomValues$get === void 0 ? void 0 : _state$atomValues$get.contents) === wrappedPromise) {
          setRecoilValue$4(store, node, value);
        }

        return value;
      }).catch(error => {
        var _store$getState$nextT2, _state$atomValues$get2;

        const state = (_store$getState$nextT2 = store.getState().nextTree) !== null && _store$getState$nextT2 !== void 0 ? _store$getState$nextT2 : store.getState().currentTree;

        if (((_state$atomValues$get2 = state.atomValues.get(key)) === null || _state$atomValues$get2 === void 0 ? void 0 : _state$atomValues$get2.contents) === wrappedPromise) {
          setRecoilValueLoadable$2(store, node, loadableWithError$2(error));
        }

        throw error;
      });
      return wrappedPromise;
    }

    function initAtom(store, initState, trigger) {
      var _options$effects;

      liveStoresCount++;

      const cleanupAtom = () => {
        var _cleanupEffectsByStor;

        liveStoresCount--;
        (_cleanupEffectsByStor = cleanupEffectsByStore.get(store)) === null || _cleanupEffectsByStor === void 0 ? void 0 : _cleanupEffectsByStor.forEach(cleanup => cleanup());
        cleanupEffectsByStore.delete(store);
      };

      store.getState().knownAtoms.add(key); // Setup async defaults to notify subscribers when they resolve

      if (defaultLoadable.state === 'loading') {
        const notifyDefaultSubscribers = () => {
          var _store$getState$nextT3;

          const state = (_store$getState$nextT3 = store.getState().nextTree) !== null && _store$getState$nextT3 !== void 0 ? _store$getState$nextT3 : store.getState().currentTree;

          if (!state.atomValues.has(key)) {
            markRecoilValueModified$2(store, node);
          }
        };

        defaultLoadable.contents.finally(notifyDefaultSubscribers);
      } ///////////////////
      // Run Atom Effects
      ///////////////////


      const effects = (_options$effects = options.effects) !== null && _options$effects !== void 0 ? _options$effects : options.effects_UNSTABLE;

      if (effects != null) {
        // This state is scoped by Store, since this is in the initAtom() closure
        let initValue = DEFAULT_VALUE$7;
        let isDuringInit = true;
        let isInitError = false;
        let pendingSetSelf = null;

        function getLoadable(recoilValue) {
          // Normally we can just get the current value of another atom.
          // But for our own value we need to check if there is a pending
          // initialized value or get the fallback default value.
          if (isDuringInit && recoilValue.key === key) {
            // Cast T to S
            const retValue = initValue; // flowlint-line unclear-type:off

            return retValue instanceof DefaultValue$2 ? peekAtom(store, initState) // flowlint-line unclear-type:off
            : Recoil_isPromise(retValue) ? loadableWithPromise$2(retValue.then(v => v instanceof DefaultValue$2 ? // Cast T to S
            defaultLoadable.toPromise() // flowlint-line unclear-type:off
            : v)) : // $FlowFixMe[incompatible-call]
            loadableWithValue$3(retValue);
          }

          return getRecoilValueAsLoadable$4(store, recoilValue);
        }

        function getPromise(recoilValue) {
          return getLoadable(recoilValue).toPromise();
        }

        function getInfo_UNSTABLE(recoilValue) {
          var _store$getState$nextT4;

          const info = peekNodeInfo$3(store, (_store$getState$nextT4 = store.getState().nextTree) !== null && _store$getState$nextT4 !== void 0 ? _store$getState$nextT4 : store.getState().currentTree, recoilValue.key);
          return isDuringInit && recoilValue.key === key && !(initValue instanceof DefaultValue$2) ? { ...info,
            isSet: true,
            loadable: getLoadable(recoilValue)
          } : info;
        }

        const setSelf = effect => valueOrUpdater => {
          if (isDuringInit) {
            const currentLoadable = getLoadable(node);
            const currentValue = currentLoadable.state === 'hasValue' ? currentLoadable.contents : DEFAULT_VALUE$7;
            initValue = typeof valueOrUpdater === 'function' ? // cast to any because we can't restrict T from being a function without losing support for opaque types
            valueOrUpdater(currentValue) // flowlint-line unclear-type:off
            : valueOrUpdater;

            if (Recoil_isPromise(initValue)) {
              initValue = initValue.then(value => {
                // Avoid calling onSet() when setSelf() initializes with a Promise
                pendingSetSelf = {
                  effect,
                  value
                };
                return value;
              });
            }
          } else {
            if (Recoil_isPromise(valueOrUpdater)) {
              throw Recoil_err('Setting atoms to async values is not implemented.');
            }

            if (typeof valueOrUpdater !== 'function') {
              pendingSetSelf = {
                effect,
                value: unwrap(valueOrUpdater)
              };
            }

            setRecoilValue$4(store, node, typeof valueOrUpdater === 'function' ? currentValue => {
              const newValue = unwrap( // cast to any because we can't restrict T from being a function without losing support for opaque types
              valueOrUpdater(currentValue) // flowlint-line unclear-type:off
              ); // $FlowFixMe[incompatible-type]

              pendingSetSelf = {
                effect,
                value: newValue
              };
              return newValue;
            } : unwrap(valueOrUpdater));
          }
        };

        const resetSelf = effect => () => setSelf(effect)(DEFAULT_VALUE$7);

        const onSet = effect => handler => {
          var _cleanupEffectsByStor2;

          const {
            release
          } = store.subscribeToTransactions(currentStore => {
            var _currentTree$atomValu;

            // eslint-disable-next-line prefer-const
            let {
              currentTree,
              previousTree
            } = currentStore.getState();

            if (!previousTree) {
              Recoil_recoverableViolation('Transaction subscribers notified without a next tree being present -- this is a bug in Recoil');
              previousTree = currentTree; // attempt to trundle on
            }

            const newLoadable = (_currentTree$atomValu = currentTree.atomValues.get(key)) !== null && _currentTree$atomValu !== void 0 ? _currentTree$atomValu : defaultLoadable;

            if (newLoadable.state === 'hasValue') {
              var _previousTree$atomVal, _pendingSetSelf, _pendingSetSelf2, _pendingSetSelf3;

              const newValue = newLoadable.contents;
              const oldLoadable = (_previousTree$atomVal = previousTree.atomValues.get(key)) !== null && _previousTree$atomVal !== void 0 ? _previousTree$atomVal : defaultLoadable;
              const oldValue = oldLoadable.state === 'hasValue' ? oldLoadable.contents : DEFAULT_VALUE$7; // TODO This isn't actually valid, use as a placeholder for now.
              // Ignore atom value changes that were set via setSelf() in the same effect.
              // We will still properly call the handler if there was a subsequent
              // set from something other than an atom effect which was batched
              // with the `setSelf()` call.  However, we may incorrectly ignore
              // the handler if the subsequent batched call happens to set the
              // atom to the exact same value as the `setSelf()`.   But, in that
              // case, it was kind of a noop, so the semantics are debatable..

              if (((_pendingSetSelf = pendingSetSelf) === null || _pendingSetSelf === void 0 ? void 0 : _pendingSetSelf.effect) !== effect || ((_pendingSetSelf2 = pendingSetSelf) === null || _pendingSetSelf2 === void 0 ? void 0 : _pendingSetSelf2.value) !== newValue) {
                handler(newValue, oldValue, !currentTree.atomValues.has(key));
              } else if (((_pendingSetSelf3 = pendingSetSelf) === null || _pendingSetSelf3 === void 0 ? void 0 : _pendingSetSelf3.effect) === effect) {
                pendingSetSelf = null;
              }
            }
          }, key);
          cleanupEffectsByStore.set(store, [...((_cleanupEffectsByStor2 = cleanupEffectsByStore.get(store)) !== null && _cleanupEffectsByStor2 !== void 0 ? _cleanupEffectsByStor2 : []), release]);
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
              getInfo_UNSTABLE
            });

            if (cleanup != null) {
              var _cleanupEffectsByStor3;

              cleanupEffectsByStore.set(store, [...((_cleanupEffectsByStor3 = cleanupEffectsByStore.get(store)) !== null && _cleanupEffectsByStor3 !== void 0 ? _cleanupEffectsByStor3 : []), cleanup]);
            }
          } catch (error) {
            initValue = error;
            isInitError = true;
          }
        }

        isDuringInit = false; // Mutate initial state in place since we know there are no other subscribers
        // since we are the ones initializing on first use.

        if (!(initValue instanceof DefaultValue$2)) {
          var _store$getState$nextT5;

          const initLoadable = isInitError ? loadableWithError$2(initValue) : Recoil_isPromise(initValue) ? loadableWithPromise$2(wrapPendingPromise(store, initValue)) : loadableWithValue$3(unwrap(initValue));
          maybeFreezeValueOrPromise(initLoadable.contents);
          initState.atomValues.set(key, initLoadable); // If there is a pending transaction, then also mutate the next state tree.
          // This could happen if the atom was first initialized in an action that
          // also updated some other atom's state.

          (_store$getState$nextT5 = store.getState().nextTree) === null || _store$getState$nextT5 === void 0 ? void 0 : _store$getState$nextT5.atomValues.set(key, initLoadable);
        }
      }

      return cleanupAtom;
    }

    function peekAtom(_store, state) {
      var _ref, _state$atomValues$get3;

      return (_ref = (_state$atomValues$get3 = state.atomValues.get(key)) !== null && _state$atomValues$get3 !== void 0 ? _state$atomValues$get3 : cachedAnswerForUnvalidatedValue) !== null && _ref !== void 0 ? _ref : defaultLoadable;
    }

    function getAtom(_store, state) {
      if (state.atomValues.has(key)) {
        // Atom value is stored in state:
        return Recoil_nullthrows(state.atomValues.get(key));
      } else if (state.nonvalidatedAtoms.has(key)) {
        // Atom value is stored but needs validation before use.
        // We might have already validated it and have a cached validated value:
        if (cachedAnswerForUnvalidatedValue != null) {
          return cachedAnswerForUnvalidatedValue;
        }

        if (persistence == null) {
          Recoil_expectationViolation(`Tried to restore a persisted value for atom ${key} but it has no persistence settings.`);
          return defaultLoadable;
        }

        const nonvalidatedValue = state.nonvalidatedAtoms.get(key);
        const validatorResult = persistence.validator(nonvalidatedValue, DEFAULT_VALUE$7);
        const validatedValueLoadable = validatorResult instanceof DefaultValue$2 ? defaultLoadable : loadableWithValue$3(validatorResult);
        cachedAnswerForUnvalidatedValue = validatedValueLoadable;
        return cachedAnswerForUnvalidatedValue;
      } else {
        return defaultLoadable;
      }
    }

    function invalidateAtom() {
      cachedAnswerForUnvalidatedValue = undefined;
    }

    function setAtom(_store, state, newValue) {
      // Bail out if we're being set to the existing value, or if we're being
      // reset but have no stored value (validated or unvalidated) to reset from:
      if (state.atomValues.has(key)) {
        const existing = Recoil_nullthrows(state.atomValues.get(key));

        if (existing.state === 'hasValue' && newValue === existing.contents) {
          return new Map();
        }
      } else if (!state.nonvalidatedAtoms.has(key) && newValue instanceof DefaultValue$2) {
        return new Map();
      }

      maybeFreezeValueOrPromise(newValue);
      cachedAnswerForUnvalidatedValue = undefined; // can be released now if it was previously in use

      return new Map().set(key, loadableWithValue$3(newValue));
    }

    function shouldDeleteConfigOnReleaseAtom() {
      return getConfigDeletionHandler$2(key) !== undefined && liveStoresCount <= 0;
    }

    const node = registerNode$2({
      key,
      nodeType: 'atom',
      peek: peekAtom,
      get: getAtom,
      set: setAtom,
      init: initAtom,
      invalidate: invalidateAtom,
      shouldDeleteConfigOnRelease: shouldDeleteConfigOnReleaseAtom,
      dangerouslyAllowMutability: options.dangerouslyAllowMutability,
      persistence_UNSTABLE: options.persistence_UNSTABLE ? {
        type: options.persistence_UNSTABLE.type,
        backButton: options.persistence_UNSTABLE.backButton
      } : undefined,
      shouldRestoreFromSnapshots: true,
      retainedBy
    });
    return node;
  } // prettier-ignore


  function atom(options) {
    {
      if (typeof options.key !== 'string') {
        throw Recoil_err('A key option with a unique string value must be provided when creating an atom.');
      }
    }

    const { // @fb-only: scopeRules_APPEND_ONLY_READ_THE_DOCS,
      ...restOptions
    } = options;
    const optionsDefault = 'default' in options ? // $FlowIssue[incompatible-type] No way to refine in Flow that property is not defined
    options.default : new Promise(() => {});

    if (isRecoilValue$4(optionsDefault) // Continue to use atomWithFallback for promise defaults for scoped atoms
    // for now, since scoped atoms don't support async defaults
    // @fb-only: || (isPromise(optionsDefault) && scopeRules_APPEND_ONLY_READ_THE_DOCS)
    // @fb-only: || (isLoadable(optionsDefault) && scopeRules_APPEND_ONLY_READ_THE_DOCS)
    ) {
      return atomWithFallback({ ...restOptions,
        default: optionsDefault // @fb-only: scopeRules_APPEND_ONLY_READ_THE_DOCS,

      }); // @fb-only: } else if (scopeRules_APPEND_ONLY_READ_THE_DOCS
      // @fb-only: && !isPromise(optionsDefault)
      // @fb-only: && !isLoadable(optionsDefault)
      // @fb-only: ) {
      // @fb-only: return scopedAtom<T>({
      // @fb-only: ...restOptions,
      // @fb-only: default: unwrap<T>(optionsDefault),
      // @fb-only: scopeRules_APPEND_ONLY_READ_THE_DOCS,
      // @fb-only: });
    } else {
      return baseAtom({ ...restOptions,
        default: optionsDefault
      });
    }
  }

  function atomWithFallback(options) {
    const base = atom({ ...options,
      default: DEFAULT_VALUE$7,
      persistence_UNSTABLE: options.persistence_UNSTABLE === undefined ? undefined : { ...options.persistence_UNSTABLE,
        validator: storedValue => storedValue instanceof DefaultValue$2 ? storedValue : Recoil_nullthrows(options.persistence_UNSTABLE).validator(storedValue, DEFAULT_VALUE$7)
      },
      // TODO Hack for now.
      effects: options.effects,
      // flowlint-line unclear-type: off
      effects_UNSTABLE: options.effects_UNSTABLE // flowlint-line unclear-type: off

    }); // $FlowFixMe[incompatible-call]

    const sel = Recoil_selector({
      key: `${options.key}__withFallback`,
      get: ({
        get
      }) => {
        const baseValue = get(base);
        return baseValue instanceof DefaultValue$2 ? options.default : baseValue;
      },
      // $FlowFixMe[incompatible-call]
      set: ({
        set
      }, newValue) => set(base, newValue),
      // This selector does not need to cache as it is a wrapper selector
      // and the selector within the wrapper selector will have a cache
      // option by default
      cachePolicy_UNSTABLE: {
        eviction: 'most-recent'
      },
      dangerouslyAllowMutability: options.dangerouslyAllowMutability
    });
    setConfigDeletionHandler$1(sel.key, getConfigDeletionHandler$2(options.key));
    return sel;
  } // $FlowFixMe[missing-local-annot]


  atom.value = value => new WrappedValue$2(value);

  var Recoil_atom = atom;

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * 
   * @format
   * @oncall recoil
   */

  class MapCache {
    constructor(options) {
      var _options$mapKey;

      _defineProperty(this, "_map", void 0);

      _defineProperty(this, "_keyMapper", void 0);

      this._map = new Map();
      this._keyMapper = (_options$mapKey = options === null || options === void 0 ? void 0 : options.mapKey) !== null && _options$mapKey !== void 0 ? _options$mapKey : v => v;
    }

    size() {
      return this._map.size;
    }

    has(key) {
      return this._map.has(this._keyMapper(key));
    }

    get(key) {
      return this._map.get(this._keyMapper(key));
    }

    set(key, val) {
      this._map.set(this._keyMapper(key), val);
    }

    delete(key) {
      this._map.delete(this._keyMapper(key));
    }

    clear() {
      this._map.clear();
    }

  }

  var Recoil_MapCache = {
    MapCache
  };

  var Recoil_MapCache_1 = Recoil_MapCache.MapCache;

  var Recoil_MapCache$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    MapCache: Recoil_MapCache_1
  });

  const {
    LRUCache: LRUCache$2
  } = Recoil_LRUCache$1;

  const {
    MapCache: MapCache$1
  } = Recoil_MapCache$1;







  const defaultPolicy$1 = {
    equality: 'reference',
    eviction: 'none',
    maxSize: Infinity
  };

  function cacheFromPolicy({
    equality = defaultPolicy$1.equality,
    eviction = defaultPolicy$1.eviction,
    maxSize = defaultPolicy$1.maxSize
  } = defaultPolicy$1) {
    const valueMapper = getValueMapper$1(equality);
    const cache = getCache(eviction, maxSize, valueMapper);
    return cache;
  }

  function getValueMapper$1(equality) {
    switch (equality) {
      case 'reference':
        return val => val;

      case 'value':
        return val => Recoil_stableStringify(val);
    }

    throw Recoil_err(`Unrecognized equality policy ${equality}`);
  }

  function getCache(eviction, maxSize, mapKey) {
    switch (eviction) {
      case 'keep-all':
        return new MapCache$1({
          mapKey
        });

      case 'lru':
        return new LRUCache$2({
          mapKey,
          maxSize: Recoil_nullthrows(maxSize)
        });

      case 'most-recent':
        return new LRUCache$2({
          mapKey,
          maxSize: 1
        });
    }

    throw Recoil_err(`Unrecognized eviction policy ${eviction}`);
  }

  var Recoil_cacheFromPolicy = cacheFromPolicy;

  // @fb-only: import type {ScopeRules} from 'Recoil_ScopedAtom';


  const {
    setConfigDeletionHandler: setConfigDeletionHandler$2
  } = Recoil_Node;





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
  function atomFamily(options) {
    var _options$cachePolicyF, _options$cachePolicyF2;

    const atomCache = Recoil_cacheFromPolicy({
      equality: (_options$cachePolicyF = (_options$cachePolicyF2 = options.cachePolicyForParams_UNSTABLE) === null || _options$cachePolicyF2 === void 0 ? void 0 : _options$cachePolicyF2.equality) !== null && _options$cachePolicyF !== void 0 ? _options$cachePolicyF : 'value',
      eviction: 'keep-all'
    }); // Simple atomFamily implementation to cache individual atoms based
    // on the parameter value equality.

    return params => {
      var _stableStringify, _options$effects;

      const cachedAtom = atomCache.get(params);

      if (cachedAtom != null) {
        return cachedAtom;
      }

      const {
        cachePolicyForParams_UNSTABLE,
        ...atomOptions
      } = options;
      const optionsDefault = 'default' in options ? // $FlowIssue[incompatible-type] No way to refine in Flow that property is not defined
      options.default : new Promise(() => {});
      const newAtom = Recoil_atom({ ...atomOptions,
        key: `${options.key}__${(_stableStringify = Recoil_stableStringify(params)) !== null && _stableStringify !== void 0 ? _stableStringify : 'void'}`,
        default: typeof optionsDefault === 'function' ? // The default was parameterized
        // Flow doesn't know that T isn't a function, so we need to case to any
        // $FlowIssue[incompatible-use]
        optionsDefault(params) : // Default may be a static value, promise, or RecoilValue
        optionsDefault,
        retainedBy_UNSTABLE: typeof options.retainedBy_UNSTABLE === 'function' ? options.retainedBy_UNSTABLE(params) : options.retainedBy_UNSTABLE,
        effects: typeof options.effects === 'function' ? options.effects(params) : typeof options.effects_UNSTABLE === 'function' ? options.effects_UNSTABLE(params) : (_options$effects = options.effects) !== null && _options$effects !== void 0 ? _options$effects : options.effects_UNSTABLE // prettier-ignore
        // @fb-only: scopeRules_APPEND_ONLY_READ_THE_DOCS: mapScopeRules(
        // @fb-only: options.scopeRules_APPEND_ONLY_READ_THE_DOCS,
        // @fb-only: params,
        // @fb-only: ),

      });
      atomCache.set(params, newAtom);
      setConfigDeletionHandler$2(newAtom.key, () => {
        atomCache.delete(params);
      });
      return newAtom;
    };
  }

  var Recoil_atomFamily = atomFamily;

  const {
    setConfigDeletionHandler: setConfigDeletionHandler$3
  } = Recoil_Node;





   // Keep in mind the parameter needs to be serializable as a cahche key
  // using Recoil_stableStringify


  // Add a unique index to each selector in case the cache implementation allows
  // duplicate keys based on equivalent stringified parameters
  let nextIndex = 0;
  /* eslint-disable no-redeclare */

  // Return a function that returns members of a family of selectors of the same type
  // E.g.,
  //
  // const s = selectorFamily(...);
  // s({a: 1}) => a selector
  // s({a: 2}) => a different selector
  //
  // By default, the selectors are distinguished by distinct values of the
  // parameter based on value equality, not reference equality.  This allows using
  // object literals or other equivalent objects at callsites to not create
  // duplicate cache entries.  This behavior may be overridden with the
  // cacheImplementationForParams option.
  function selectorFamily(options) {
    var _options$cachePolicyF, _options$cachePolicyF2;

    const selectorCache = Recoil_cacheFromPolicy({
      equality: (_options$cachePolicyF = (_options$cachePolicyF2 = options.cachePolicyForParams_UNSTABLE) === null || _options$cachePolicyF2 === void 0 ? void 0 : _options$cachePolicyF2.equality) !== null && _options$cachePolicyF !== void 0 ? _options$cachePolicyF : 'value',
      eviction: 'keep-all'
    });
    return params => {
      var _stableStringify;

      // Throw an error with selector key so that it is clear which
      // selector is causing an error
      let cachedSelector;

      try {
        cachedSelector = selectorCache.get(params);
      } catch (error) {
        throw Recoil_err(`Problem with cache lookup for selector ${options.key}: ${error.message}`);
      }

      if (cachedSelector != null) {
        return cachedSelector;
      }

      const myKey = `${options.key}__selectorFamily/${(_stableStringify = Recoil_stableStringify(params, {
      // It is possible to use functions in parameters if the user uses
      // a cache with reference equality thanks to the incrementing index.
      allowFunctions: true
    })) !== null && _stableStringify !== void 0 ? _stableStringify : 'void'}/${nextIndex++}`; // Append index in case values serialize to the same key string

      const myGet = callbacks => options.get(params)(callbacks);

      const myCachePolicy = options.cachePolicy_UNSTABLE;
      const retainedBy = typeof options.retainedBy_UNSTABLE === 'function' ? options.retainedBy_UNSTABLE(params) : options.retainedBy_UNSTABLE;
      let newSelector;

      if (options.set != null) {
        const set = options.set;

        const mySet = (callbacks, newValue) => set(params)(callbacks, newValue);

        newSelector = Recoil_selector({
          key: myKey,
          get: myGet,
          set: mySet,
          cachePolicy_UNSTABLE: myCachePolicy,
          dangerouslyAllowMutability: options.dangerouslyAllowMutability,
          retainedBy_UNSTABLE: retainedBy
        });
      } else {
        newSelector = Recoil_selector({
          key: myKey,
          get: myGet,
          cachePolicy_UNSTABLE: myCachePolicy,
          dangerouslyAllowMutability: options.dangerouslyAllowMutability,
          retainedBy_UNSTABLE: retainedBy
        });
      }

      selectorCache.set(params, newSelector);
      setConfigDeletionHandler$3(newSelector.key, () => {
        selectorCache.delete(params);
      });
      return newSelector;
    };
  }
  /* eslint-enable no-redeclare */


  var Recoil_selectorFamily = selectorFamily;

  // flowlint-next-line unclear-type:off


  const constantSelector = Recoil_selectorFamily({
    key: '__constant',
    get: constant => () => constant,
    cachePolicyForParams_UNSTABLE: {
      equality: 'reference'
    }
  }); // Function that returns a selector which always produces the
  // same constant value.  It may be called multiple times with the
  // same value, based on reference equality, and will provide the
  // same selector.

  function constSelector(constant) {
    return constantSelector(constant);
  }

  var Recoil_constSelector = constSelector;

  // flowlint-next-line unclear-type:off


  const throwingSelector = Recoil_selectorFamily({
    key: '__error',
    get: message => () => {
      throw Recoil_err(message);
    },
    // TODO Why?
    cachePolicyForParams_UNSTABLE: {
      equality: 'reference'
    }
  }); // Function that returns a selector which always throws an error
  // with the provided message.

  function errorSelector(message) {
    return throwingSelector(message);
  }

  var Recoil_errorSelector = errorSelector;

  /**
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *
   * Wraps another recoil value and prevents writing to it.
   *
   * 
   * @format
   * @oncall recoil
   */

  function readOnlySelector(atom) {
    // flowlint-next-line unclear-type: off
    return atom;
  }

  var Recoil_readOnlySelector = readOnlySelector;

  const {
    loadableWithError: loadableWithError$3,
    loadableWithPromise: loadableWithPromise$3,
    loadableWithValue: loadableWithValue$4
  } = Recoil_Loadable$1;





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


  function concurrentRequests(getRecoilValue, deps) {
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

  function isError(exp) {
    return exp != null && !Recoil_isPromise(exp);
  }

  function unwrapDependencies(dependencies) {
    return Array.isArray(dependencies) ? dependencies : Object.getOwnPropertyNames(dependencies).map(key => dependencies[key]);
  }

  function wrapResults(dependencies,
  /* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
   * LTI update could not be added via codemod */
  results) {
    return Array.isArray(dependencies) ? results : // Object.getOwnPropertyNames() has consistent key ordering with ES6
    Object.getOwnPropertyNames(dependencies).reduce((out, key, idx) => ({ ...out,
      [key]: results[idx]
    }), {});
  }

  function wrapLoadables(dependencies, results, exceptions) {
    const output = exceptions.map((exception, idx) => exception == null ? loadableWithValue$4(results[idx]) : Recoil_isPromise(exception) ? loadableWithPromise$3(exception) : loadableWithError$3(exception));
    return wrapResults(dependencies, output);
  }

  function combineAsyncResultsWithSyncResults(syncResults, asyncResults) {
    return asyncResults.map((result, idx) =>
    /**
     * it's important we use === undefined as opposed to == null, because the
     * resolved value of the async promise could be `null`, in which case we
     * don't want to use syncResults[idx], which would be undefined. If async
     * promise resolves to `undefined`, that's ok because `syncResults[idx]`
     * will also be `undefined`. That's a little hacky, but it works.
     */
    result === undefined ? syncResults[idx] : result);
  } // Selector that requests all dependencies in parallel and immediately returns
  // current results without waiting.


  const waitForNone = Recoil_selectorFamily({
    key: '__waitForNone',
    get: dependencies => ({
      get
    }) => {
      // Issue requests for all dependencies in parallel.
      const deps = unwrapDependencies(dependencies);
      const [results, exceptions] = concurrentRequests(get, deps); // Always return the current status of the results; never block.

      return wrapLoadables(dependencies, results, exceptions);
    },
    dangerouslyAllowMutability: true
  }); // Selector that requests all dependencies in parallel and waits for at least
  // one to be available before returning results.  It will only error if all
  // dependencies have errors.

  const waitForAny = Recoil_selectorFamily({
    key: '__waitForAny',
    get: dependencies => ({
      get
    }) => {
      // Issue requests for all dependencies in parallel.
      // Exceptions can either be Promises of pending results or real errors
      const deps = unwrapDependencies(dependencies);
      const [results, exceptions] = concurrentRequests(get, deps); // If any results are available, value or error, return the current status

      if (exceptions.some(exp => !Recoil_isPromise(exp))) {
        return wrapLoadables(dependencies, results, exceptions);
      } // Otherwise, return a promise that will resolve when the next result is
      // available, whichever one happens to be next.  But, if all pending
      // dependencies end up with errors, then reject the promise.


      return new Promise(resolve => {
        for (const [i, exp] of exceptions.entries()) {
          if (Recoil_isPromise(exp)) {
            exp.then(result => {
              results[i] = result;
              exceptions[i] = undefined;
              resolve(wrapLoadables(dependencies, results, exceptions));
            }).catch(error => {
              exceptions[i] = error;
              resolve(wrapLoadables(dependencies, results, exceptions));
            });
          }
        }
      });
    },
    dangerouslyAllowMutability: true
  }); // Selector that requests all dependencies in parallel and waits for all to be
  // available before returning a value.  It will error if any dependencies error.

  const waitForAll = Recoil_selectorFamily({
    key: '__waitForAll',
    get: dependencies => ({
      get
    }) => {
      // Issue requests for all dependencies in parallel.
      // Exceptions can either be Promises of pending results or real errors
      const deps = unwrapDependencies(dependencies);
      const [results, exceptions] = concurrentRequests(get, deps); // If all results are available, return the results

      if (exceptions.every(exp => exp == null)) {
        return wrapResults(dependencies, results);
      } // If we have any errors, throw the first error


      const error = exceptions.find(isError);

      if (error != null) {
        throw error;
      } // Otherwise, return a promise that will resolve when all results are available


      return Promise.all(exceptions).then(exceptionResults => wrapResults(dependencies, combineAsyncResultsWithSyncResults(results, exceptionResults)));
    },
    dangerouslyAllowMutability: true
  });
  const waitForAllSettled = Recoil_selectorFamily({
    key: '__waitForAllSettled',
    get: dependencies => ({
      get
    }) => {
      // Issue requests for all dependencies in parallel.
      // Exceptions can either be Promises of pending results or real errors
      const deps = unwrapDependencies(dependencies);
      const [results, exceptions] = concurrentRequests(get, deps); // If all results are available, return the results

      if (exceptions.every(exp => !Recoil_isPromise(exp))) {
        return wrapLoadables(dependencies, results, exceptions);
      } // Wait for all results to settle


      return Promise.all(exceptions.map((exp, i) => Recoil_isPromise(exp) ? exp.then(result => {
        results[i] = result;
        exceptions[i] = undefined;
      }).catch(error => {
        results[i] = undefined;
        exceptions[i] = error;
      }) : null)) // Then wrap them as loadables
      .then(() => wrapLoadables(dependencies, results, exceptions));
    },
    dangerouslyAllowMutability: true
  });
  const noWait = Recoil_selectorFamily({
    key: '__noWait',
    get: dependency => ({
      get
    }) => {
      try {
        return Recoil_selector.value(loadableWithValue$4(get(dependency)));
      } catch (exception) {
        return Recoil_selector.value(Recoil_isPromise(exception) ? loadableWithPromise$3(exception) : loadableWithError$3(exception));
      }
    },
    dangerouslyAllowMutability: true
  });
  var Recoil_WaitFor = {
    waitForNone,
    waitForAny,
    waitForAll,
    waitForAllSettled,
    noWait
  };

  const {
    RecoilLoadable
  } = Recoil_Loadable$1;

  const {
    DefaultValue: DefaultValue$3
  } = Recoil_Node;

  const {
    RecoilRoot: RecoilRoot$2,
    useRecoilStoreID: useRecoilStoreID$1
  } = Recoil_RecoilRoot;

  const {
    isRecoilValue: isRecoilValue$5
  } = Recoil_RecoilValue$1;

  const {
    retentionZone: retentionZone$1
  } = Recoil_RetentionZone;

  const {
    freshSnapshot: freshSnapshot$2
  } = Recoil_Snapshot$1;

  const {
    useRecoilState: useRecoilState$1,
    useRecoilState_TRANSITION_SUPPORT_UNSTABLE: useRecoilState_TRANSITION_SUPPORT_UNSTABLE$1,
    useRecoilStateLoadable: useRecoilStateLoadable$1,
    useRecoilValue: useRecoilValue$1,
    useRecoilValue_TRANSITION_SUPPORT_UNSTABLE: useRecoilValue_TRANSITION_SUPPORT_UNSTABLE$1,
    useRecoilValueLoadable: useRecoilValueLoadable$1,
    useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE: useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE$1,
    useResetRecoilState: useResetRecoilState$1,
    useSetRecoilState: useSetRecoilState$1
  } = Recoil_Hooks;

  const {
    useGotoRecoilSnapshot: useGotoRecoilSnapshot$1,
    useRecoilSnapshot: useRecoilSnapshot$1,
    useRecoilTransactionObserver: useRecoilTransactionObserver$1
  } = Recoil_SnapshotHooks;





  const {
    useRecoilCallback: useRecoilCallback$1
  } = Recoil_useRecoilCallback;





















  const {
    noWait: noWait$1,
    waitForAll: waitForAll$1,
    waitForAllSettled: waitForAllSettled$1,
    waitForAny: waitForAny$1,
    waitForNone: waitForNone$1
  } = Recoil_WaitFor;



  var Recoil_index = {
    // Types
    DefaultValue: DefaultValue$3,
    isRecoilValue: isRecoilValue$5,
    RecoilLoadable,
    // Global Recoil environment settiongs
    RecoilEnv: Recoil_RecoilEnv,
    // Recoil Root
    RecoilRoot: RecoilRoot$2,
    useRecoilStoreID: useRecoilStoreID$1,
    useRecoilBridgeAcrossReactRoots_UNSTABLE: Recoil_useRecoilBridgeAcrossReactRoots,
    // Atoms/Selectors
    atom: Recoil_atom,
    selector: Recoil_selector,
    // Convenience Atoms/Selectors
    atomFamily: Recoil_atomFamily,
    selectorFamily: Recoil_selectorFamily,
    constSelector: Recoil_constSelector,
    errorSelector: Recoil_errorSelector,
    readOnlySelector: Recoil_readOnlySelector,
    // Concurrency Helpers for Atoms/Selectors
    noWait: noWait$1,
    waitForNone: waitForNone$1,
    waitForAny: waitForAny$1,
    waitForAll: waitForAll$1,
    waitForAllSettled: waitForAllSettled$1,
    // Hooks for Atoms/Selectors
    useRecoilValue: useRecoilValue$1,
    useRecoilValueLoadable: useRecoilValueLoadable$1,
    useRecoilState: useRecoilState$1,
    useRecoilStateLoadable: useRecoilStateLoadable$1,
    useSetRecoilState: useSetRecoilState$1,
    useResetRecoilState: useResetRecoilState$1,
    useGetRecoilValueInfo_UNSTABLE: Recoil_useGetRecoilValueInfo,
    useRecoilRefresher_UNSTABLE: Recoil_useRecoilRefresher,
    useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE: useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE$1,
    useRecoilValue_TRANSITION_SUPPORT_UNSTABLE: useRecoilValue_TRANSITION_SUPPORT_UNSTABLE$1,
    useRecoilState_TRANSITION_SUPPORT_UNSTABLE: useRecoilState_TRANSITION_SUPPORT_UNSTABLE$1,
    // Hooks for complex operations
    useRecoilCallback: useRecoilCallback$1,
    useRecoilTransaction_UNSTABLE: Recoil_useRecoilTransaction,
    // Snapshots
    useGotoRecoilSnapshot: useGotoRecoilSnapshot$1,
    useRecoilSnapshot: useRecoilSnapshot$1,
    useRecoilTransactionObserver_UNSTABLE: useRecoilTransactionObserver$1,
    snapshot_UNSTABLE: freshSnapshot$2,
    // Memory Management
    useRetain: Recoil_useRetain,
    retentionZone: retentionZone$1
  };
  var Recoil_index_1 = Recoil_index.DefaultValue;
  var Recoil_index_2 = Recoil_index.isRecoilValue;
  var Recoil_index_3 = Recoil_index.RecoilLoadable;
  var Recoil_index_4 = Recoil_index.RecoilEnv;
  var Recoil_index_5 = Recoil_index.RecoilRoot;
  var Recoil_index_6 = Recoil_index.useRecoilStoreID;
  var Recoil_index_7 = Recoil_index.useRecoilBridgeAcrossReactRoots_UNSTABLE;
  var Recoil_index_8 = Recoil_index.atom;
  var Recoil_index_9 = Recoil_index.selector;
  var Recoil_index_10 = Recoil_index.atomFamily;
  var Recoil_index_11 = Recoil_index.selectorFamily;
  var Recoil_index_12 = Recoil_index.constSelector;
  var Recoil_index_13 = Recoil_index.errorSelector;
  var Recoil_index_14 = Recoil_index.readOnlySelector;
  var Recoil_index_15 = Recoil_index.noWait;
  var Recoil_index_16 = Recoil_index.waitForNone;
  var Recoil_index_17 = Recoil_index.waitForAny;
  var Recoil_index_18 = Recoil_index.waitForAll;
  var Recoil_index_19 = Recoil_index.waitForAllSettled;
  var Recoil_index_20 = Recoil_index.useRecoilValue;
  var Recoil_index_21 = Recoil_index.useRecoilValueLoadable;
  var Recoil_index_22 = Recoil_index.useRecoilState;
  var Recoil_index_23 = Recoil_index.useRecoilStateLoadable;
  var Recoil_index_24 = Recoil_index.useSetRecoilState;
  var Recoil_index_25 = Recoil_index.useResetRecoilState;
  var Recoil_index_26 = Recoil_index.useGetRecoilValueInfo_UNSTABLE;
  var Recoil_index_27 = Recoil_index.useRecoilRefresher_UNSTABLE;
  var Recoil_index_28 = Recoil_index.useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE;
  var Recoil_index_29 = Recoil_index.useRecoilValue_TRANSITION_SUPPORT_UNSTABLE;
  var Recoil_index_30 = Recoil_index.useRecoilState_TRANSITION_SUPPORT_UNSTABLE;
  var Recoil_index_31 = Recoil_index.useRecoilCallback;
  var Recoil_index_32 = Recoil_index.useRecoilTransaction_UNSTABLE;
  var Recoil_index_33 = Recoil_index.useGotoRecoilSnapshot;
  var Recoil_index_34 = Recoil_index.useRecoilSnapshot;
  var Recoil_index_35 = Recoil_index.useRecoilTransactionObserver_UNSTABLE;
  var Recoil_index_36 = Recoil_index.snapshot_UNSTABLE;
  var Recoil_index_37 = Recoil_index.useRetain;
  var Recoil_index_38 = Recoil_index.retentionZone;

  exports.DefaultValue = Recoil_index_1;
  exports.RecoilEnv = Recoil_index_4;
  exports.RecoilLoadable = Recoil_index_3;
  exports.RecoilRoot = Recoil_index_5;
  exports.atom = Recoil_index_8;
  exports.atomFamily = Recoil_index_10;
  exports.constSelector = Recoil_index_12;
  exports.default = Recoil_index;
  exports.errorSelector = Recoil_index_13;
  exports.isRecoilValue = Recoil_index_2;
  exports.noWait = Recoil_index_15;
  exports.readOnlySelector = Recoil_index_14;
  exports.retentionZone = Recoil_index_38;
  exports.selector = Recoil_index_9;
  exports.selectorFamily = Recoil_index_11;
  exports.snapshot_UNSTABLE = Recoil_index_36;
  exports.useGetRecoilValueInfo_UNSTABLE = Recoil_index_26;
  exports.useGotoRecoilSnapshot = Recoil_index_33;
  exports.useRecoilBridgeAcrossReactRoots_UNSTABLE = Recoil_index_7;
  exports.useRecoilCallback = Recoil_index_31;
  exports.useRecoilRefresher_UNSTABLE = Recoil_index_27;
  exports.useRecoilSnapshot = Recoil_index_34;
  exports.useRecoilState = Recoil_index_22;
  exports.useRecoilStateLoadable = Recoil_index_23;
  exports.useRecoilState_TRANSITION_SUPPORT_UNSTABLE = Recoil_index_30;
  exports.useRecoilStoreID = Recoil_index_6;
  exports.useRecoilTransactionObserver_UNSTABLE = Recoil_index_35;
  exports.useRecoilTransaction_UNSTABLE = Recoil_index_32;
  exports.useRecoilValue = Recoil_index_20;
  exports.useRecoilValueLoadable = Recoil_index_21;
  exports.useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE = Recoil_index_28;
  exports.useRecoilValue_TRANSITION_SUPPORT_UNSTABLE = Recoil_index_29;
  exports.useResetRecoilState = Recoil_index_25;
  exports.useRetain = Recoil_index_37;
  exports.useSetRecoilState = Recoil_index_24;
  exports.waitForAll = Recoil_index_18;
  exports.waitForAllSettled = Recoil_index_19;
  exports.waitForAny = Recoil_index_17;
  exports.waitForNone = Recoil_index_16;

  Object.defineProperty(exports, '__esModule', { value: true });

})));
