import { isImageURL } from '../icons';

describe('isImageURL', () => {
  it.each([
    'https://example.com/icon.png',
    'http://example.com/icon.png',
    '/assets/icon.svg',
    'assets/company.png',
    'assets/icon.svg',
    'data:image/png;base64,iVBORw0KGgo=',
  ])('accepts image URL %s', (iconURL) => {
    expect(isImageURL(iconURL)).toBe(true);
  });

  it.each(['openAI', 'anthropic', '//example.com/icon.png', '', null])(
    'rejects non-image URL %s',
    (iconURL) => {
      expect(isImageURL(iconURL)).toBe(false);
    },
  );
});
