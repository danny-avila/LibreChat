import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import type { ThemeMode, IThemeRGB } from '../types';
import {
  defaultAppearance,
  libreChatTheme,
  resolveTheme,
  themeColorTokens,
  validateThemeDefinition,
} from '../registry';
import { clickHouseDarkTheme, clickHouseLightTheme, clickHouseTheme } from './clickhouse';
import { ThemeProvider } from '../context/ThemeProvider';

type Rgb = [number, number, number];

/** A brand theme, not an accessibility mode: WCAG AA rather than AAA. */
const WCAG_AA_NORMAL = 4.5;
/** WCAG 1.4.11 non-text contrast, for control boundaries, rings, fills and marks. */
const WCAG_NON_TEXT = 3;

const canvasSurfaces: Array<keyof IThemeRGB> = [
  'rgb-surface-primary',
  'rgb-chart-widget-surface',
  'rgb-surface-primary-alt',
  'rgb-surface-secondary',
  'rgb-surface-tertiary',
  'rgb-surface-tertiary-alt',
  'rgb-surface-dialog',
  'rgb-surface-chat',
  'rgb-surface-code',
  'rgb-presentation',
];

/** Fills a row or menu item takes on hover or selection, which carry the
 *  primary label. */
const interactiveFills: Array<keyof IThemeRGB> = [
  'rgb-surface-active',
  'rgb-surface-active-alt',
  'rgb-surface-hover',
  'rgb-surface-hover-alt',
  'rgb-surface-composer-hover',
  'rgb-surface-primary-contrast',
  'rgb-surface-secondary-alt',
  'rgb-header-primary',
  'rgb-header-hover',
  'rgb-header-button-hover',
];

const neutralTextTokens: Array<keyof IThemeRGB> = [
  'rgb-text-primary',
  'rgb-text-secondary',
  'rgb-text-secondary-alt',
  'rgb-text-tertiary',
  'rgb-text-muted',
];

const syntaxTokens: Array<keyof IThemeRGB> = [
  'rgb-syntax-text',
  'rgb-syntax-comment',
  'rgb-syntax-meta',
  'rgb-syntax-builtin',
  'rgb-syntax-keyword',
  'rgb-syntax-string',
  'rgb-syntax-attr',
  'rgb-syntax-title',
];

const accentTokens: Array<keyof IThemeRGB> = [
  'rgb-accent-primary',
  'rgb-accent-primary-hover',
  'rgb-link',
  'rgb-link-hover',
  'rgb-link-visited',
  'rgb-brand-purple',
];

/** Painted under `text-on-status`, the single per-mode label. */
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

/** The roles whose only job is to outline a control. `border-light` through
 *  `border-heavy` paint dividers and card edges, and `border-medium` also
 *  outlines inputs such as `Select` and `InputNumber`: that one sits at 1.24:1
 *  here and 1.52:1 in the LibreChat palette, a gap the registry has no
 *  control-boundary role to close, so it is left to a follow-up rather than
 *  asserted. */
const boundaryTokens: Array<keyof IThemeRGB> = [
  'rgb-border-xheavy',
  'rgb-border-destructive',
  'rgb-ring-primary',
];

const seriesTokens = Array.from(
  { length: 8 },
  (_, index) => `rgb-series-${index + 1}` as keyof IThemeRGB,
);

const statusHues = ['success', 'info', 'warning', 'error', 'neutral'] as const;

/** Roles a reader would name as "the theme": if these match LibreChat's, the
 *  reference theme proves nothing. Light `surface-primary` is the one exception:
 *  Click UI's `background.default` and LibreChat's light canvas are both
 *  #ffffff, which the definition test asserts rather than hides. */
const divergentTokens: Array<keyof IThemeRGB> = [
  'rgb-surface-primary',
  'rgb-surface-secondary',
  'rgb-text-primary',
  'rgb-text-secondary',
  'rgb-border-light',
  'rgb-accent-primary',
  'rgb-surface-submit',
  'rgb-link',
];

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

const modes: Array<[ThemeMode, IThemeRGB]> = [
  ['light', clickHouseLightTheme],
  ['dark', clickHouseDarkTheme],
];

