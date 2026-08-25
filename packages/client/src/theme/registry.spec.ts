import type { ThemeDefinition } from './types';
import {
  defaultAppearance,
  defaultBrands,
  fromLegacyTheme,
  libreChatTheme,
  resolveTheme,
  themeColorTokens,
  validateThemeDefinition,
} from './registry';
import { defaultTheme } from './themes/default';
import { darkTheme } from './themes/dark';

const compactTheme: ThemeDefinition = {
  version: 1,
  name: 'compact-reference',
  modes: {
    light: {
      colors: { 'rgb-accent-primary': '1 2 3' },
      appearance: {
        controlRadius: '0.25rem',
        roundControlRadius: '0.25rem',
        surfaceRadius: '0.5rem',
        largeSurfaceRadius: '0.5rem',
        controlHeight: '2rem',
        spaceCompact: '0.25rem',
        spaceNormal: '0.5rem',
        motionFast: '80ms',
        motionNormal: '120ms',
      },
    },
  },
};

describe('theme registry', () => {
  it('keeps bundled light and dark themes complete against the canonical registry', () => {
    expect(Object.keys(defaultTheme).sort()).toEqual([...themeColorTokens].sort());
    expect(Object.keys(darkTheme).sort()).toEqual([...themeColorTokens].sort());
  });

  it('resolves partial definitions against mode-specific LibreChat defaults', () => {
    const light = resolveTheme(compactTheme, 'light');
    const dark = resolveTheme(compactTheme, 'dark');

    expect(light.colors['rgb-accent-primary']).toBe('1 2 3');
    expect(light.colors['rgb-text-primary']).toBe(defaultTheme['rgb-text-primary']);
    expect(light.appearance.controlRadius).toBe('0.25rem');
    expect(light.appearance.fontFamily).toBe(defaultAppearance.fontFamily);
    expect(dark.colors['rgb-text-primary']).toBe(darkTheme['rgb-text-primary']);
    expect(dark.appearance).toEqual(defaultAppearance);
  });

  it('resolves provider brand tokens and lets a theme override them', () => {
    const defaults = resolveTheme(libreChatTheme, 'light');
    expect(defaults.brands['provider-anthropic']).toBe('#d09a74');
    expect(defaults.brands['provider-openai']).toBe(defaultBrands['provider-openai']);

    const custom = resolveTheme(
      {
        version: 1,
        name: 'white-label',
        modes: { light: {} },
        brands: { 'provider-anthropic': '#ffffff' },
      },
      'light',
    );
    expect(custom.brands['provider-anthropic']).toBe('#ffffff');
    expect(custom.brands['provider-openai']).toBe(defaultBrands['provider-openai']);
  });

  it('rejects CSS appended to a provider gradient', () => {
    expect(
      validateThemeDefinition({
        version: 1,
        name: 'invalid',
        modes: {},
        brands: {
          'provider-azure': 'linear-gradient(#000,#000), url(https://example.com/pixel)',
        },
      }),
    ).toContain(
      'Invalid brand value for provider-azure: linear-gradient(#000,#000), url(https://example.com/pixel)',
    );
  });

  it('rejects stacked CSS after a balanced gradient', () => {
    expect(
      validateThemeDefinition({
        version: 1,
        name: 'invalid',
        modes: {},
        brands: {
          'provider-azure':
            'linear-gradient(#000,#000), -webkit-image-set("https://example.com/pixel" 1x)',
        },
      }),
    ).toEqual(
      expect.arrayContaining([expect.stringContaining('Invalid brand value for provider-azure')]),
    );
  });

  it('rejects a gradient for the provider foreground token', () => {
    expect(
      validateThemeDefinition({
        version: 1,
        name: 'invalid',
        modes: {},
        brands: {
          'provider-foreground': 'linear-gradient(#fff,#fff)',
        },
      }),
    ).toContain('Invalid brand value for provider-foreground: linear-gradient(#fff,#fff)');
  });

  it('preserves hover overrides from themes created before the composer hover token', () => {
    const storedTheme: ThemeDefinition = {
      version: 1,
      name: 'stored-theme',
      modes: {
        dark: {
          colors: { 'rgb-surface-hover': '44 45 46' },
        },
      },
    };

    const dark = resolveTheme(storedTheme, 'dark');

    expect(dark.colors['rgb-surface-hover']).toBe('44 45 46');
    expect(dark.colors['rgb-surface-composer-hover']).toBe('44 45 46');
  });

  it('reports invalid and unknown values before a definition reaches the DOM', () => {
    const invalidTheme = {
      version: 1,
      name: 'invalid',
      modes: {
        light: {
          colors: {
            'rgb-text-primary': '999 0 0',
            'rgb-unknown': '1 2 3',
          },
          appearance: {
            controlRadius: 'url(theme.css)',
            unknownSpacing: '1rem',
          },
        },
      },
    } as ThemeDefinition;

    expect(validateThemeDefinition(invalidTheme)).toEqual([
      'Invalid RGB value for rgb-text-primary: 999 0 0',
      'Unknown color token: rgb-unknown',
      'Invalid appearance value for controlRadius: url(theme.css)',
      'Unknown appearance token: unknownSpacing',
    ]);
    expect(() => resolveTheme(invalidTheme, 'light')).toThrow(TypeError);
  });

  it('sanitizes malformed legacy colors without weakening definition validation', () => {
    const legacyTheme = fromLegacyTheme(
      {
        'rgb-accent-primary': '1 2 3',
        'rgb-text-primary': 'invalid',
      },
      ' ',
    );

    expect(legacyTheme.name).toBe('custom');
    expect(legacyTheme.modes.light?.colors).toEqual({
      'rgb-accent-primary': '1 2 3',
    });

    const invalidTheme = {
      version: 1,
      name: 'invalid',
      modes: {
        light: {
          colors: { 'rgb-text-primary': null as never },
          appearance: { fontFamily: 42 as never },
        },
      },
    } as ThemeDefinition;

    expect(validateThemeDefinition(invalidTheme)).toEqual([
      'Invalid RGB value for rgb-text-primary: null',
      'Invalid appearance value for fontFamily: 42',
    ]);
  });

  it.each([
    [
      'mode collection arrays',
      { version: 1, name: 'invalid', modes: [] },
      'Theme modes must be an object',
    ],
    [
      'mode arrays',
      { version: 1, name: 'invalid', modes: { light: [] } },
      'Theme mode light must be an object',
    ],
    [
      'null modes',
      { version: 1, name: 'invalid', modes: { light: null } },
      'Theme mode light must be an object',
    ],
    [
      'color arrays',
      { version: 1, name: 'invalid', modes: { light: { colors: [] } } },
      'Theme colors for light must be an object',
    ],
    [
      'appearance arrays',
      { version: 1, name: 'invalid', modes: { light: { appearance: [] } } },
      'Theme appearance for light must be an object',
    ],
    [
      'unknown modes',
      { version: 1, name: 'invalid', modes: { sepia: {} } },
      'Unknown theme mode: sepia',
    ],
    [
      'unknown top-level fields',
      { version: 1, name: 'invalid', modes: {}, css: ':root {}' },
      'Unknown theme field: css',
    ],
    [
      'unknown mode fields',
      { version: 1, name: 'invalid', modes: { light: { appearence: {} } } },
      'Unknown light theme field: appearence',
    ],
  ])('rejects malformed runtime %s', (_label, definition, expectedError) => {
    expect(validateThemeDefinition(definition as ThemeDefinition)).toContain(expectedError);
    expect(() => resolveTheme(definition as ThemeDefinition, 'light')).toThrow(TypeError);
  });
});
