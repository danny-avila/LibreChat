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
  'rgb-text-tertiary': '153 150 150', // #999696 (gray-400)
  'rgb-text-warning': '245 158 11', // #f59e0b (amber-500)
  'rgb-text-destructive': '248 113 113', // #f87171 (red-400)
  'rgb-shimmer-base': '255 255 255', // #ffffff, carried at 0.8 alpha
  'rgb-shimmer-dip': '179 179 179', // #b3b3b3

  // Link and accent colors
  'rgb-link': '96 165 250', // #60a5fa (blue-400)
  'rgb-link-hover': '147 197 253', // #93c5fd (blue-300)
  'rgb-link-visited': '192 132 252', // #c084fc (purple-400)
  'rgb-accent-primary': '65 167 157', // #41a79d
  'rgb-accent-primary-hover': '109 200 185', // #6dc8b9

  // Ring colors (not defined in dark mode, using default)
  'rgb-ring-primary': '89 89 89', // #595959 (gray-500)

  // Header colors
  'rgb-header-primary': '47 47 47', // #2f2f2f (gray-700)
  'rgb-header-hover': '66 66 66', // #424242 (gray-600)
  'rgb-header-button-hover': '47 47 47', // #2f2f2f (gray-700)

  // Surface colors
  'rgb-surface-active': '89 89 89', // #595959 (gray-500)
  'rgb-surface-active-alt': '47 47 47', // #2f2f2f (gray-700)
  'rgb-surface-hover': '57 57 57', // #393939 (gray-650)
  'rgb-surface-hover-alt': '66 66 66', // #424242 (gray-600)
  'rgb-surface-composer-hover': '66 66 66', // #424242 (gray-600)
  'rgb-surface-primary': '13 13 13', // #0d0d0d (gray-900)
  'rgb-surface-primary-alt': '23 23 23', // #171717 (gray-850)
  'rgb-surface-primary-contrast': '23 23 23', // #171717 (gray-850)
  'rgb-surface-secondary': '33 33 33', // #212121 (gray-800)
  'rgb-surface-secondary-alt': '33 33 33', // #212121 (gray-800)
  'rgb-surface-tertiary': '47 47 47', // #2f2f2f (gray-700)
  'rgb-surface-tertiary-alt': '47 47 47', // #2f2f2f (gray-700)
  'rgb-surface-dialog': '18 18 18', // #121212 (legacy dark dialog)
  'rgb-surface-overlay': '0 0 0', // #000 (black)
  'rgb-surface-submit': '4 120 87', // #047857 (green-700)
  'rgb-surface-submit-hover': '6 95 70', // #065f46 (green-800)
  'rgb-surface-destructive': '153 27 27', // #991b1b (red-800)
  'rgb-surface-destructive-hover': '127 29 29', // #7f1d1d (red-900)
  'rgb-surface-chat': '47 47 47', // #2f2f2f (gray-700)
  'rgb-surface-inverted': '255 255 255', // #fff (white)
  'rgb-surface-inverted-hover': '236 236 236', // #ececec (gray-100)
  'rgb-text-inverted': '23 23 23', // #171717 (gray-850)
  'rgb-surface-fixed': '255 255 255', // #fff (white) — same in light + dark
  'rgb-surface-fixed-hover': '236 236 236', // #ececec (gray-100) — same in light + dark
  'rgb-text-fixed': '33 33 33', // #212121 (gray-800) — same in light + dark

  // Border colors
  'rgb-border-light': '47 47 47', // #2f2f2f (gray-700)
  'rgb-border-medium': '66 66 66', // #424242 (gray-600)
  'rgb-border-medium-alt': '66 66 66', // #424242 (gray-600)
  'rgb-border-heavy': '89 89 89', // #595959 (gray-500)
  'rgb-border-xheavy': '153 150 150', // #999696 (gray-400)
  'rgb-border-destructive': '239 68 68', // #ef4444 (red-500)

  // Status colors
  'rgb-status-success': '110 231 183', // #6ee7b7 (green-300)
  'rgb-status-success-subtle': '2 44 34', // #022c22 (green-950)
  'rgb-status-success-border': '6 95 70', // #065f46 (green-800)
  'rgb-status-success-strong': '6 95 70', // #065f46 (green-800)
  'rgb-status-info': '147 197 253', // #93c5fd (blue-300)
  'rgb-status-info-subtle': '23 37 84', // #172554 (blue-950)
  'rgb-status-info-border': '30 64 175', // #1e40af (blue-800)
  'rgb-status-info-strong': '66 66 66', // #424242 (gray-600)
  'rgb-status-warning': '252 211 77', // #fcd34d (amber-300)
  'rgb-status-warning-subtle': '69 26 3', // #451a03 (amber-950)
  'rgb-status-warning-border': '146 64 14', // #92400e (amber-800)
  'rgb-status-warning-strong': '146 64 14', // #92400e (amber-800)
  'rgb-status-error': '252 165 165', // #fca5a5 (red-300)
  'rgb-status-error-subtle': '69 10 10', // #450a0a (red-950)
  'rgb-status-error-border': '153 27 27', // #991b1b (red-800)
  'rgb-status-error-strong': '153 27 27', // #991b1b (red-800)
  'rgb-status-neutral': '205 205 205', // #cdcdcd (gray-300)
  'rgb-status-neutral-subtle': '33 33 33', // #212121 (gray-800)
  'rgb-status-neutral-border': '47 47 47', // #2f2f2f (gray-700)
  'rgb-text-on-status': '255 255 255', // #fff (white)

  // Brand colors
  'rgb-brand-purple': '171 104 255', // #ab68ff

  /** Categorical series scale — the same seven hues stepped for the #212121
   *  surface: worst adjacent CVD ΔE 13.0, normal-vision ΔE 19.0, all ≥ 3:1. */
  'rgb-series-1': '9 140 238', // #098cee (cerulean)
  'rgb-series-2': '217 87 35', // #d95723 (orange)
  'rgb-series-3': '6 158 152', // #069e98 (aqua)
  'rgb-series-4': '200 133 12', // #c8850c (amber)
  'rgb-series-5': '213 82 130', // #d55282 (magenta)
  'rgb-series-6': '171 104 254', // #ab68fe (violet)
  'rgb-series-7': '80 167 49', // #50a731 (green)

  // Presentation
  'rgb-presentation': '33 33 33', // #212121 (gray-800)
};
