import type { IThemeRGB } from '../types';
import {
  HIGH_CONTRAST_THEME_NAME,
  highContrastTheme,
  resolveTheme,
  themeColorTokens,
} from '../registry';
import { highContrastDarkTheme, highContrastLightTheme } from './highContrast';

type Rgb = [number, number, number];

/** WCAG 1.4.6 enhanced contrast, the reason these modes exist. */
const WCAG_AAA_NORMAL = 7;
/** WCAG 1.4.11 non-text contrast, for borders, rings, marks and fills. */
const WCAG_NON_TEXT = 3;

/** Surfaces body copy renders on, including the interaction fills; a hover
 *  state that drops text below AAA is still a contrast failure. */
const surfaces: Array<keyof IThemeRGB> = [
  'rgb-surface-primary',
  'rgb-surface-primary-alt',
  'rgb-surface-primary-contrast',
  'rgb-surface-secondary',
  'rgb-surface-secondary-alt',
  'rgb-surface-tertiary',
  'rgb-surface-tertiary-alt',
  'rgb-surface-dialog',
  'rgb-surface-chat',
  'rgb-presentation',
  'rgb-surface-hover',
  'rgb-surface-hover-alt',
  'rgb-surface-active',
  'rgb-surface-active-alt',
  'rgb-surface-composer-hover',
  'rgb-header-primary',
  'rgb-header-hover',
  'rgb-header-button-hover',
];

const textTokens: Array<keyof IThemeRGB> = [
  'rgb-text-primary',
  'rgb-text-secondary',
  'rgb-text-secondary-alt',
  'rgb-text-tertiary',
];

/** Painted with `text-text-on-status`, the per-mode label colour. Every feature
 *  call site reads that token; none hard-codes `text-white` any more. */
const solidFills: Array<keyof IThemeRGB> = [
  'rgb-surface-submit',
  'rgb-surface-submit-hover',
  'rgb-surface-destructive',
  'rgb-surface-destructive-hover',
  'rgb-status-success-strong',
  'rgb-status-info-strong',
  'rgb-status-warning-strong',
  'rgb-status-error-strong',
];

const borderTokens: Array<keyof IThemeRGB> = [
  'rgb-border-light',
  'rgb-border-medium',
  'rgb-border-medium-alt',
  'rgb-border-heavy',
  'rgb-border-xheavy',
  'rgb-border-destructive',
  'rgb-ring-primary',
];

const accentTokens: Array<keyof IThemeRGB> = [
  'rgb-accent-primary',
  'rgb-accent-primary-hover',
  'rgb-link',
  'rgb-link-hover',
  'rgb-link-visited',
  'rgb-brand-purple',
];

const statusHues = ['success', 'info', 'warning', 'error', 'neutral'] as const;

function toRgb(theme: IThemeRGB, token: keyof IThemeRGB): Rgb {
  const parts = theme[token]?.trim().split(/\s+/).map(Number);
  if (parts?.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`theme token "${token}" is not an "R G B" triplet`);
  }
  return [parts[0], parts[1], parts[2]];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

function below(
  theme: IThemeRGB,
  minimum: number,
  foregrounds: Array<keyof IThemeRGB>,
  backgrounds: Array<keyof IThemeRGB>,
): string[] {
  return foregrounds.flatMap((foreground) =>
    backgrounds.flatMap((background) => {
      const ratio = contrast(toRgb(theme, foreground), toRgb(theme, background));
      return ratio < minimum
        ? [`${foreground} on ${background}: ${ratio.toFixed(2)}:1 (needs ${minimum}:1)`]
        : [];
    }),
  );
}

