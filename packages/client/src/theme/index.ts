// Export types
export * from './types';

// Export ThemeProvider, ThemeContext, useTheme hook, and isDark
export { ThemeProvider, ThemeContext, useTheme, isDark } from './context/ThemeProvider';

// Export utility functions
export {
  default as applyTheme,
  applyResolvedTheme,
  clearAppliedTheme,
  themeOwnedProperties,
} from './utils/applyTheme';

export {
  THEME_VERSION,
  defaultAppearance,
  defaultBrands,
  fromLegacyTheme,
  libreChatTheme,
  resolveTheme,
  themeAppearanceProperties,
  themeBrandTokens,
  themeColorTokens,
  validateThemeDefinition,
} from './registry';

// Export theme atoms for persistence
export { themeModeAtom, themeColorsAtom, themeNameAtom } from './atoms/themeAtoms';

// Export predefined themes
export * from './themes';
