/**
 * Unit tests for file helper functions
 * Tests MIME type detection and file type utilities
 */

const { isBinaryFile } = require('../fileHandlers');
const { getMimeTypeFromExtension } = require('../fileSaver');

describe('fileHelpers', () => {
  describe('isBinaryFile', () => {
    describe('Binary types (should return true)', () => {
      it('should detect images as binary', () => {
        expect(isBinaryFile('image/png')).toBe(true);
        expect(isBinaryFile('image/jpeg')).toBe(true);
        expect(isBinaryFile('image/gif')).toBe(true);
        expect(isBinaryFile('image/webp')).toBe(true);
        expect(isBinaryFile('image/svg+xml')).toBe(true);
      });

      it('should detect application files as binary', () => {
        expect(isBinaryFile('application/pdf')).toBe(true);
        expect(isBinaryFile('application/zip')).toBe(true);
        expect(isBinaryFile('application/octet-stream')).toBe(true);
        expect(isBinaryFile('application/vnd.ms-excel')).toBe(true);
      });

      it('should detect audio as binary', () => {
        expect(isBinaryFile('audio/mpeg')).toBe(true);
        expect(isBinaryFile('audio/wav')).toBe(true);
        expect(isBinaryFile('audio/ogg')).toBe(true);
      });

      it('should detect video as binary', () => {
        expect(isBinaryFile('video/mp4')).toBe(true);
        expect(isBinaryFile('video/webm')).toBe(true);
        expect(isBinaryFile('video/quicktime')).toBe(true);
      });

      it('should detect fonts as binary', () => {
        expect(isBinaryFile('font/woff')).toBe(true);
        expect(isBinaryFile('font/woff2')).toBe(true);
        expect(isBinaryFile('font/ttf')).toBe(true);
      });
    });

    describe('Text types (should return false)', () => {
      it('should detect text files as non-binary', () => {
        expect(isBinaryFile('text/plain')).toBe(false);
        expect(isBinaryFile('text/html')).toBe(false);
        expect(isBinaryFile('text/css')).toBe(false);
        expect(isBinaryFile('text/csv')).toBe(false);
        expect(isBinaryFile('text/markdown')).toBe(false);
      });

      it('should detect JSON as non-binary', () => {
        expect(isBinaryFile('application/json')).toBe(false);
      });

      it('should detect XML as non-binary', () => {
        expect(isBinaryFile('application/xml')).toBe(false);
        expect(isBinaryFile('text/xml')).toBe(false);
      });

      it('should detect JavaScript as non-binary', () => {
        expect(isBinaryFile('application/javascript')).toBe(false);
        expect(isBinaryFile('text/javascript')).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should handle null/undefined', () => {
        expect(isBinaryFile(null)).toBe(false);
        expect(isBinaryFile(undefined)).toBe(false);
      });

      it('should handle empty string', () => {
        expect(isBinaryFile('')).toBe(false);
      });

      it('should handle unknown MIME types (default to false)', () => {
        expect(isBinaryFile('unknown/type')).toBe(false);
        expect(isBinaryFile('custom/mimetype')).toBe(false);
      });

      it('should handle MIME types with parameters', () => {
        expect(isBinaryFile('text/plain; charset=utf-8')).toBe(false);
        expect(isBinaryFile('image/png; quality=high')).toBe(true);
      });

      it('should be case-sensitive (as per implementation)', () => {
        // Implementation uses startsWith, which is case-sensitive
        expect(isBinaryFile('IMAGE/PNG')).toBe(false);
        expect(isBinaryFile('TEXT/PLAIN')).toBe(false);
      });
    });
  });

  describe('getMimeTypeFromExtension', () => {
    describe('Image types', () => {
      it('should map image extensions correctly', () => {
        expect(getMimeTypeFromExtension('.png')).toBe('image/png');
        expect(getMimeTypeFromExtension('.jpg')).toBe('image/jpeg');
        expect(getMimeTypeFromExtension('.jpeg')).toBe('image/jpeg');
        expect(getMimeTypeFromExtension('.gif')).toBe('image/gif');
        expect(getMimeTypeFromExtension('.svg')).toBe('image/svg+xml');
        expect(getMimeTypeFromExtension('.webp')).toBe('image/webp');
        expect(getMimeTypeFromExtension('.bmp')).toBe('image/bmp');
        expect(getMimeTypeFromExtension('.ico')).toBe('image/x-icon');
      });
    });

    describe('Document types', () => {
      it('should map document extensions correctly', () => {
        expect(getMimeTypeFromExtension('.pdf')).toBe('application/pdf');
        expect(getMimeTypeFromExtension('.doc')).toBe('application/msword');
        expect(getMimeTypeFromExtension('.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        expect(getMimeTypeFromExtension('.xls')).toBe('application/vnd.ms-excel');
        expect(getMimeTypeFromExtension('.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        expect(getMimeTypeFromExtension('.ppt')).toBe('application/vnd.ms-powerpoint');
        expect(getMimeTypeFromExtension('.pptx')).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
      });
    });

    describe('Data format types', () => {
      it('should map data format extensions correctly', () => {
        expect(getMimeTypeFromExtension('.csv')).toBe('text/csv');
        expect(getMimeTypeFromExtension('.json')).toBe('application/json');
        expect(getMimeTypeFromExtension('.xml')).toBe('application/xml');
        expect(getMimeTypeFromExtension('.txt')).toBe('text/plain');
        expect(getMimeTypeFromExtension('.md')).toBe('text/markdown');
      });
    });

    describe('Web types', () => {
      it('should map web file extensions correctly', () => {
        expect(getMimeTypeFromExtension('.html')).toBe('text/html');
        expect(getMimeTypeFromExtension('.css')).toBe('text/css');
        expect(getMimeTypeFromExtension('.js')).toBe('application/javascript');
        expect(getMimeTypeFromExtension('.ts')).toBe('application/typescript');
      });
    });

    describe('Archive types', () => {
      it('should map archive extensions correctly', () => {
        expect(getMimeTypeFromExtension('.zip')).toBe('application/zip');
        expect(getMimeTypeFromExtension('.tar')).toBe('application/x-tar');
        expect(getMimeTypeFromExtension('.gz')).toBe('application/gzip');
      });
    });

    describe('Media types', () => {
      it('should map audio/video extensions correctly', () => {
        expect(getMimeTypeFromExtension('.mp3')).toBe('audio/mpeg');
        expect(getMimeTypeFromExtension('.mp4')).toBe('video/mp4');
        expect(getMimeTypeFromExtension('.wav')).toBe('audio/wav');
      });
    });

    describe('Edge cases', () => {
      it('should handle uppercase extensions', () => {
        expect(getMimeTypeFromExtension('.PNG')).toBe('image/png');
        expect(getMimeTypeFromExtension('.TXT')).toBe('text/plain');
        expect(getMimeTypeFromExtension('.CSV')).toBe('text/csv');
      });

      it('should handle mixed case extensions', () => {
        expect(getMimeTypeFromExtension('.PnG')).toBe('image/png');
        expect(getMimeTypeFromExtension('.JpEg')).toBe('image/jpeg');
      });

      it('should handle extensions without leading dot', () => {
        // Based on implementation, it expects a dot, so these should fail
        expect(getMimeTypeFromExtension('png')).toBe('application/octet-stream');
        expect(getMimeTypeFromExtension('txt')).toBe('application/octet-stream');
      });

      it('should return default for unknown extensions', () => {
        expect(getMimeTypeFromExtension('.unknown')).toBe('application/octet-stream');
        expect(getMimeTypeFromExtension('.xyz')).toBe('application/octet-stream');
        expect(getMimeTypeFromExtension('.custom')).toBe('application/octet-stream');
      });

      it('should handle empty string', () => {
        expect(getMimeTypeFromExtension('')).toBe('application/octet-stream');
      });

      it('should handle just a dot', () => {
        expect(getMimeTypeFromExtension('.')).toBe('application/octet-stream');
      });

      it('should handle multiple dots in extension', () => {
        expect(getMimeTypeFromExtension('.tar.gz')).toBe('application/octet-stream');
      });
    });

    describe('Common file scenarios', () => {
      it('should correctly identify common code files', () => {
        expect(getMimeTypeFromExtension('.py')).toBe('application/octet-stream'); // Not in the map
        expect(getMimeTypeFromExtension('.js')).toBe('application/javascript');
        expect(getMimeTypeFromExtension('.ts')).toBe('application/typescript');
      });

      it('should correctly identify configuration files', () => {
        expect(getMimeTypeFromExtension('.json')).toBe('application/json');
        expect(getMimeTypeFromExtension('.xml')).toBe('application/xml');
      });

      it('should correctly identify spreadsheets', () => {
        expect(getMimeTypeFromExtension('.csv')).toBe('text/csv');
        expect(getMimeTypeFromExtension('.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      });
    });
  });

  describe('Integration between isBinaryFile and getMimeTypeFromExtension', () => {
    it('should correctly classify files by extension and MIME type', () => {
      // Get MIME type from extension, then check if binary
      const pngMime = getMimeTypeFromExtension('.png');
      expect(isBinaryFile(pngMime)).toBe(true);

      const txtMime = getMimeTypeFromExtension('.txt');
      expect(isBinaryFile(txtMime)).toBe(false);

      const csvMime = getMimeTypeFromExtension('.csv');
      expect(isBinaryFile(csvMime)).toBe(false);

      const pdfMime = getMimeTypeFromExtension('.pdf');
      expect(isBinaryFile(pdfMime)).toBe(true);

      const jsonMime = getMimeTypeFromExtension('.json');
      expect(isBinaryFile(jsonMime)).toBe(false);
    });

    it('should handle common workflow: extension -> MIME -> binary check', () => {
      const testCases = [
        { ext: '.png', shouldBeBinary: true },
        { ext: '.jpg', shouldBeBinary: true },
        { ext: '.txt', shouldBeBinary: false },
        { ext: '.csv', shouldBeBinary: false },
        { ext: '.json', shouldBeBinary: false },
        { ext: '.pdf', shouldBeBinary: true },
        { ext: '.xlsx', shouldBeBinary: true },
        { ext: '.html', shouldBeBinary: false },
      ];

      testCases.forEach(({ ext, shouldBeBinary }) => {
        const mimeType = getMimeTypeFromExtension(ext);
        const isBinary = isBinaryFile(mimeType);
        expect(isBinary).toBe(shouldBeBinary);
      });
    });
  });
});

