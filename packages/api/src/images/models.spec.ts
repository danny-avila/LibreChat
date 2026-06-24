import { getImageModel, DEFAULT_IMAGE_MODEL_ID, IMAGE_MODELS } from './models';

describe('image models', () => {
  test('default model exists and is in the list', () => {
    expect(IMAGE_MODELS.some((m) => m.id === DEFAULT_IMAGE_MODEL_ID)).toBe(true);
  });
  test('getImageModel returns config', () => {
    expect(getImageModel('gpt-image-2').editImagesKey).toBe('input_urls');
  });
  test('getImageModel throws on unknown', () => {
    expect(() => getImageModel('nope')).toThrow('Unknown image model');
  });
});
