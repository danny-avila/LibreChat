import type { IThemeAppearance, IThemeBrands, IThemeRGB, ResolvedThemeDefinition } from '../types';
import { themeAppearanceProperties, themeBrandTokens, themeColorTokens } from '../registry';

const colorProperty = (token: keyof IThemeRGB): `--${string}` => `--${token.slice(4)}`;
const brandProperty = (token: keyof IThemeBrands): `--${string}` => `--${token}`;

export const themeOwnedProperties: readonly string[] = Object.freeze([
  ...themeColorTokens.map(colorProperty),
  ...Object.values(themeAppearanceProperties),
  ...themeBrandTokens.map(brandProperty),
]);

const rgbPattern = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/;

function validateRGB(rgb: string): boolean {
  const match = rgb.match(rgbPattern);
  return match !== null && match.slice(1).every((channel) => Number(channel) <= 255);
}

function mapColors(colors: IThemeRGB): Array<[string, string]> {
  const variables = themeColorTokens.reduce<Array<[string, string]>>((result, token) => {
    const value = colors[token];
    if (value !== undefined) {
      result.push([colorProperty(token), value]);
    }
    return result;
  }, []);

  if (
    colors['rgb-surface-composer-hover'] === undefined &&
    colors['rgb-surface-hover'] !== undefined
  ) {
    variables.push(['--surface-composer-hover', colors['rgb-surface-hover']]);
  }

  return variables;
}

function mapAppearance(appearance: IThemeAppearance): Array<[string, string]> {
  return Object.entries(themeAppearanceProperties).map(([key, property]) => [
    property,
    appearance[key as keyof IThemeAppearance],
  ]);
}

export function clearAppliedTheme(root: HTMLElement = document.documentElement): void {
  themeOwnedProperties.forEach((property) => root.style.removeProperty(property));
  root.removeAttribute('data-theme');
}

export function applyResolvedTheme(
  theme: ResolvedThemeDefinition,
  root: HTMLElement = document.documentElement,
): void {
  const variables = [
    ...mapColors(theme.colors),
    ...mapAppearance(theme.appearance),
    ...themeBrandTokens.map(
      (token) => [brandProperty(token), theme.brands[token]] as [string, string],
    ),
  ];

  variables.forEach(([property, value]) => root.style.setProperty(property, value));
  root.dataset.theme = theme.name;
}

/**
 * Backward-compatible adapter for the original partial RGB theme interface.
 * New theme implementations should resolve a ThemeDefinition and use applyResolvedTheme.
 */
export default function applyTheme(
  themeRGB?: IThemeRGB,
  root: HTMLElement = document.documentElement,
): void {
  if (!themeRGB) {
    return;
  }

  mapColors(themeRGB).forEach(([property, value]) => {
    if (!validateRGB(value)) {
      console.error(`Invalid RGB value for ${property}: ${value}`);
      return;
    }
    root.style.setProperty(property, value);
  });
}
