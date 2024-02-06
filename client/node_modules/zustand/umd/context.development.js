(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('react'), require('zustand/traditional')) :
  typeof define === 'function' && define.amd ? define(['react', 'zustand/traditional'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.zustandContext = factory(global.React, global.traditional));
})(this, (function (ReactExports, traditional) { 'use strict';

  function _extends() {
    _extends = Object.assign ? Object.assign.bind() : function (target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];
        for (var key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            target[key] = source[key];
          }
        }
      }
      return target;
    };
    return _extends.apply(this, arguments);
  }

  var createElement = ReactExports.createElement,
    reactCreateContext = ReactExports.createContext,
    useContext = ReactExports.useContext,
    useMemo = ReactExports.useMemo,
    useRef = ReactExports.useRef;
  function createContext() {
    {
      console.warn("[DEPRECATED] `context` will be removed in a future version. Instead use `import { createStore, useStore } from 'zustand'`. See: https://github.com/pmndrs/zustand/discussions/1180.");
    }
    var ZustandContext = reactCreateContext(undefined);
    var Provider = function Provider(_ref) {
      var createStore = _ref.createStore,
        children = _ref.children;
      var storeRef = useRef();
      if (!storeRef.current) {
        storeRef.current = createStore();
      }
      return createElement(ZustandContext.Provider, {
        value: storeRef.current
      }, children);
    };
    var useContextStore = function useContextStore(selector, equalityFn) {
      var store = useContext(ZustandContext);
      if (!store) {
        throw new Error('Seems like you have not used zustand provider as an ancestor.');
      }
      return traditional.useStoreWithEqualityFn(store, selector, equalityFn);
    };
    var useStoreApi = function useStoreApi() {
      var store = useContext(ZustandContext);
      if (!store) {
        throw new Error('Seems like you have not used zustand provider as an ancestor.');
      }
      return useMemo(function () {
        return _extends({}, store);
      }, [store]);
    };
    return {
      Provider: Provider,
      useStore: useContextStore,
      useStoreApi: useStoreApi
    };
  }

  return createContext;

}));
