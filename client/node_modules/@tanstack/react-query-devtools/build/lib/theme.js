'use client';
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var _rollupPluginBabelHelpers = require('./_virtual/_rollupPluginBabelHelpers.js');
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

const defaultTheme = {
  background: '#0b1521',
  backgroundAlt: '#132337',
  foreground: 'white',
  gray: '#3f4e60',
  grayAlt: '#222e3e',
  inputBackgroundColor: '#fff',
  inputTextColor: '#000',
  success: '#00ab52',
  danger: '#ff0085',
  active: '#006bff',
  paused: '#8c49eb',
  warning: '#ffb200'
};
const ThemeContext = /*#__PURE__*/React__namespace.createContext(defaultTheme);
function ThemeProvider({
  theme,
  ...rest
}) {
  return /*#__PURE__*/React__namespace.createElement(ThemeContext.Provider, _rollupPluginBabelHelpers["extends"]({
    value: theme
  }, rest));
}
function useTheme() {
  return React__namespace.useContext(ThemeContext);
}

exports.ThemeProvider = ThemeProvider;
exports.defaultTheme = defaultTheme;
exports.useTheme = useTheme;
//# sourceMappingURL=theme.js.map
