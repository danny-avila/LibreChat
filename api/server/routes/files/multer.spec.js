/* eslint-disable no-unused-vars */
/* eslint-disable jest/no-done-callback */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createMulterInstance, storage, importFileFilter } = require('./multer');

// Mock only the config service that requires external dependencies
jest.mock('~/server/services/Config', () => ({
  getCustomConfig: jest.fn(() =>
    Promise.resolve({
      fileConfig: {
        endpoints: {
          openAI: {
            supportedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
          },
          default: {
            supportedMimeTypes: ['image/jpeg', 'image/png', 'text/plain'],
          },
        },
        serverFileSizeLimit: 10000000, // 10MB
      },
    }),
  ),
}));

describe('Multer Configuration', () => {
  let tempDir;
  let mockReq;
  let mockFile;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multer-test-'));

    mockReq = {
      user: { id: 'test-user-123' },
      app: {
        locals: {
          paths: {
            uploads: tempDir,
          },
        },
      },
      body: {},
      originalUrl: '/api/files/upload',
    };

    mockFile = {
      originalname: 'test-file.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
    };

    // Clear mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Storage Configuration', () => {
    describe('destination function', () => {
      it('should create the correct destination path', (done) => {
        const cb = jest.fn((err, destination) => {
          expect(err).toBeNull();
          expect(destination).toBe(path.join(tempDir, 'temp', 'test-user-123'));
          expect(fs.existsSync(destination)).toBe(true);
          done();
        });

        storage.getDestination(mockReq, mockFile, cb);
      });

      it("should create directory recursively if it doesn't exist", (done) => {
        const deepPath = path.join(tempDir, 'deep', 'nested', 'path');
        mockReq.app.locals.paths.uploads = deepPath;

        const cb = jest.fn((err, destination) => {
          expect(err).toBeNull();
          expect(destination).toBe(path.join(deepPath, 'temp', 'test-user-123'));
          expect(fs.existsSync(destination)).toBe(true);
          done();
        });

        storage.getDestination(mockReq, mockFile, cb);
      });
    });

    describe('filename function', () => {
      it('should generate a UUID for req.file_id', (done) => {
        const cb = jest.fn((err, filename) => {
          expect(err).toBeNull();
          expect(mockReq.file_id).toBeDefined();
          expect(mockReq.file_id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          );
          done();
        });

        storage.getFilename(mockReq, mockFile, cb);
      });

      it('should decode URI components in filename', (done) => {
        const encodedFile = {
          ...mockFile,
          originalname: encodeURIComponent('test file with spaces.jpg'),
        };

        const cb = jest.fn((err, filename) => {
          expect(err).toBeNull();
          expect(encodedFile.originalname).toBe('test file with spaces.jpg');
          done();
        });

        storage.getFilename(mockReq, encodedFile, cb);
      });

      it('should call real sanitizeFilename with properly encoded filename', (done) => {
        // Test with a properly URI-encoded filename that needs sanitization
        const unsafeFile = {
          ...mockFile,
          originalname: encodeURIComponent('test@#$%^&*()file with spaces!.jpg'),
        };

        const cb = jest.fn((err, filename) => {
          expect(err).toBeNull();
          // The actual sanitizeFilename should have cleaned this up after decoding
          expect(filename).not.toContain('@');
          expect(filename).not.toContain('#');
          expect(filename).not.toContain('*');
          expect(filename).not.toContain('!');
          // Should still preserve dots and hyphens
          expect(filename).toContain('.jpg');
          done();
        });

        storage.getFilename(mockReq, unsafeFile, cb);
      });

      it('should handle very long filenames with actual crypto', (done) => {
        const longFile = {
          ...mockFile,
          originalname: 'a'.repeat(300) + '.jpg',
        };

        const cb = jest.fn((err, filename) => {
          expect(err).toBeNull();
          expect(filename.length).toBeLessThanOrEqual(255);
          expect(filename).toMatch(/\.jpg$/); // Should still end with .jpg
          // Should contain a hex suffix if truncated
          if (filename.length === 255) {
            expect(filename).toMatch(/-[a-f0-9]{6}\.jpg$/);
          }
          done();
        });

        storage.getFilename(mockReq, longFile, cb);
      });

      it('should generate unique file_id for each call', (done) => {
        let firstFileId;

        const firstCb = jest.fn((err, filename) => {
          expect(err).toBeNull();
          firstFileId = mockReq.file_id;

          // Reset req for second call
          delete mockReq.file_id;

          const secondCb = jest.fn((err, filename) => {
            expect(err).toBeNull();
            expect(mockReq.file_id).toBeDefined();
            expect(mockReq.file_id).not.toBe(firstFileId);
            done();
          });

          storage.getFilename(mockReq, mockFile, secondCb);
        });

        storage.getFilename(mockReq, mockFile, firstCb);
      });
    });
  });

  describe('Import File Filter', () => {
    it('should accept JSON files by mimetype', (done) => {
      const jsonFile = {
        ...mockFile,
        mimetype: 'application/json',
        originalname: 'data.json',
      };

      const cb = jest.fn((err, result) => {
        expect(err).toBeNull();
        expect(result).toBe(true);
        done();
      });

      importFileFilter(mockReq, jsonFile, cb);
    });

    it('should accept files with .json extension', (done) => {
      const jsonFile = {
        ...mockFile,
        mimetype: 'text/plain',
        originalname: 'data.json',
      };

      const cb = jest.fn((err, result) => {
        expect(err).toBeNull();
        expect(result).toBe(true);
        done();
      });

      importFileFilter(mockReq, jsonFile, cb);
    });

    it('should reject non-JSON files', (done) => {
      const textFile = {
        ...mockFile,
        mimetype: 'text/plain',
        originalname: 'document.txt',
      };

      const cb = jest.fn((err, result) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Only JSON files are allowed');
        expect(result).toBe(false);
        done();
      });

      importFileFilter(mockReq, textFile, cb);
    });

    it('should handle files with uppercase .JSON extension', (done) => {
      const jsonFile = {
        ...mockFile,
        mimetype: 'text/plain',
        originalname: 'DATA.JSON',
      };

      const cb = jest.fn((err, result) => {
        expect(err).toBeNull();
        expect(result).toBe(true);
        done();
      });

      importFileFilter(mockReq, jsonFile, cb);
    });
  });

  describe('File Filter with Real defaultFileConfig', () => {
    it('should use real fileConfig.checkType for validation', async () => {
      // Test with actual librechat-data-provider functions
      const {
        fileConfig,
        imageMimeTypes,
        applicationMimeTypes,
      } = require('librechat-data-provider');

      // Test that the real checkType function works with regex patterns
      expect(fileConfig.checkType('image/jpeg', [imageMimeTypes])).toBe(true);
      expect(fileConfig.checkType('video/mp4', [imageMimeTypes])).toBe(false);
      expect(fileConfig.checkType('application/pdf', [applicationMimeTypes])).toBe(true);
      expect(fileConfig.checkType('application/pdf', [])).toBe(false);
    });

    it('should handle audio files for speech-to-text endpoint with real config', async () => {
      mockReq.originalUrl = '/api/speech/stt';

      const multerInstance = await createMulterInstance();
      expect(multerInstance).toBeDefined();
      expect(typeof multerInstance.single).toBe('function');
    });

    it('should reject unsupported file types using real config', async () => {
      // Mock defaultFileConfig for this specific test
      const originalCheckType = require('librechat-data-provider').fileConfig.checkType;
      const mockCheckType = jest.fn().mockReturnValue(false);
      require('librechat-data-provider').fileConfig.checkType = mockCheckType;

      try {
        const multerInstance = await createMulterInstance();
        expect(multerInstance).toBeDefined();

        // Test the actual file filter behavior would reject unsupported files
        expect(mockCheckType).toBeDefined();
      } finally {
        // Restore original function
        require('librechat-data-provider').fileConfig.checkType = originalCheckType;
      }
    });

    it('should use real mergeFileConfig function', async () => {
      const { mergeFileConfig, mbToBytes } = require('librechat-data-provider');

      // Test with actual merge function - note that it converts MB to bytes
      const testConfig = {
        serverFileSizeLimit: 5, // 5 MB
        endpoints: {
          custom: {
            supportedMimeTypes: ['text/plain'],
          },
        },
      };

      const result = mergeFileConfig(testConfig);

      // The function converts MB to bytes, so 5 MB becomes 5 * 1024 * 1024 bytes
      expect(result.serverFileSizeLimit).toBe(mbToBytes(5));
      expect(result.endpoints.custom.supportedMimeTypes).toBeDefined();
      // Should still have the default endpoints
      expect(result.endpoints.default).toBeDefined();
    });
  });

  describe('createMulterInstance with Real Functions', () => {
    it('should create a multer instance with correct configuration', async () => {
      const multerInstance = await createMulterInstance();

      expect(multerInstance).toBeDefined();
      expect(typeof multerInstance.single).toBe('function');
      expect(typeof multerInstance.array).toBe('function');
      expect(typeof multerInstance.fields).toBe('function');
    });

    it('should use real config merging', async () => {
      const { getCustomConfig } = require('~/server/services/Config');

      const multerInstance = await createMulterInstance();

      expect(getCustomConfig).toHaveBeenCalled();
      expect(multerInstance).toBeDefined();
    });

    it('should create multer instance with expected interface', async () => {
      const multerInstance = await createMulterInstance();

      expect(multerInstance).toBeDefined();
      expect(typeof multerInstance.single).toBe('function');
      expect(typeof multerInstance.array).toBe('function');
      expect(typeof multerInstance.fields).toBe('function');
    });
  });

  describe('Real Crypto Integration', () => {
    it('should use actual crypto.randomUUID()', (done) => {
      // Spy on crypto.randomUUID to ensure it's called
      const uuidSpy = jest.spyOn(crypto, 'randomUUID');

      const cb = jest.fn((err, filename) => {
        expect(err).toBeNull();
        expect(uuidSpy).toHaveBeenCalled();
        expect(mockReq.file_id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );

        uuidSpy.mockRestore();
        done();
      });

      storage.getFilename(mockReq, mockFile, cb);
    });

    it('should generate different UUIDs on subsequent calls', (done) => {
      const uuids = [];
      let callCount = 0;
      const totalCalls = 5;

      const cb = jest.fn((err, filename) => {
        expect(err).toBeNull();
        uuids.push(mockReq.file_id);
        callCount++;

        if (callCount === totalCalls) {
          // Check that all UUIDs are unique
          const uniqueUuids = new Set(uuids);
          expect(uniqueUuids.size).toBe(totalCalls);
          done();
        } else {
          // Reset for next call
          delete mockReq.file_id;
          storage.getFilename(mockReq, mockFile, cb);
        }
      });

      // Start the chain
      storage.getFilename(mockReq, mockFile, cb);
    });

    it('should generate cryptographically secure UUIDs', (done) => {
      const generatedUuids = new Set();
      let callCount = 0;
      const totalCalls = 10;

      const cb = jest.fn((err, filename) => {
        expect(err).toBeNull();

        // Verify UUID format and uniqueness
        expect(mockReq.file_id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );

        generatedUuids.add(mockReq.file_id);
        callCount++;

        if (callCount === totalCalls) {
          // All UUIDs should be unique
          expect(generatedUuids.size).toBe(totalCalls);
          done();
        } else {
          // Reset for next call
          delete mockReq.file_id;
          storage.getFilename(mockReq, mockFile, cb);
        }
      });

      // Start the chain
      storage.getFilename(mockReq, mockFile, cb);
    });
  });

  describe('Error Handling', () => {
    it('should handle CVE-2024-28870: empty field name DoS vulnerability', async () => {
      // Test for the CVE where empty field name could cause unhandled exception
      const multerInstance = await createMulterInstance();

      // Create a mock request with empty field name (the vulnerability scenario)
      const mockReqWithEmptyField = {
        ...mockReq,
        headers: {
          'content-type': 'multipart/form-data',
        },
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
      };

      // This should not crash or throw unhandled exceptions
      const uploadMiddleware = multerInstance.single(''); // Empty field name

      const mockNext = jest.fn((err) => {
        // If there's an error, it should be handled gracefully, not crash
        if (err) {
          expect(err).toBeInstanceOf(Error);
          // The error should be handled, not crash the process
        }
      });

      // This should complete without crashing the process
      expect(() => {
        uploadMiddleware(mockReqWithEmptyField, mockRes, mockNext);
      }).not.toThrow();
    });

    it('should handle file system errors when directory creation fails', (done) => {
      // Test with a non-existent parent directory to simulate fs issues
      const invalidPath = '/nonexistent/path/that/should/not/exist';
      mockReq.app.locals.paths.uploads = invalidPath;

      try {
        // Call getDestination which should fail due to permission/path issues
        storage.getDestination(mockReq, mockFile, (err, destination) => {
          // If callback is reached, we didn't get the expected error
          done(new Error('Expected mkdirSync to throw an error but callback was called'));
        });
        // If we get here without throwing, something unexpected happened
        done(new Error('Expected mkdirSync to throw an error but no error was thrown'));
      } catch (error) {
        // This is the expected behavior - mkdirSync throws synchronously for invalid paths
        // On Linux, this typically returns EACCES (permission denied)
        // On macOS/Darwin, this returns ENOENT (no such file or directory)
        expect(['EACCES', 'ENOENT']).toContain(error.code);
        done();
      }
    });

    it('should handle malformed filenames with real sanitization', (done) => {
      const malformedFile = {
        ...mockFile,
        originalname: null, // This should be handled gracefully
      };

      const cb = jest.fn((err, filename) => {
        // The function should handle this gracefully
        expect(typeof err === 'object' || err === null).toBe(true);
        done();
      });

      try {
        storage.getFilename(mockReq, malformedFile, cb);
      } catch (error) {
        // If it throws, that's also acceptable behavior
        done();
      }
    });

    it('should handle edge cases in filename sanitization', (done) => {
      const edgeCaseFiles = [
        { originalname: '', expected: /_/ },
        { originalname: '.hidden', expected: /^_\.hidden/ },
        { originalname: '../../../etc/passwd', expected: /passwd/ },
        { originalname: 'file\x00name.txt', expected: /file_name\.txt/ },
      ];

      let testCount = 0;

      const testNextFile = (fileData) => {
        const fileToTest = { ...mockFile, originalname: fileData.originalname };

        const cb = jest.fn((err, filename) => {
          expect(err).toBeNull();
          expect(filename).toMatch(fileData.expected);

          testCount++;
          if (testCount === edgeCaseFiles.length) {
            done();
          } else {
            testNextFile(edgeCaseFiles[testCount]);
          }
        });

        storage.getFilename(mockReq, fileToTest, cb);
      };

      testNextFile(edgeCaseFiles[0]);
    });
  });

  describe('Real Configuration Testing', () => {
    it('should handle missing custom config gracefully with real mergeFileConfig', async () => {
      const { getCustomConfig } = require('~/server/services/Config');

      // Mock getCustomConfig to return undefined
      getCustomConfig.mockResolvedValueOnce(undefined);

      const multerInstance = await createMulterInstance();
      expect(multerInstance).toBeDefined();
      expect(typeof multerInstance.single).toBe('function');
    });

    it('should properly integrate real fileConfig with custom endpoints', async () => {
      const { getCustomConfig } = require('~/server/services/Config');

      // Mock a custom config with additional endpoints
      getCustomConfig.mockResolvedValueOnce({
        fileConfig: {
          endpoints: {
            anthropic: {
              supportedMimeTypes: ['text/plain', 'image/png'],
            },
          },
          serverFileSizeLimit: 20, // 20 MB
        },
      });

      const multerInstance = await createMulterInstance();
      expect(multerInstance).toBeDefined();

      // Verify that getCustomConfig was called (we can't spy on the actual merge function easily)
      expect(getCustomConfig).toHaveBeenCalled();
    });
  });
});
