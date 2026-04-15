// Export types
export * from './types';

// Export ThemeProvider, ThemeContext, useTheme hook, and isDark
export { ThemeProvider, ThemeContext, useTheme, isDark } from './context/ThemeProvider';
export type { ThemePalette } from './context/ThemeProvider';

// Export utility functions
export { default as applyTheme } from './utils/applyTheme';

// Export theme atoms for persistence
export { themeModeAtom, themeColorsAtom, themeNameAtom } from './atoms/themeAtoms';

// Export predefined themes
export * from './themes';
