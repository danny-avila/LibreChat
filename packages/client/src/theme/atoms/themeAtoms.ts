// This file is kept for backward compatibility but is no longer used internally.
// Theme state is now managed via React useState + localStorage in ThemeProvider.

import { atomWithStorage } from 'jotai/utils';
import { IThemeRGB } from '../types';

/**
 * @deprecated Use ThemeContext instead. This atom is no longer used internally.
 */
export const themeModeAtom = atomWithStorage<string>('color-theme', 'system', undefined, {
  getOnInit: true,
});

/**
 * @deprecated Use ThemeContext instead. This atom is no longer used internally.
 */
export const themeColorsAtom = atomWithStorage<IThemeRGB | undefined>(
  'theme-colors',
  undefined,
  undefined,
  {
    getOnInit: true,
  },
);

/**
 * @deprecated Use ThemeContext instead. This atom is no longer used internally.
 */
export const themeNameAtom = atomWithStorage<string | undefined>(
  'theme-name',
  undefined,
  undefined,
  {
    getOnInit: true,
  },
);
