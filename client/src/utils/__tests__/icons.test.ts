import { isImageURL, isSvgIcon } from '../icons';

describe('isImageURL', () => {
  it.each([
    'https://example.com/icon.png',
    'http://example.com/icon.png',
    '//cdn.example.com/provider.png',
    '/assets/icon.svg',
    'assets/company.png',
    'assets/icon.svg',
    'assets/company.svg#mark',
    'assets/provider.avif',
    'assets/provider.apng',
    'assets/provider.bmp',
    'assets/provider.jfif',
    'data:image/png;base64,iVBORw0KGgo=',
  ])('accepts image URL %s', (iconURL) => {
    expect(isImageURL(iconURL)).toBe(true);
  });

  it.each(['openAI', 'anthropic', '//', '///icon.png', '', null])(
    'rejects non-image URL %s',
    (iconURL) => {
      expect(isImageURL(iconURL)).toBe(false);
    },
  );
});

describe('isSvgIcon', () => {
  it.each([
    'https://example.com/icon.svg',
    '/assets/icon.svg',
    '/assets/icon.SVG',
    'https://example.com/icon.svg?v=2',
    'https://example.com/icon.svg#hash',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/svg+xml,%3Csvg%3E%3C/svg%3E',
  ])('accepts SVG icon %s', (iconURL) => {
    expect(isSvgIcon(iconURL)).toBe(true);
  });

  it.each([
    'https://example.com/icon.png',
    '/assets/icon.jpg',
    'data:image/png;base64,abc',
    'https://example.com/svg-logo.png',
    '',
    null,
    undefined,
  ])('rejects non-SVG icon %s', (iconURL) => {
    expect(isSvgIcon(iconURL)).toBe(false);
  });
});
