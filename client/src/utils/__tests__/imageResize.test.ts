/**
 * Tests for client-side image resizing utility
 */

import { shouldResizeImage, supportsClientResize } from '../imageResize';

// Mock browser APIs for testing
Object.defineProperty(global, 'HTMLCanvasElement', {
  value: function () {
    return {
      getContext: () => ({
        drawImage: jest.fn(),
      }),
      toBlob: jest.fn(),
    };
  },
  writable: true,
});

Object.defineProperty(global, 'FileReader', {
  value: function () {
    return {
      readAsDataURL: jest.fn(),
    };
  },
  writable: true,
});

Object.defineProperty(global, 'Image', {
  value: function () {
    return {};
  },
  writable: true,
});

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
    const makeImage = (size: number, type = 'image/jpeg', name = 'test.jpg') => {
      const file = new File([''], name, { type, lastModified: Date.now() });
      Object.defineProperty(file, 'size', { value: size, writable: false });
      return file;
    };

    it('returns true when image size is above the threshold', () => {
      const file = makeImage(5 * 1024 * 1024);
      expect(shouldResizeImage(file, 1024 * 1024)).toBe(true);
    });

    it('returns false when image size is below the threshold', () => {
      const file = makeImage(100 * 1024);
      expect(shouldResizeImage(file, 1024 * 1024)).toBe(false);
    });

    it('returns true when image size equals the threshold (strict-less-than boundary)', () => {
      const threshold = 1024 * 1024;
      const file = makeImage(threshold);
      expect(shouldResizeImage(file, threshold)).toBe(true);
    });

    it('returns false when image size is one byte below the threshold', () => {
      const threshold = 1024 * 1024;
      const file = makeImage(threshold - 1);
      expect(shouldResizeImage(file, threshold)).toBe(false);
    });

    it('treats a 150KB image as below the 1MB threshold (regression for clientImageResize fix)', () => {
      const file = makeImage(150 * 1024);
      expect(shouldResizeImage(file, 1024 * 1024)).toBe(false);
    });

    it('uses a 1MB default threshold when minSizeBytes is omitted', () => {
      const belowDefault = makeImage(512 * 1024);
      const aboveDefault = makeImage(2 * 1024 * 1024);
      expect(shouldResizeImage(belowDefault)).toBe(false);
      expect(shouldResizeImage(aboveDefault)).toBe(true);
    });

    it('allows disabling the size gate with minSizeBytes of 0', () => {
      const tinyImage = makeImage(1);
      expect(shouldResizeImage(tinyImage, 0)).toBe(true);
    });

    it('returns false for non-image files', () => {
      const textFile = new File([''], 'test.txt', {
        type: 'text/plain',
        lastModified: Date.now(),
      });
      Object.defineProperty(textFile, 'size', { value: 5 * 1024 * 1024, writable: false });
      expect(shouldResizeImage(textFile, 1024 * 1024)).toBe(false);
    });

    it('returns false for GIF files even when above the threshold', () => {
      const gifFile = makeImage(5 * 1024 * 1024, 'image/gif', 'test.gif');
      expect(shouldResizeImage(gifFile, 1024 * 1024)).toBe(false);
    });
  });
});
