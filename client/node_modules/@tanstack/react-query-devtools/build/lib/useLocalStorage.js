'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var React = require('react');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n["default"] = e;
  return Object.freeze(n);
}

var React__namespace = /*#__PURE__*/_interopNamespace(React);

const getItem = key => {
  try {
    const itemValue = localStorage.getItem(key);

    if (typeof itemValue === 'string') {
      return JSON.parse(itemValue);
    }

    return undefined;
  } catch {
    return undefined;
  }
};

function useLocalStorage(key, defaultValue) {
  const [value, setValue] = React__namespace.useState();
  React__namespace.useEffect(() => {
    const initialValue = getItem(key);

    if (typeof initialValue === 'undefined' || initialValue === null) {
      setValue(typeof defaultValue === 'function' ? defaultValue() : defaultValue);
    } else {
      setValue(initialValue);
    }
  }, [defaultValue, key]);
  const setter = React__namespace.useCallback(updater => {
    setValue(old => {
      let newVal = updater;

      if (typeof updater == 'function') {
        newVal = updater(old);
      }

      try {
        localStorage.setItem(key, JSON.stringify(newVal));
      } catch {}

      return newVal;
    });
  }, [key]);
  return [value, setter];
}

exports["default"] = useLocalStorage;
//# sourceMappingURL=useLocalStorage.js.map
