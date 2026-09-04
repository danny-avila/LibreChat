import type {
  IThemeAppearance,
  IThemeBrands,
  IThemeColors,
  IThemeVariables,
  IThemeRGB,
  ResolvedThemeDefinition,
  ThemeDefinition,
  ThemeMode,
} from './types';
import { defaultTheme } from './themes/default';
import { darkTheme } from './themes/dark';
export const THEME_VERSION = 1 as const;

/**
 * Compile-time guard: the categorical series scale is declared across three
 * hand-maintained token maps, so a slot added to one and missed in another
 * fails the build rather than surfacing as a broken theme downstream.
 */
type SeriesSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type Assert<Declared extends true> = Declared;
type DeclaredIn<Keys extends PropertyKey, Tokens> = [Keys] extends [keyof Tokens] ? true : false;

export type SeriesTokensAreDeclared = [
  Assert<DeclaredIn<`rgb-series-${SeriesSlot}`, IThemeRGB>>,
  Assert<DeclaredIn<`--series-${SeriesSlot}`, IThemeVariables>>,
  Assert<DeclaredIn<`series-${SeriesSlot}`, IThemeColors>>,
];

export const themeColorTokens: readonly (keyof IThemeRGB)[] = Object.freeze(
  Object.keys(defaultTheme) as Array<keyof IThemeRGB>,
);

export const themeAppearanceProperties: Readonly<
  Record<keyof IThemeAppearance, `--theme-${string}`>
> = Object.freeze({
  controlRadius: '--theme-control-radius',
  roundControlRadius: '--theme-round-control-radius',
  surfaceRadius: '--theme-surface-radius',
  largeSurfaceRadius: '--theme-large-surface-radius',
  controlHeight: '--theme-control-height',
  spaceCompact: '--theme-space-compact',
  spaceNormal: '--theme-space-normal',
  fontFamily: '--theme-font-family',
  elevationSurface: '--theme-elevation-surface',
  motionFast: '--theme-motion-fast',
  motionNormal: '--theme-motion-normal',
});

export const defaultAppearance: IThemeAppearance = Object.freeze({
  controlRadius: '0.75rem',
  roundControlRadius: '9999px',
  surfaceRadius: '1rem',
  largeSurfaceRadius: '1.5rem',
  controlHeight: '2.25rem',
  spaceCompact: '0.375rem',
  spaceNormal: '0.75rem',
  fontFamily: 'Inter, sans-serif',
  elevationSurface: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  motionFast: '150ms',
  motionNormal: '200ms',
});

export const themeBrandTokens: readonly (keyof IThemeBrands)[] = Object.freeze([
  'provider-openai',
  'provider-openai-gpt4',
  'provider-openai-reasoning',
  'provider-anthropic',
  'provider-azure',
  'provider-bedrock',
  'provider-foreground',
]);

export const defaultBrands: IThemeBrands = Object.freeze({
  'provider-openai': '#19C37D',
  'provider-openai-gpt4': '#AB68FF',
  'provider-openai-reasoning': '#000000',
  'provider-anthropic': '#d09a74',
  'provider-azure': 'linear-gradient(0.375turn, #61bde2, #4389d0)',
  'provider-bedrock': '#268672',
  'provider-foreground': '#ffffff',
});

export const libreChatTheme: ThemeDefinition = Object.freeze({
  version: THEME_VERSION,
  name: 'librechat',
  modes: {
    light: { colors: defaultTheme },
    dark: { colors: darkTheme },
  },
  brands: defaultBrands,
});

const rgbPattern = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/;
const cssLengthPattern = /^(0|\d*\.?\d+(px|rem|em))$/;
const cssDurationPattern = /^\d*\.?\d+(ms|s)$/;
const hexColorPattern = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function isLinearGradient(value: string): boolean {
  if (!value.startsWith('linear-gradient(') || /url\s*\(|image-set/i.test(value)) {
    return false;
  }
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return i === value.length - 1;
      }
      if (depth < 0) {
        return false;
      }
    }
  }
  return false;
}

const isRGB = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }
  const match = value.match(rgbPattern);
  return match !== null && match.slice(1).every((channel) => Number(channel) <= 255);
};

const isLength = (value: unknown): value is string =>
  typeof value === 'string' && cssLengthPattern.test(value);
const isDuration = (value: unknown): value is string =>
  typeof value === 'string' && cssDurationPattern.test(value);

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || prototype.constructor?.name === 'Object';
  } catch {
    return false;
  }
};

