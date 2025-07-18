// Export types
export * from './types';

// Export ThemeProvider, ThemeContext, useTheme hook, and isDark
export { ThemeProvider, ThemeContext, useTheme, isDark } from './context/ThemeProvider';

// Export utility functions
export { default as applyTheme } from './utils/applyTheme';
export { createTailwindColors } from './utils/tailwindConfig';

// Export predefined themes
export * from './themes';
