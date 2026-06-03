import { isImageURL } from '../icons';

describe('isImageURL', () => {
  it.each(['https://example.com/icon.png', 'http://example.com/icon.png', '/assets/icon.svg'])(
    'accepts image URL %s',
    (iconURL) => {
      expect(isImageURL(iconURL)).toBe(true);
    },
  );

  it.each(['openAI', 'anthropic', 'assets/icon.svg', '//example.com/icon.png', '', null])(
    'rejects non-image URL %s',
    (iconURL) => {
      expect(isImageURL(iconURL)).toBe(false);
    },
  );
});
