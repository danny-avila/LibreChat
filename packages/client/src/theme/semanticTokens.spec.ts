import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { IThemeRGB } from './types';
import { defaultTheme } from './themes/default';
import { darkTheme } from './themes/dark';

const sharedComponents = [
  'AnimatedSearchInput.tsx',
  'AlertDialog.tsx',
  'Button.tsx',
  'Chip.tsx',
  'Dialog.tsx',
  'IconButton.tsx',
  'Tag.tsx',
  'Toast.tsx',
];

describe('shared component color guardrail', () => {
  it('keeps shared primitives free of direct palette utilities and hex colors', () => {
    const directPalette =
      /(?:bg|text|border|ring|from|via|to)-(?:gray|red|green|blue|purple|amber|yellow|orange|pink|indigo|violet|teal|cyan|slate|zinc|neutral|stone)-\d/;
    const hexColor = /#[0-9a-f]{3,8}\b/i;

    sharedComponents.forEach((component) => {
      const source = readFileSync(join(__dirname, '..', 'components', component), 'utf8');

      expect(source).not.toMatch(directPalette);
      expect(source).not.toMatch(hexColor);
    });
  });
});

type Rgb = [number, number, number];

/** Surfaces that carry body copy; `surface-tertiary` is chip/input fill, added per-group below. */
const canvasSurfaces: Array<keyof IThemeRGB> = [
  'rgb-surface-primary',
  'rgb-surface-primary-alt',
  'rgb-surface-secondary',
  'rgb-surface-dialog',
  'rgb-surface-chat',
  'rgb-presentation',
];

const neutralTextTokens: Array<keyof IThemeRGB> = [
  'rgb-text-primary',
  'rgb-text-secondary',
  'rgb-text-secondary-alt',
  'rgb-text-tertiary',
];

const statusTextTokens: Array<keyof IThemeRGB> = ['rgb-text-warning', 'rgb-text-destructive'];

/** How Alert/Badge/Tag/Chip paint every status variant: `text-status-x` on `bg-status-x-subtle`. */
const statusHues = ['success', 'info', 'warning', 'error', 'neutral'] as const;

const WCAG_AA_NORMAL = 4.5;

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

function belowAA(
  theme: IThemeRGB,
  textTokens: Array<keyof IThemeRGB>,
  surfaces: Array<keyof IThemeRGB>,
): string[] {
  return textTokens.flatMap((text) =>
    surfaces.flatMap((surface) => {
      const ratio = contrast(toRgb(theme, text), toRgb(theme, surface));
      return ratio < WCAG_AA_NORMAL ? [`${text} on ${surface}: ${ratio.toFixed(2)}:1`] : [];
    }),
  );
}

describe.each([
  ['default', defaultTheme],
  ['dark', darkTheme],
])('%s theme text contrast', (_name, theme: IThemeRGB) => {
  it('keeps neutral text at WCAG AA on every surface it renders on', () => {
    expect(belowAA(theme, neutralTextTokens, [...canvasSurfaces, 'rgb-surface-tertiary'])).toEqual(
      [],
    );
  });

  it('keeps warning and destructive text at WCAG AA on canvas surfaces', () => {
    expect(belowAA(theme, statusTextTokens, canvasSurfaces)).toEqual([]);
  });

  it('keeps every status hue at WCAG AA against its own subtle fill', () => {
    const failures = statusHues.flatMap((hue) =>
      belowAA(
        theme,
        [`rgb-status-${hue}` as keyof IThemeRGB],
        [`rgb-status-${hue}-subtle` as keyof IThemeRGB],
      ),
    );
    expect(failures).toEqual([]);
  });
});
