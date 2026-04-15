import { themeSchema, rgbColorSchema } from './theme';

describe('rgbColorSchema', () => {
  it('accepts valid RGB string', () => {
    expect(rgbColorSchema.parse('128 64 255')).toBe('128 64 255');
  });

  it('rejects out-of-range component', () => {
    expect(() => rgbColorSchema.parse('256 0 0')).toThrow();
  });

  it('rejects empty string', () => {
    expect(() => rgbColorSchema.parse('')).toThrow();
  });

  it('rejects hex format', () => {
    expect(() => rgbColorSchema.parse('#ff00aa')).toThrow();
  });

  it('rejects non-numeric values', () => {
    expect(() => rgbColorSchema.parse('not-a-color')).toThrow();
  });
});

describe('themeSchema', () => {
  it('accepts full light and dark palettes', () => {
    const input = {
      palette: {
        light: { 'surface-primary': '255 255 255', 'text-primary': '26 26 46' },
        dark: { 'surface-primary': '26 26 46', 'text-secondary': '176 176 192' },
      },
    };
    expect(themeSchema.parse(input)).toEqual(input);
  });

  it('accepts partial palette with only light', () => {
    const result = themeSchema.parse({ palette: { light: { 'surface-primary': '200 200 200' } } });
    expect(result.palette?.light).toEqual({ 'surface-primary': '200 200 200' });
    expect(result.palette?.dark).toBeUndefined();
  });

  it('accepts partial palette with only dark', () => {
    const result = themeSchema.parse({ palette: { dark: { 'border-light': '45 45 74' } } });
    expect(result.palette?.dark).toEqual({ 'border-light': '45 45 74' });
    expect(result.palette?.light).toBeUndefined();
  });

  it('rejects invalid RGB in nested palette', () => {
    const input = { palette: { light: { 'surface-primary': '999 0 0' } } };
    expect(() => themeSchema.parse(input)).toThrow(/Must be an RGB color/);
  });

  it('rejects undefined (optionality applied at usage site)', () => {
    expect(() => themeSchema.parse(undefined)).toThrow();
  });
});
