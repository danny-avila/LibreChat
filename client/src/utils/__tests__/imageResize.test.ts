/**
 * Tests for client-side image resizing utility
 */

import {
  resizeImage,
  isAnimatedImage,
  shouldResizeImage,
  supportsClientResize,
} from '../imageResize';

const createChunk = (type: string, data: number[] = []): number[] => [
  0,
  0,
  0,
  data.length,
  ...Array.from(type, (character) => character.charCodeAt(0)),
  ...data,
  0,
  0,
  0,
  0,
];

const createPng = (chunkType: 'acTL' | 'IDAT'): File =>
  new File(
    [
      new Uint8Array([
        137,
        80,
        78,
        71,
        13,
        10,
        26,
        10,
        ...createChunk(chunkType, chunkType === 'acTL' ? [0, 0, 0, 1, 0, 0, 0, 0] : []),
      ]),
    ],
    'image.png',
    { type: 'image/png' },
  );

const createWebP = (flags: number): File =>
  new File(
    [
      new Uint8Array([
        82,
        73,
        70,
        70,
        22,
        0,
        0,
        0,
        87,
        69,
        66,
        80,
        86,
        80,
        56,
        88,
        10,
        0,
        0,
        0,
        flags,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      ]),
    ],
    'image.webp',
    { type: 'image/webp' },
  );

describe('imageResize utility', () => {
  describe('supportsClientResize', () => {
    it('should return true when all required APIs are available', () => {
      const result = supportsClientResize();
      expect(result).toBe(true);
    });

    it('should return false when HTMLCanvasElement is not available', () => {
      const originalCanvas = global.HTMLCanvasElement;
      // @ts-ignore
      delete global.HTMLCanvasElement;

      const result = supportsClientResize();
      expect(result).toBe(false);

      global.HTMLCanvasElement = originalCanvas;
    });
  });

  describe('shouldResizeImage', () => {
    it('should return true for large image files', () => {
      const largeImageFile = new File([''], 'test.jpg', {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });

      // Mock large file size
      Object.defineProperty(largeImageFile, 'size', {
        value: 100 * 1024 * 1024, // 100MB
        writable: false,
      });

      const result = shouldResizeImage(largeImageFile, 50 * 1024 * 1024); // 50MB minimum
      expect(result).toBe(true);
    });

    it('should return false for small image files', () => {
      const smallImageFile = new File([''], 'test.jpg', {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });

      // Mock small file size
      Object.defineProperty(smallImageFile, 'size', {
        value: 1024, // 1KB
        writable: false,
      });

      const result = shouldResizeImage(smallImageFile, 50 * 1024 * 1024); // 50MB minimum
      expect(result).toBe(false);
    });

    it('should return true for an everyday photo using the default minimum', () => {
      const photo = new File([''], 'photo.jpg', {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });

      Object.defineProperty(photo, 'size', { value: 3 * 1024 * 1024, writable: false });

      expect(shouldResizeImage(photo)).toBe(true);
    });

    it('should return false below the default minimum', () => {
      const thumbnail = new File([''], 'thumb.jpg', {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });

      Object.defineProperty(thumbnail, 'size', { value: 100 * 1024, writable: false });

      expect(shouldResizeImage(thumbnail)).toBe(false);
    });

    it('should return false for non-image files', () => {
      const textFile = new File([''], 'test.txt', {
        type: 'text/plain',
        lastModified: Date.now(),
      });

      const result = shouldResizeImage(textFile);
      expect(result).toBe(false);
    });

    it('should return false for GIF files', () => {
      const gifFile = new File([''], 'test.gif', {
        type: 'image/gif',
        lastModified: Date.now(),
      });

      const result = shouldResizeImage(gifFile);
      expect(result).toBe(false);
    });
  });

  describe('isAnimatedImage', () => {
    it('detects APNG content served as image/png', async () => {
      await expect(isAnimatedImage(createPng('acTL'))).resolves.toBe(true);
    });

    it('allows static PNG content', async () => {
      await expect(isAnimatedImage(createPng('IDAT'))).resolves.toBe(false);
    });

    it('detects animated WebP content', async () => {
      await expect(isAnimatedImage(createWebP(0x02))).resolves.toBe(true);
    });

    it('allows static WebP content', async () => {
      await expect(isAnimatedImage(createWebP(0x00))).resolves.toBe(false);
    });
  });

  describe('resizeImage', () => {
    const originalImage = global.Image;
    const originalGetContext = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      'getContext',
    );
    const originalToBlob = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');
    const canvasToBlob = jest.fn();
    const drawImage = jest.fn();

    beforeAll(() => {
      Object.defineProperty(global, 'Image', {
        configurable: true,
        value: class {
          width = 2400;
          height = 1600;
          onload: (() => void) | null = null;
          onerror: (() => void) | null = null;

          set src(_value: string) {
            queueMicrotask(() => this.onload?.());
          }
        },
      });

      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
        configurable: true,
        value: canvasToBlob,
      });
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: () => ({
          drawImage,
          imageSmoothingEnabled: false,
          imageSmoothingQuality: 'low',
        }),
      });
    });

    afterAll(() => {
      Object.defineProperty(global, 'Image', {
        configurable: true,
        value: originalImage,
      });
      if (originalGetContext) {
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', originalGetContext);
      }
      if (originalToBlob) {
        Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', originalToBlob);
      }
    });

    it('does not flatten an animated image', async () => {
      await expect(resizeImage(createPng('acTL'))).rejects.toThrow(
        'Animated images cannot be resized without losing animation',
      );
      expect(drawImage).not.toHaveBeenCalled();
    });

    it('preserves a PNG MIME type while resizing', async () => {
      const file = new File(['source png data'], 'photo.png', { type: 'image/png' });
      canvasToBlob.mockImplementationOnce((callback: BlobCallback, type?: string) => {
        callback(new Blob(['x'], { type }));
      });

      const result = await resizeImage(file);

      expect(canvasToBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', 0.92);
      expect(result.file.name).toBe('photo.png');
      expect(result.file.type).toBe('image/png');
    });

    it('keeps the original file when the resized blob is not smaller', async () => {
      const file = new File(['small'], 'photo.jpg', { type: 'image/jpeg' });
      canvasToBlob.mockImplementationOnce((callback: BlobCallback, type?: string) => {
        callback(new Blob(['larger encoded image'], { type }));
      });

      const result = await resizeImage(file);

      expect(result.file).toBe(file);
      expect(result.newSize).toBe(file.size);
      expect(result.compressionRatio).toBe(1);
    });
  });
});
