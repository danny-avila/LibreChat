import { defaultTheme } from '../themes/default';
import applyTheme from './applyTheme';

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
  '--status-error',
  '--status-neutral-border',
];

afterEach(() => {
  semanticProperties.forEach((property) => document.documentElement.style.removeProperty(property));
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

  it('applies status and destructive colors from runtime themes', () => {
    applyTheme({
      'rgb-text-destructive': '20 21 22',
      'rgb-border-destructive': '23 24 25',
      'rgb-status-success': '26 27 28',
      'rgb-status-success-subtle': '29 30 31',
      'rgb-status-success-border': '32 33 34',
      'rgb-status-error': '35 36 37',
      'rgb-status-neutral-border': '38 39 40',
    });

    const style = document.documentElement.style;
    expect(style.getPropertyValue('--text-destructive')).toBe('20 21 22');
    expect(style.getPropertyValue('--border-destructive')).toBe('23 24 25');
    expect(style.getPropertyValue('--status-success')).toBe('26 27 28');
    expect(style.getPropertyValue('--status-success-subtle')).toBe('29 30 31');
    expect(style.getPropertyValue('--status-success-border')).toBe('32 33 34');
    expect(style.getPropertyValue('--status-error')).toBe('35 36 37');
    expect(style.getPropertyValue('--status-neutral-border')).toBe('38 39 40');
  });

  it('ships status tokens in the bundled themes', () => {
    applyTheme(defaultTheme);

    expect(document.documentElement.style.getPropertyValue('--status-error')).toBe('220 38 38');
  });
});
