import { IThemeRGB } from '../types';

/**
 * Dark theme
 * RGB values extracted from the existing dark mode CSS variables
 */
export const darkTheme: IThemeRGB = {
  // Text colors
  'rgb-text-primary': '236 236 236', // #ececec (gray-100)
  'rgb-text-secondary': '205 205 205', // #cdcdcd (gray-300)
  'rgb-text-secondary-alt': '153 150 150', // #999696 (gray-400)
  'rgb-text-tertiary': '89 89 89', // #595959 (gray-500)
  'rgb-text-warning': '245 158 11', // #f59e0b (amber-500)

  // Ring colors (not defined in dark mode, using default)
  'rgb-ring-primary': '89 89 89', // #595959 (gray-500)

  // Header colors
  'rgb-header-primary': '47 47 47', // #2f2f2f (gray-700)
  'rgb-header-hover': '66 66 66', // #424242 (gray-600)
  'rgb-header-button-hover': '47 47 47', // #2f2f2f (gray-700)

  // Surface colors
  'rgb-surface-active': '89 89 89', // #595959 (gray-500)
  'rgb-surface-active-alt': '47 47 47', // #2f2f2f (gray-700)
  'rgb-surface-hover': '66 66 66', // #424242 (gray-600)
  'rgb-surface-hover-alt': '66 66 66', // #424242 (gray-600)
  'rgb-surface-primary': '13 13 13', // #0d0d0d (gray-900)
  'rgb-surface-primary-alt': '23 23 23', // #171717 (gray-850)
  'rgb-surface-primary-contrast': '23 23 23', // #171717 (gray-850)
  'rgb-surface-secondary': '33 33 33', // #212121 (gray-800)
  'rgb-surface-secondary-alt': '33 33 33', // #212121 (gray-800)
  'rgb-surface-tertiary': '47 47 47', // #2f2f2f (gray-700)
  'rgb-surface-tertiary-alt': '47 47 47', // #2f2f2f (gray-700)
  'rgb-surface-dialog': '23 23 23', // #171717 (gray-850)
  'rgb-surface-submit': '4 120 87', // #047857 (green-700)
  'rgb-surface-submit-hover': '6 95 70', // #065f46 (green-800)
  'rgb-surface-destructive': '153 27 27', // #991b1b (red-800)
  'rgb-surface-destructive-hover': '127 29 29', // #7f1d1d (red-900)
  'rgb-surface-chat': '47 47 47', // #2f2f2f (gray-700)

  // Border colors
  'rgb-border-light': '47 47 47', // #2f2f2f (gray-700)
  'rgb-border-medium': '66 66 66', // #424242 (gray-600)
  'rgb-border-medium-alt': '66 66 66', // #424242 (gray-600)
  'rgb-border-heavy': '89 89 89', // #595959 (gray-500)
  'rgb-border-xheavy': '153 150 150', // #999696 (gray-400)

  // Brand colors
  'rgb-brand-purple': '171 104 255', // #ab68ff

  // Presentation
  'rgb-presentation': '33 33 33', // #212121 (gray-800)
};