describe.each([
  ['high contrast light', highContrastLightTheme],
  ['high contrast dark', highContrastDarkTheme],
])('%s palette', (_name, theme: IThemeRGB) => {
  it('declares every registry token, so nothing falls back to a mid-grey default', () => {
    expect(Object.keys(theme).sort()).toEqual([...themeColorTokens].sort());
  });

  it('keeps neutral text at WCAG AAA on every surface, hover and active fill', () => {
    expect(below(theme, WCAG_AAA_NORMAL, textTokens, surfaces)).toEqual([]);
  });

  it('keeps warning and destructive text at WCAG AAA on the page', () => {
    expect(
      below(
        theme,
        WCAG_AAA_NORMAL,
        ['rgb-text-warning', 'rgb-text-destructive'],
        ['rgb-surface-primary', 'rgb-surface-secondary', 'rgb-surface-dialog'],
      ),
    ).toEqual([]);
  });

  it('keeps every status hue at WCAG AAA against its own subtle fill', () => {
    const failures = statusHues.flatMap((hue) =>
      below(
        theme,
        WCAG_AAA_NORMAL,
        [`rgb-status-${hue}` as keyof IThemeRGB],
        [`rgb-status-${hue}-subtle` as keyof IThemeRGB],
      ),
    );
    expect(failures).toEqual([]);
  });

  it('keeps accents and links at WCAG AAA on the page', () => {
    expect(
      below(theme, WCAG_AAA_NORMAL, accentTokens, ['rgb-surface-primary', 'rgb-surface-secondary']),
    ).toEqual([]);
  });

  it('keeps inverted and fixed pairs at WCAG AAA', () => {
    expect(below(theme, WCAG_AAA_NORMAL, ['rgb-text-inverted'], ['rgb-surface-inverted'])).toEqual(
      [],
    );
    expect(
      below(theme, WCAG_AAA_NORMAL, ['rgb-text-inverted'], ['rgb-surface-inverted-hover']),
    ).toEqual([]);
    expect(
      below(
        theme,
        WCAG_AAA_NORMAL,
        ['rgb-text-fixed'],
        ['rgb-surface-fixed', 'rgb-surface-fixed-hover'],
      ),
    ).toEqual([]);
  });

  it('keeps borders and rings above the 3:1 non-text floor on every canvas', () => {
    expect(
      below(theme, WCAG_NON_TEXT, borderTokens, [
        'rgb-surface-primary',
        'rgb-surface-secondary',
        'rgb-surface-tertiary',
        'rgb-surface-dialog',
      ]),
    ).toEqual([]);
  });

  /** Each mode paints its fills on the far side of its own canvas, so the label
   *  ratio and the silhouette ratio are the same number and both reach AAA.
   *  Getting here is exactly what the per-mode `text-on-status` token buys: a
   *  literal white label would cap dark-mode fills at 6.66:1 with a 3.15:1
   *  silhouette, because those two would then pull in opposite directions. */
  it('keeps solid fills at WCAG AAA against both their label and the page', () => {
    expect(below(theme, WCAG_AAA_NORMAL, ['rgb-text-on-status'], solidFills)).toEqual([]);
    expect(below(theme, WCAG_AAA_NORMAL, solidFills, ['rgb-surface-primary'])).toEqual([]);
  });

  it('paints its status labels in the ink of the opposing canvas', () => {
    expect(theme['rgb-text-on-status']).toBe(
      theme === highContrastDarkTheme ? '0 0 0' : '255 255 255',
    );
  });

  it('never reuses a reserved status colour for series identity', () => {
    const reserved = new Set(
      statusHues.map((hue) => theme[`rgb-status-${hue}` as keyof IThemeRGB]),
    );
    for (let slot = 1; slot <= 7; slot += 1) {
      expect(reserved.has(theme[`rgb-series-${slot}` as keyof IThemeRGB])).toBe(false);
    }
  });
});

describe('high contrast theme definition', () => {
  it('resolves both modes without falling back to the standard palettes', () => {
    expect(resolveTheme(highContrastTheme, 'light').colors).toEqual(highContrastLightTheme);
    expect(resolveTheme(highContrastTheme, 'dark').colors).toEqual(highContrastDarkTheme);
    expect(resolveTheme(highContrastTheme, 'light').name).toBe(HIGH_CONTRAST_THEME_NAME);
  });

  it('inverts the canvas and the ink between its two modes', () => {
    expect(highContrastLightTheme['rgb-surface-primary']).toBe('255 255 255');
    expect(highContrastLightTheme['rgb-text-primary']).toBe('0 0 0');
    expect(highContrastDarkTheme['rgb-surface-primary']).toBe('0 0 0');
    expect(highContrastDarkTheme['rgb-text-primary']).toBe('255 255 255');
  });
});
