import { isImageURL } from '../icons';

describe('isImageURL', () => {
  it.each([
    'https://example.com/icon.png',
    'http://example.com/icon.png',
    '//cdn.example.com/provider.png',
    '/assets/icon.svg',
    'assets/company.png',
    'assets/icon.svg',
    'assets/company.svg#mark',
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
