import applyTheme from './applyTheme';

const semanticProperties = [
  '--link',
  '--link-hover',
  '--link-visited',
  '--accent-primary',
  '--accent-primary-hover',
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
});