const appearanceValidators: Record<keyof IThemeAppearance, (value: unknown) => boolean> = {
  controlRadius: isLength,
  roundControlRadius: isLength,
  surfaceRadius: isLength,
  largeSurfaceRadius: isLength,
  controlHeight: isLength,
  spaceCompact: isLength,
  spaceNormal: isLength,
  fontFamily: (value) =>
    typeof value === 'string' && value.trim().length > 0 && !/[;{}]/.test(value),
  elevationSurface: (value) =>
    typeof value === 'string' && value.trim().length > 0 && !/[;{}]|url\s*\(/i.test(value),
  motionFast: isDuration,
  motionNormal: isDuration,
};

export function validateThemeDefinition(theme: ThemeDefinition): string[] {
  const errors: string[] = [];

  if (!isPlainRecord(theme)) {
    return ['Theme definition must be an object'];
  }

  Object.keys(theme).forEach((key) => {
    if (key !== 'version' && key !== 'name' && key !== 'modes' && key !== 'brands') {
      errors.push(`Unknown theme field: ${key}`);
    }
  });

  if (theme.version !== THEME_VERSION) {
    errors.push(`Unsupported theme version: ${theme.version}`);
  }
  if (typeof theme.name !== 'string' || !theme.name.trim()) {
    errors.push('Theme name is required');
  }
  if (!isPlainRecord(theme.modes)) {
    errors.push('Theme modes must be an object');
    return errors;
  }

  Object.keys(theme.modes).forEach((mode) => {
    if (mode !== 'light' && mode !== 'dark') {
      errors.push(`Unknown theme mode: ${mode}`);
    }
  });

  (['light', 'dark'] as const).forEach((mode) => {
    const definition = theme.modes[mode];
    if (definition === undefined) {
      return;
    }

    if (!isPlainRecord(definition)) {
      errors.push(`Theme mode ${mode} must be an object`);
      return;
    }

    Object.keys(definition).forEach((key) => {
      if (key !== 'colors' && key !== 'appearance') {
        errors.push(`Unknown ${mode} theme field: ${key}`);
      }
    });

    if (definition.colors !== undefined && !isPlainRecord(definition.colors)) {
      errors.push(`Theme colors for ${mode} must be an object`);
    } else {
      Object.entries(definition.colors ?? {}).forEach(([key, value]) => {
        if (!themeColorTokens.includes(key as keyof IThemeRGB)) {
          errors.push(`Unknown color token: ${key}`);
          return;
        }
        if (value !== undefined && !isRGB(value)) {
          errors.push(`Invalid RGB value for ${key}: ${value}`);
        }
      });
    }

    if (definition.appearance !== undefined && !isPlainRecord(definition.appearance)) {
      errors.push(`Theme appearance for ${mode} must be an object`);
    } else {
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
    }
  });

  if (theme.brands !== undefined && !isPlainRecord(theme.brands)) {
    errors.push('Theme brands must be an object');
  } else {
    Object.entries(theme.brands ?? {}).forEach(([key, value]) => {
      if (!themeBrandTokens.includes(key as keyof IThemeBrands)) {
        errors.push(`Unknown brand token: ${key}`);
        return;
      }
      const isColorOnly = key === 'provider-foreground';
      const isValidBrand =
        typeof value === 'string' &&
        (isColorOnly
          ? hexColorPattern.test(value)
          : hexColorPattern.test(value) || isLinearGradient(value));
      if (value !== undefined && !isValidBrand) {
        errors.push(`Invalid brand value for ${key}: ${value}`);
      }
    });
  }

  return errors;
}

export function resolveTheme(theme: ThemeDefinition, mode: ThemeMode): ResolvedThemeDefinition {
  const errors = validateThemeDefinition(theme);
  if (errors.length > 0) {
    throw new TypeError(errors.join('\n'));
  }

  const baseColors = mode === 'dark' ? darkTheme : defaultTheme;
  const definition = theme.modes[mode];
  const customColors = definition?.colors;
  const composerHoverFallback =
    customColors?.['rgb-surface-composer-hover'] === undefined &&
    customColors?.['rgb-surface-hover'] !== undefined
      ? { 'rgb-surface-composer-hover': customColors['rgb-surface-hover'] }
      : {};
  /**
   * Themes written before the shimmer stops existed cannot name them, and
   * filling the omission from the bundled base would pin their in-flight labels
   * to LibreChat's own sweep — a theme that restates its text as white would
   * light every label in the stock near-black. A theme that wants the bundled
   * sweep alongside custom text still gets it by naming the stop, the way
   * `rgb-surface-composer-hover` opts out of its own fallback above.
   */
  const shimmerBaseFallback =
    customColors?.['rgb-shimmer-base'] === undefined &&
    customColors?.['rgb-text-primary'] !== undefined
      ? { 'rgb-shimmer-base': customColors['rgb-text-primary'] }
      : {};
  const textMutedFallback =
    customColors?.['rgb-text-muted'] === undefined &&
    customColors?.['rgb-text-tertiary'] !== undefined
      ? { 'rgb-text-muted': customColors['rgb-text-tertiary'] }
      : {};
  const chartWidgetSurfaceFallback =
    customColors?.['rgb-chart-widget-surface'] === undefined &&
    customColors?.['rgb-surface-primary'] !== undefined
      ? { 'rgb-chart-widget-surface': customColors['rgb-surface-primary'] }
      : {};
  const chartWidgetStrokeFallback =
    customColors?.['rgb-chart-widget-stroke'] === undefined &&
    customColors?.['rgb-border-light'] !== undefined
      ? { 'rgb-chart-widget-stroke': customColors['rgb-border-light'] }
      : {};

  return {
    version: THEME_VERSION,
    name: theme.name,
    mode,
    colors: {
      ...baseColors,
      ...customColors,
      ...composerHoverFallback,
      ...shimmerBaseFallback,
      ...textMutedFallback,
      ...chartWidgetSurfaceFallback,
      ...chartWidgetStrokeFallback,
    } as Required<IThemeRGB>,
    appearance: { ...defaultAppearance, ...definition?.appearance },
    brands: { ...defaultBrands, ...theme.brands },
  };
}

export function fromLegacyTheme(colors: IThemeRGB, name = 'custom'): ThemeDefinition {
  const legacyName = name.trim() || 'custom';
  const sanitizedColors = themeColorTokens.reduce<IThemeRGB>((result, token) => {
    const value = colors[token];
    if (isRGB(value)) {
      result[token] = value;
    }
    return result;
  }, {});

  return {
    version: THEME_VERSION,
    name: legacyName,
    modes: {
      light: { colors: sanitizedColors },
      dark: { colors: sanitizedColors },
    },
  };
}
