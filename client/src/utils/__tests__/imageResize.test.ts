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

      const result = shouldResizeImage(largeImageFile, 50 * 1024 * 1024); // 50MB limit
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

      const result = shouldResizeImage(smallImageFile, 50 * 1024 * 1024); // 50MB limit
      expect(result).toBe(false);
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
});
