import { darkTheme } from './themes/dark';
import { defaultTheme } from './themes/default';

import type {
  IThemeAppearance,
  IThemeRGB,
  ResolvedThemeDefinition,
  ThemeDefinition,
  ThemeMode,
} from './types';

export const THEME_VERSION = 1 as const;

export const themeColorTokens: readonly (keyof IThemeRGB)[] = Object.freeze(
  Object.keys(defaultTheme) as Array<keyof IThemeRGB>,
);

export const themeAppearanceProperties: Readonly<
  Record<keyof IThemeAppearance, `--theme-${string}`>
> = Object.freeze({
  controlRadius: '--theme-control-radius',
  surfaceRadius: '--theme-surface-radius',
  controlHeight: '--theme-control-height',
  spaceCompact: '--theme-space-compact',
  spaceNormal: '--theme-space-normal',
  fontFamily: '--theme-font-family',
  elevationSurface: '--theme-elevation-surface',
  motionFast: '--theme-motion-fast',
  motionNormal: '--theme-motion-normal',
});

export const defaultAppearance: IThemeAppearance = Object.freeze({
  controlRadius: '9999px',
  surfaceRadius: '1.5rem',
  controlHeight: '2.25rem',
  spaceCompact: '0.375rem',
  spaceNormal: '0.75rem',
  fontFamily: 'Inter, sans-serif',
  elevationSurface: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  motionFast: '150ms',
  motionNormal: '200ms',
});

export const libreChatTheme: ThemeDefinition = Object.freeze({
  version: THEME_VERSION,
  name: 'librechat',
  modes: {
    light: { colors: defaultTheme },
    dark: { colors: darkTheme },
  },
});

const rgbPattern = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/;
const cssLengthPattern = /^(0|\d*\.?\d+(px|rem|em))$/;
const cssDurationPattern = /^\d*\.?\d+(ms|s)$/;

const isRGB = (value: string): boolean => {
  const match = value.match(rgbPattern);
  return match !== null && match.slice(1).every((channel) => Number(channel) <= 255);
};

const isLength = (value: string): boolean => cssLengthPattern.test(value);
const isDuration = (value: string): boolean => cssDurationPattern.test(value);

const appearanceValidators: Record<keyof IThemeAppearance, (value: string) => boolean> = {
  controlRadius: isLength,
  surfaceRadius: isLength,
  controlHeight: isLength,
  spaceCompact: isLength,
  spaceNormal: isLength,
  fontFamily: (value) => value.trim().length > 0 && !/[;{}]/.test(value),
  elevationSurface: (value) => value.trim().length > 0 && !/[;{}]|url\s*\(/i.test(value),
  motionFast: isDuration,
  motionNormal: isDuration,
};

export function validateThemeDefinition(theme: ThemeDefinition): string[] {
  const errors: string[] = [];

  if (theme.version !== THEME_VERSION) {
    errors.push(`Unsupported theme version: ${theme.version}`);
  }
  if (!theme.name.trim()) {
    errors.push('Theme name is required');
  }

  (['light', 'dark'] as const).forEach((mode) => {
    const definition = theme.modes[mode];
    if (!definition) {
      return;
    }

    Object.entries(definition.colors ?? {}).forEach(([key, value]) => {
      if (!themeColorTokens.includes(key as keyof IThemeRGB)) {
        errors.push(`Unknown color token: ${key}`);
        return;
      }
      if (value !== undefined && !isRGB(value)) {
        errors.push(`Invalid RGB value for ${key}: ${value}`);
      }
    });

    Object.entries(definition.appearance ?? {}).forEach(([key, value]) => {
      const appearanceKey = key as keyof IThemeAppearance;
      const validator = appearanceValidators[appearanceKey];
      if (!validator) {
        errors.push(`Unknown appearance token: ${key}`);
        return;
      }
      if (value !== undefined && !validator(value)) {
        errors.push(`Invalid appearance value for ${key}: ${value}`);
      }
    });
  });

  return errors;
}

export function resolveTheme(theme: ThemeDefinition, mode: ThemeMode): ResolvedThemeDefinition {
  const errors = validateThemeDefinition(theme);
  if (errors.length > 0) {
    throw new TypeError(errors.join('\n'));
  }

  const baseColors = mode === 'dark' ? darkTheme : defaultTheme;
  const definition = theme.modes[mode];

  return {
    version: THEME_VERSION,
    name: theme.name,
    mode,
    colors: { ...baseColors, ...definition?.colors } as Required<IThemeRGB>,
    appearance: { ...defaultAppearance, ...definition?.appearance },
  };
}

export function fromLegacyTheme(colors: IThemeRGB, name = 'custom'): ThemeDefinition {
  return {
    version: THEME_VERSION,
    name,
    modes: {
      light: { colors },
      dark: { colors },
    },
  };
}
