import type { ThemeDefinition } from '../types';
import applyTheme, { applyResolvedTheme, clearAppliedTheme } from './applyTheme';
import { defaultTheme } from '../themes/default';
import { resolveTheme } from '../registry';

const semanticProperties = [
  '--link',
  '--link-hover',
  '--link-visited',
  '--accent-primary',
  '--accent-primary-hover',
  '--text-destructive',
  '--border-destructive',
  '--status-success',
  '--status-success-subtle',
  '--status-success-border',
  '--status-success-strong',
  '--surface-overlay',
  '--surface-hover',
  '--surface-composer-hover',
  '--text-on-status',
  '--status-error',
  '--status-neutral-border',
];

afterEach(() => {
  semanticProperties.forEach((property) => document.documentElement.style.removeProperty(property));
  clearAppliedTheme();
});

describe('applyTheme', () => {
  it('applies link and accent colors from runtime themes', () => {
    applyTheme({
      'rgb-link': '1 2 3',
      'rgb-link-hover': '4 5 6',
      'rgb-link-visited': '7 8 9',
      'rgb-accent-primary': '10 11 12',
      'rgb-accent-primary-hover': '13 14 15',
    });

    expect(document.documentElement.style.getPropertyValue('--link')).toBe('1 2 3');
    expect(document.documentElement.style.getPropertyValue('--link-hover')).toBe('4 5 6');
    expect(document.documentElement.style.getPropertyValue('--link-visited')).toBe('7 8 9');
    expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('10 11 12');
    expect(document.documentElement.style.getPropertyValue('--accent-primary-hover')).toBe(
      '13 14 15',
    );
  });

  it('applies the composer hover surface from runtime themes', () => {
    applyTheme({
      'rgb-surface-composer-hover': '66 66 66',
    });

    expect(document.documentElement.style.getPropertyValue('--surface-composer-hover')).toBe(
      '66 66 66',
    );
  });

  it('keeps existing custom hover colors on composer controls', () => {
    applyTheme({
      'rgb-surface-hover': '44 45 46',
    });

    expect(document.documentElement.style.getPropertyValue('--surface-hover')).toBe('44 45 46');
    expect(document.documentElement.style.getPropertyValue('--surface-composer-hover')).toBe(
      '44 45 46',
    );
  });

  it('applies status and destructive colors from runtime themes', () => {
    applyTheme({
      'rgb-text-destructive': '20 21 22',
      'rgb-border-destructive': '23 24 25',
      'rgb-status-success': '26 27 28',
      'rgb-status-success-subtle': '29 30 31',
      'rgb-status-success-border': '32 33 34',
      'rgb-status-success-strong': '33 34 35',
      'rgb-status-error': '35 36 37',
      'rgb-status-neutral-border': '38 39 40',
      'rgb-surface-overlay': '39 40 41',
      'rgb-text-on-status': '42 43 44',
    });

    const style = document.documentElement.style;
    expect(style.getPropertyValue('--text-destructive')).toBe('20 21 22');
    expect(style.getPropertyValue('--border-destructive')).toBe('23 24 25');
    expect(style.getPropertyValue('--status-success')).toBe('26 27 28');
    expect(style.getPropertyValue('--status-success-subtle')).toBe('29 30 31');
    expect(style.getPropertyValue('--status-success-border')).toBe('32 33 34');
    expect(style.getPropertyValue('--status-success-strong')).toBe('33 34 35');
    expect(style.getPropertyValue('--status-error')).toBe('35 36 37');
    expect(style.getPropertyValue('--status-neutral-border')).toBe('38 39 40');
    expect(style.getPropertyValue('--surface-overlay')).toBe('39 40 41');
    expect(style.getPropertyValue('--text-on-status')).toBe('42 43 44');
  });

  it('ships status tokens in the bundled themes', () => {
    applyTheme(defaultTheme);

    expect(document.documentElement.style.getPropertyValue('--status-error')).toBe(
      defaultTheme['rgb-status-error'],
    );
    expect(document.documentElement.style.getPropertyValue('--surface-overlay')).toBe('89 89 89');
  });

  it('applies a resolved appearance atomically', () => {
    const referenceTheme: ThemeDefinition = {
      version: 1,
      name: 'compact-reference',
      modes: {
        light: {
          appearance: {
            controlRadius: '0.25rem',
            roundControlRadius: '0.25rem',
            surfaceRadius: '0.5rem',
            largeSurfaceRadius: '0.5rem',
            motionFast: '80ms',
          },
        },
      },
    };

    applyResolvedTheme(resolveTheme(referenceTheme, 'light'));

    const root = document.documentElement;
    expect(root.dataset.theme).toBe('compact-reference');
    expect(root.style.getPropertyValue('--theme-control-radius')).toBe('0.25rem');
    expect(root.style.getPropertyValue('--theme-surface-radius')).toBe('0.5rem');
    expect(root.style.getPropertyValue('--theme-motion-fast')).toBe('80ms');
  });

  it('clears only properties owned by the theme module', () => {
    const root = document.documentElement;
    root.style.setProperty('--text-primary', '1 2 3');
    root.style.setProperty('--theme-control-radius', '0.25rem');
    root.style.setProperty('--markdown-font-size', '18px');

    clearAppliedTheme(root);

    expect(root.style.getPropertyValue('--text-primary')).toBe('');
    expect(root.style.getPropertyValue('--theme-control-radius')).toBe('');
    expect(root.style.getPropertyValue('--markdown-font-size')).toBe('18px');
    root.style.removeProperty('--markdown-font-size');
  });

  it('applies provider brand backgrounds from the theme', () => {
    applyResolvedTheme(
      resolveTheme(
        {
          version: 1,
          name: 'white-label',
          modes: { light: {} },
          brands: { 'provider-openai': '#123456' },
        },
        'light',
      ),
    );

    expect(document.documentElement.style.getPropertyValue('--provider-openai')).toBe('#123456');
  });
});
