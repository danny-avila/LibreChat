'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var React = require('react');
var useIsomorphicLayoutEffect = require('use-isomorphic-layout-effect');

function _interopDefault (e) { return e && e.__esModule ? e : { 'default': e }; }

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
var useIsomorphicLayoutEffect__default = /*#__PURE__*/_interopDefault(useIsomorphicLayoutEffect);

var useLatest = function useLatest(value) {
  var ref = React__namespace.useRef(value);
  useIsomorphicLayoutEffect__default["default"](function () {
    ref.current = value;
  });
  return ref;
};

exports["default"] = useLatest;
