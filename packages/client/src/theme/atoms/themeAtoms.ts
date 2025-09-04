import { atomWithStorage } from 'jotai/utils';
import { IThemeRGB } from '../types';

/**
 * Atom for storing the theme mode (light/dark/system) in localStorage
 * Key: 'color-theme'
 */
export const themeModeAtom = atomWithStorage<string>('color-theme', 'system', undefined, {
  getOnInit: true,
});

/**
 * Atom for storing custom theme colors in localStorage
 * Key: 'theme-colors'
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
 * Atom for storing the theme name in localStorage
 * Key: 'theme-name'
 */
export const themeNameAtom = atomWithStorage<string | undefined>(
  'theme-name',
  undefined,
  undefined,
  {
    getOnInit: true,
  },
);