describe.each(modes)('clickhouse %s palette', (_mode, theme) => {
  it('declares every registry token, so nothing falls back to the LibreChat palette', () => {
    expect(Object.keys(theme).sort()).toEqual([...themeColorTokens].sort());
  });

  it('keeps neutral text at WCAG AA on every canvas surface', () => {
    expect(below(theme, WCAG_AA_NORMAL, neutralTextTokens, canvasSurfaces)).toEqual([]);
  });

  it('keeps primary text at WCAG AA on hover, selected and header fills', () => {
    expect(below(theme, WCAG_AA_NORMAL, ['rgb-text-primary'], interactiveFills)).toEqual([]);
  });

  /** The chat error box, the route error boundary and the sign-in notices paint
   *  secondary copy on a status fill rather than on a canvas. */
  it('keeps secondary and destructive text at WCAG AA on every status fill', () => {
    const fills = statusHues.map((hue) => `rgb-status-${hue}-subtle` as keyof IThemeRGB);
    expect(
      below(theme, WCAG_AA_NORMAL, ['rgb-text-secondary', 'rgb-text-destructive'], fills),
    ).toEqual([]);
  });

  it('keeps warning and destructive text at WCAG AA on canvas surfaces', () => {
    expect(
      below(theme, WCAG_AA_NORMAL, ['rgb-text-warning', 'rgb-text-destructive'], canvasSurfaces),
    ).toEqual([]);
  });

  it('keeps every status hue at WCAG AA against its own subtle fill', () => {
    const failures = statusHues.flatMap((hue) =>
      below(
        theme,
        WCAG_AA_NORMAL,
        [`rgb-status-${hue}` as keyof IThemeRGB],
        [`rgb-status-${hue}-subtle` as keyof IThemeRGB],
      ),
    );
    expect(failures).toEqual([]);
  });

  it('keeps accents and links at WCAG AA on the page', () => {
    expect(
      below(theme, WCAG_AA_NORMAL, accentTokens, ['rgb-surface-primary', 'rgb-surface-secondary']),
    ).toEqual([]);
  });

  it('keeps every syntax colour at WCAG AA on the code surface', () => {
    expect(below(theme, WCAG_AA_NORMAL, syntaxTokens, ['rgb-surface-code'])).toEqual([]);
  });

  it('keeps inverted and fixed pairs at WCAG AA', () => {
    expect(
      below(
        theme,
        WCAG_AA_NORMAL,
        ['rgb-text-inverted'],
        ['rgb-surface-inverted', 'rgb-surface-inverted-hover'],
      ),
    ).toEqual([]);
    expect(
      below(
        theme,
        WCAG_AA_NORMAL,
        ['rgb-text-fixed'],
        ['rgb-surface-fixed', 'rgb-surface-fixed-hover'],
      ),
    ).toEqual([]);
  });

  it('carries the status label at WCAG AA on every solid fill', () => {
    expect(below(theme, WCAG_AA_NORMAL, ['rgb-text-on-status'], solidFills)).toEqual([]);
  });

  it('keeps solid fills and the verified mark at the 3:1 floor against the page', () => {
    expect(
      below(
        theme,
        WCAG_NON_TEXT,
        [...solidFills, 'rgb-status-verified'],
        ['rgb-surface-primary', 'rgb-surface-secondary', 'rgb-surface-dialog'],
      ),
    ).toEqual([]);
    expect(below(theme, WCAG_NON_TEXT, ['rgb-text-on-status'], ['rgb-status-verified'])).toEqual(
      [],
    );
  });

  it('keeps control boundaries and rings at the 3:1 floor on every canvas', () => {
    expect(
      below(theme, WCAG_NON_TEXT, boundaryTokens, [
        'rgb-surface-primary',
        'rgb-surface-secondary',
        'rgb-surface-tertiary',
        'rgb-surface-dialog',
      ]),
    ).toEqual([]);
  });

  it('keeps every series mark at the 3:1 floor on the page and under the status label', () => {
    expect(
      below(theme, WCAG_NON_TEXT, seriesTokens, [
        'rgb-surface-primary',
        'rgb-surface-secondary',
        'rgb-surface-tertiary',
        'rgb-surface-chat',
        'rgb-surface-dialog',
        'rgb-text-on-status',
      ]),
    ).toEqual([]);
  });

  it('never reuses a reserved status colour for series identity', () => {
    const reserved = new Set(
      statusHues.map((hue) => theme[`rgb-status-${hue}` as keyof IThemeRGB]),
    );
    expect(seriesTokens.filter((token) => reserved.has(theme[token]))).toEqual([]);
  });
});

