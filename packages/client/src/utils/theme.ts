import { invalidateRemScale } from './remScale';

export const MIN_UI_SCALE = 0.5;
export const MAX_UI_SCALE = 1.5;
export const DEFAULT_UI_SCALE = 1;

const BASE_FONT_SIZE = 16;

/**
 * Expresses a pixel measurement in rem so elements sized from JavaScript follow
 * the UI scale. A fixed pixel size in a scaled layout gets squeezed by its flex
 * container, which distorts avatars and icons.
 */
export const pxToRem = (px: number): string => `${px / BASE_FONT_SIZE}rem`;

/**
 * Guards every consumer of the stored preference: a corrupted value must not be
 * able to render the app unusable, nor reach layout maths as NaN.
 */
export const clampUiScale = (scale: number): number => {
  if (typeof scale !== 'number' || !Number.isFinite(scale)) {
    return DEFAULT_UI_SCALE;
  }
  return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, scale));
};

/**
 * Scales the entire interface by driving the `--ui-scale` custom property, which
 * `style.css` feeds to the root font size.
 */
export const applyUiScale = (scale: number): void => {
  document.documentElement.style.setProperty('--ui-scale', String(clampUiScale(scale)));
  invalidateRemScale();
};

export const applyFontSize = (val: string): void => {
  const root = document.documentElement;
  const size = val.split('-')[1]; // This will be 'xs', 'sm', 'base', 'lg', or 'xl'

  switch (size) {
    case 'xs':
      root.style.setProperty('--markdown-font-size', '0.75rem'); // 12px
      break;
    case 'sm':
      root.style.setProperty('--markdown-font-size', '0.875rem'); // 14px
      break;
    case 'base':
      root.style.setProperty('--markdown-font-size', '1rem'); // 16px
      break;
    case 'lg':
      root.style.setProperty('--markdown-font-size', '1.125rem'); // 18px
      break;
    case 'xl':
      root.style.setProperty('--markdown-font-size', '1.25rem'); // 20px
      break;
  }
};

export const getInitialTheme = (): string => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const storedPrefs = window.localStorage.getItem('color-theme');
    if (typeof storedPrefs === 'string') {
      return storedPrefs;
    }

    const userMedia = window.matchMedia('(prefers-color-scheme: dark)');
    if (userMedia.matches) {
      return 'dark';
    }
  }

  return 'light';
};
