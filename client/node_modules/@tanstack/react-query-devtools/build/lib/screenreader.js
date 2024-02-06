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

function ScreenReader({
  text
}) {
  return /*#__PURE__*/React__namespace.createElement("span", {
    style: {
      position: 'absolute',
      width: '0.1px',
      height: '0.1px',
      overflow: 'hidden'
    }
  }, text);
}

exports["default"] = ScreenReader;
//# sourceMappingURL=screenreader.js.map