describe('clickhouse theme definition', () => {
  it('validates as a data-only theme definition', () => {
    expect(validateThemeDefinition(clickHouseTheme)).toEqual([]);
  });

  it.each(modes)('resolves %s mode to its own palette without fallback', (mode, palette) => {
    const resolved = resolveTheme(clickHouseTheme, mode);

    expect(resolved.name).toBe('clickhouse');
    expect(resolved.colors).toEqual(palette);
    expect(resolved.appearance).toMatchObject({
      controlRadius: '0.25rem',
      surfaceRadius: '0.5rem',
      largeSurfaceRadius: '0.75rem',
      roundControlRadius: '9999px',
    });
    expect(resolved.appearance.fontFamily).toMatch(/^"Inter", "SF Pro Display"/);
  });

  it.each(modes)('repaints the %s canvas, text, border and accent roles', (mode) => {
    const clickHouse = resolveTheme(clickHouseTheme, mode);
    const libreChat = resolveTheme(libreChatTheme, mode);
    const expectedShared = mode === 'light' ? ['rgb-surface-primary'] : [];

    expect(
      divergentTokens.filter((token) => clickHouse.colors[token] === libreChat.colors[token]),
    ).toEqual(expectedShared);
    expect(clickHouse.appearance.controlRadius).not.toBe(defaultAppearance.controlRadius);
    expect(clickHouse.appearance.surfaceRadius).not.toBe(defaultAppearance.surfaceRadius);
    expect(clickHouse.appearance.largeSurfaceRadius).not.toBe(defaultAppearance.largeSurfaceRadius);
  });

  it('keeps the brand yellow as the dark-mode accent and link', () => {
    expect(clickHouseDarkTheme['rgb-accent-primary']).toBe('250 255 105');
    expect(clickHouseDarkTheme['rgb-surface-submit']).toBe('250 255 105');
    expect(clickHouseDarkTheme['rgb-link']).toBe('250 255 105');
  });
});

describe('clickhouse theme at runtime', () => {
  const matchMedia = (): MediaQueryList =>
    ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }) as MediaQueryList;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('class');
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-theme');
    window.matchMedia = jest.fn(matchMedia);
  });

  const renderProvider = (initialTheme: ThemeMode, themeDefinition = clickHouseTheme) => (
    <ThemeProvider
      initialTheme={initialTheme}
      persistThemeDefinition={false}
      themeDefinition={themeDefinition}
    >
      {null}
    </ThemeProvider>
  );

  const property = (name: string) => document.documentElement.style.getPropertyValue(name);

  it('repaints the root from the definition in both modes and hands back to LibreChat', async () => {
    const { rerender } = render(renderProvider('light'));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('clickhouse');
    });
    expect(property('--surface-primary')).toBe(clickHouseLightTheme['rgb-surface-primary']);
    expect(property('--text-primary')).toBe(clickHouseLightTheme['rgb-text-primary']);
    expect(property('--theme-control-radius')).toBe('0.25rem');

    rerender(renderProvider('dark'));

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark');
    });
    expect(property('--surface-primary')).toBe(clickHouseDarkTheme['rgb-surface-primary']);
    expect(property('--text-primary')).toBe(clickHouseDarkTheme['rgb-text-primary']);
    expect(property('--theme-control-radius')).toBe('0.25rem');

    rerender(renderProvider('dark', libreChatTheme));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('librechat');
    });
    const libreChatDark = resolveTheme(libreChatTheme, 'dark');
    expect(property('--surface-primary')).toBe(libreChatDark.colors['rgb-surface-primary']);
    expect(property('--text-primary')).toBe(libreChatDark.colors['rgb-text-primary']);
    expect(property('--theme-control-radius')).toBe(defaultAppearance.controlRadius);
  });
});
