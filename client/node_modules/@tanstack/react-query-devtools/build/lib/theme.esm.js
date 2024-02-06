'use client';
import { extends as _extends } from './_virtual/_rollupPluginBabelHelpers.esm.js';
import * as React from 'react';

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
const ThemeContext = /*#__PURE__*/React.createContext(defaultTheme);
function ThemeProvider({
  theme,
  ...rest
}) {
  return /*#__PURE__*/React.createElement(ThemeContext.Provider, _extends({
    value: theme
  }, rest));
}
function useTheme() {
  return React.useContext(ThemeContext);
}

export { ThemeProvider, defaultTheme, useTheme };
//# sourceMappingURL=theme.esm.js.map
