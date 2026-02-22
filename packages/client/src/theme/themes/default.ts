import { IThemeRGB } from '../types';

/**
 * Default light theme
 * RGB values extracted from the existing CSS variables
 */
export const defaultTheme: IThemeRGB = {
  // Text colors
  'rgb-text-primary': '33 33 33', // #212121 (gray-800)
  'rgb-text-secondary': '66 66 66', // #424242 (gray-600)
  'rgb-text-secondary-alt': '89 89 89', // #595959 (gray-500)
  'rgb-text-tertiary': '89 89 89', // #595959 (gray-500)
  'rgb-text-warning': '245 158 11', // #f59e0b (amber-500)

  // Ring colors
  'rgb-ring-primary': '89 89 89', // #595959 (gray-500)

  // Header colors
  'rgb-header-primary': '255 255 255', // #fff (white)
  'rgb-header-hover': '247 247 248', // #f7f7f8 (gray-50)
  'rgb-header-button-hover': '247 247 248', // #f7f7f8 (gray-50)

  // Surface colors
  'rgb-surface-active': '236 236 236', // #ececec (gray-100)
  'rgb-surface-active-alt': '227 227 227', // #e3e3e3 (gray-200)
  'rgb-surface-hover': '227 227 227', // #e3e3e3 (gray-200)
  'rgb-surface-hover-alt': '205 205 205', // #cdcdcd (gray-300)
  'rgb-surface-primary': '255 255 255', // #fff (white)
  'rgb-surface-primary-alt': '247 247 248', // #f7f7f8 (gray-50)
  'rgb-surface-primary-contrast': '236 236 236', // #ececec (gray-100)
  'rgb-surface-secondary': '247 247 248', // #f7f7f8 (gray-50)
  'rgb-surface-secondary-alt': '227 227 227', // #e3e3e3 (gray-200)
  'rgb-surface-tertiary': '236 236 236', // #ececec (gray-100)
  'rgb-surface-tertiary-alt': '255 255 255', // #fff (white)
  'rgb-surface-dialog': '255 255 255', // #fff (white)
  'rgb-surface-submit': '4 120 87', // #047857 (green-700)
  'rgb-surface-submit-hover': '6 95 70', // #065f46 (green-800)
  'rgb-surface-destructive': '185 28 28', // #b91c1c (red-700)
  'rgb-surface-destructive-hover': '153 27 27', // #991b1b (red-800)
  'rgb-surface-chat': '255 255 255', // #fff (white)

  // Border colors
  'rgb-border-light': '227 227 227', // #e3e3e3 (gray-200)
  'rgb-border-medium': '205 205 205', // #cdcdcd (gray-300)
  'rgb-border-medium-alt': '205 205 205', // #cdcdcd (gray-300)
  'rgb-border-heavy': '153 150 150', // #999696 (gray-400)
  'rgb-border-xheavy': '89 89 89', // #595959 (gray-500)

  // Brand colors
  'rgb-brand-purple': '171 104 255', // #ab68ff

  // Presentation
  'rgb-presentation': '255 255 255', // #fff (white)

  // Utility colors (mapped to existing colors for backwards compatibility)
  'rgb-background': '255 255 255', // Same as surface-primary
  'rgb-foreground': '17 17 17', // Same as text-primary
  'rgb-primary': '235 235 235', // Same as surface-active
  'rgb-primary-foreground': '0 0 0', // Same as surface-primary-contrast
  'rgb-secondary': '247 247 248', // Same as surface-secondary
  'rgb-secondary-foreground': '66 66 66', // Same as text-secondary
  'rgb-muted': '250 250 250', // Same as surface-tertiary
  'rgb-muted-foreground': '120 120 120', // Same as text-tertiary
  'rgb-accent': '245 245 245', // Same as surface-active-alt
  'rgb-accent-foreground': '17 17 17', // Same as text-primary
  'rgb-destructive-foreground': '17 17 17', // Same as text-primary
  'rgb-border': '215 215 215', // Same as border-medium
  'rgb-input': '230 230 230', // Same as border-light
  'rgb-ring': '180 180 180', // Same as ring-primary
  'rgb-card': '247 247 248', // Same as surface-secondary
  'rgb-card-foreground': '17 17 17', // Same as text-primary
};
