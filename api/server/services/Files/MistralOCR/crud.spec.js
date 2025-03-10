const fs = require('fs');

const mockAxios = {
  interceptors: {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() },
  },
  create: jest.fn().mockReturnValue({
    defaults: {
      proxy: null,
    },
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  }),
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
  put: jest.fn().mockResolvedValue({ data: {} }),
  delete: jest.fn().mockResolvedValue({ data: {} }),
  reset: jest.fn().mockImplementation(function () {
    this.get.mockClear();
    this.post.mockClear();
    this.put.mockClear();
    this.delete.mockClear();
    this.create.mockClear();
  }),
};

jest.mock('axios', () => mockAxios);
jest.mock('fs');
jest.mock('~/utils', () => ({
  logAxiosError: jest.fn(),
}));
jest.mock('~/config', () => ({
  logger: {
    error: jest.fn(),
  },
  createAxiosInstance: () => mockAxios,
}));
jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

const { uploadDocumentToMistral, uploadMistralOCR, getSignedUrl, performOCR } = require('./crud');

describe('MistralOCR Service', () => {
  afterEach(() => {
    mockAxios.reset();
    jest.clearAllMocks();
  });

  describe('uploadDocumentToMistral', () => {
    it('should upload a document to Mistral API', async () => {
      const mockResponse = { data: { id: 'file-123', purpose: 'ocr' } };
      mockAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await uploadDocumentToMistral({
        buffer: Buffer.from('test file content'),
        fileName: 'test.pdf',
        apiKey: 'test-api-key',
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/files',
        expect.any(Object), // FormData
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        }),
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle errors during document upload', async () => {
      const errorMessage = 'API error';
      mockAxios.post.mockRejectedValueOnce(new Error(errorMessage));

      await expect(
        uploadDocumentToMistral({
          buffer: Buffer.from('test content'),
          fileName: 'test.pdf',
          apiKey: 'test-api-key',
        }),
      ).rejects.toThrow();

      const { logger } = require('~/config');
      expect(logger.error).toHaveBeenCalledWith(
        'Error uploading document to Mistral:',
        errorMessage,
      );
    });
  });

  describe('getSignedUrl', () => {
    it('should fetch signed URL from Mistral API', async () => {
      const mockResponse = { data: { url: 'https://document-url.com' } };
      mockAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await getSignedUrl({
        fileId: 'file-123',
        apiKey: 'test-api-key',
      });

      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/files/file-123/url?expiry=24',
        {
          headers: {
            Authorization: 'Bearer test-api-key',
          },
        },
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle errors when fetching signed URL', async () => {
      const errorMessage = 'API error';
      mockAxios.get.mockRejectedValueOnce(new Error(errorMessage));

      await expect(
        getSignedUrl({
          fileId: 'file-123',
          apiKey: 'test-api-key',
        }),
      ).rejects.toThrow();

      const { logger } = require('~/config');
      expect(logger.error).toHaveBeenCalledWith('Error fetching signed URL:', errorMessage);
    });
  });

  describe('performOCR', () => {
    it('should perform OCR using Mistral API', async () => {
      const mockResponse = {
        data: {
          pages: [{ markdown: 'Page 1 content' }, { markdown: 'Page 2 content' }],
        },
      };
      mockAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await performOCR({
        apiKey: 'test-api-key',
        documentUrl: 'https://document-url.com',
        model: 'mistral-ocr-latest',
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/ocr',
        {
          model: 'mistral-ocr-latest',
          include_image_base64: false,
          document: {
            type: 'document_url',
            document_url: 'https://document-url.com',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
          },
        },
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle errors during OCR processing', async () => {
      const errorMessage = 'OCR processing error';
      mockAxios.post.mockRejectedValueOnce(new Error(errorMessage));

      await expect(
        performOCR({
          apiKey: 'test-api-key',
          documentUrl: 'https://document-url.com',
        }),
      ).rejects.toThrow();

      const { logger } = require('~/config');
      expect(logger.error).toHaveBeenCalledWith('Error performing OCR:', errorMessage);
    });
  });

  describe('uploadMistralOCR', () => {
    beforeEach(() => {
      fs.readFileSync.mockReturnValue(Buffer.from('file content'));
    });

    it('should process OCR for a file with standard configuration', async () => {
      // Setup mocks
      const { loadAuthValues } = require('~/server/services/Tools/credentials');
      loadAuthValues.mockResolvedValue({
        OCR_API_KEY: 'test-api-key',
        OCR_BASEURL: 'https://api.mistral.ai/v1',
      });

      // Mock file upload response
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'file-123', purpose: 'ocr' },
      });

      // Mock signed URL response
      mockAxios.get.mockResolvedValueOnce({
        data: { url: 'https://signed-url.com' },
      });

      // Mock OCR response with text and images
      mockAxios.post.mockResolvedValueOnce({
        data: {
          pages: [
            {
              markdown: 'Page 1 content',
              images: [{ image_base64: 'base64image1' }],
            },
            {
              markdown: 'Page 2 content',
              images: [{ image_base64: 'base64image2' }],
            },
          ],
        },
      });

      const req = {
        user: { id: 'user123' },
        app: {
          locals: {
            ocr: {
              // Use environment variable syntax to ensure loadAuthValues is called
              apiKey: '${OCR_API_KEY}',
              baseURL: '${OCR_BASEURL}',
              mistralModel: 'mistral-medium',
            },
          },
        },
      };

      const file = {
        path: '/tmp/upload/file.pdf',
        originalname: 'document.pdf',
      };

      const result = await uploadMistralOCR({
        req,
        file,
        file_id: 'file123',
        entity_id: 'entity123',
      });

      expect(loadAuthValues).toHaveBeenCalledWith({
        userId: 'user123',
        authFields: ['OCR_BASEURL', 'OCR_API_KEY'],
        optional: expect.any(Set),
      });

      // Verify OCR result
      expect(result).toEqual({
        filename: 'document.pdf',
        bytes: expect.any(Number),
        filepath: 'mistral_ocr',
        text: expect.stringContaining('# PAGE 1'),
        images: ['base64image1', 'base64image2'],
      });
    });

    it('should process variable references in configuration', async () => {
      // Setup mocks with environment variables
      const { loadAuthValues } = require('~/server/services/Tools/credentials');
      loadAuthValues.mockResolvedValue({
        CUSTOM_API_KEY: 'custom-api-key',
        CUSTOM_BASEURL: 'https://custom-api.mistral.ai/v1',
      });

      // Mock API responses
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'file-123', purpose: 'ocr' },
      });
      mockAxios.get.mockResolvedValueOnce({
        data: { url: 'https://signed-url.com' },
      });
      mockAxios.post.mockResolvedValueOnce({
        data: {
          pages: [{ markdown: 'Content from custom API' }],
        },
      });

      const req = {
        user: { id: 'user123' },
        app: {
          locals: {
            ocr: {
              apiKey: '${CUSTOM_API_KEY}',
              baseURL: '${CUSTOM_BASEURL}',
              mistralModel: '${CUSTOM_MODEL}',
            },
          },
        },
      };

      // Set environment variable for model
      process.env.CUSTOM_MODEL = 'mistral-large';

      const file = {
        path: '/tmp/upload/file.pdf',
        originalname: 'document.pdf',
      };

      const result = await uploadMistralOCR({
        req,
        file,
        file_id: 'file123',
        entity_id: 'entity123',
      });

      // Verify that custom environment variables were extracted and used
      expect(loadAuthValues).toHaveBeenCalledWith({
        userId: 'user123',
        authFields: ['CUSTOM_BASEURL', 'CUSTOM_API_KEY'],
        optional: expect.any(Set),
      });

      // Check that mistral-large was used in the OCR API call
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          model: 'mistral-large',
        }),
        expect.anything(),
      );

      expect(result.text).toEqual('Content from custom API\n\n');
    });

    it('should fall back to default values when variables are not properly formatted', async () => {
      const { loadAuthValues } = require('~/server/services/Tools/credentials');
      loadAuthValues.mockResolvedValue({
        OCR_API_KEY: 'default-api-key',
        OCR_BASEURL: undefined, // Testing optional parameter
      });

      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'file-123', purpose: 'ocr' },
      });
      mockAxios.get.mockResolvedValueOnce({
        data: { url: 'https://signed-url.com' },
      });
      mockAxios.post.mockResolvedValueOnce({
        data: {
          pages: [{ markdown: 'Default API result' }],
        },
      });

      const req = {
        user: { id: 'user123' },
        app: {
          locals: {
            ocr: {
              // Use environment variable syntax to ensure loadAuthValues is called
              apiKey: '${INVALID_FORMAT}', // Using valid env var format but with an invalid name
              baseURL: '${OCR_BASEURL}', // Using valid env var format
              mistralModel: 'mistral-ocr-latest', // Plain string value
            },
          },
        },
      };

      const file = {
        path: '/tmp/upload/file.pdf',
        originalname: 'document.pdf',
      };

      await uploadMistralOCR({
        req,
        file,
        file_id: 'file123',
        entity_id: 'entity123',
      });

      // Should use the default values
      expect(loadAuthValues).toHaveBeenCalledWith({
        userId: 'user123',
        authFields: ['OCR_BASEURL', 'INVALID_FORMAT'],
        optional: expect.any(Set),
      });

      // Should use the default model when not using environment variable format
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          model: 'mistral-ocr-latest',
        }),
        expect.anything(),
      );
    });

    it('should handle API errors during OCR process', async () => {
      const { loadAuthValues } = require('~/server/services/Tools/credentials');
      loadAuthValues.mockResolvedValue({
        OCR_API_KEY: 'test-api-key',
      });

      // Mock file upload to fail
      mockAxios.post.mockRejectedValueOnce(new Error('Upload failed'));

      const req = {
        user: { id: 'user123' },
        app: {
          locals: {
            ocr: {
              apiKey: 'OCR_API_KEY',
              baseURL: 'OCR_BASEURL',
            },
          },
        },
      };

      const file = {
        path: '/tmp/upload/file.pdf',
        originalname: 'document.pdf',
      };

      await expect(
        uploadMistralOCR({
          req,
          file,
          file_id: 'file123',
          entity_id: 'entity123',
        }),
      ).rejects.toThrow('Error uploading document to Mistral OCR API');

      const { logAxiosError } = require('~/utils');
      expect(logAxiosError).toHaveBeenCalled();
    });

    it('should handle single page documents without page numbering', async () => {
      const { loadAuthValues } = require('~/server/services/Tools/credentials');
      loadAuthValues.mockResolvedValue({
        OCR_API_KEY: 'test-api-key',
        OCR_BASEURL: 'https://api.mistral.ai/v1', // Make sure this is included
      });

      // Clear all previous mocks
      mockAxios.post.mockClear();
      mockAxios.get.mockClear();

      // 1. First mock: File upload response
      mockAxios.post.mockImplementationOnce(() =>
        Promise.resolve({ data: { id: 'file-123', purpose: 'ocr' } }),
      );

      // 2. Second mock: Signed URL response
      mockAxios.get.mockImplementationOnce(() =>
        Promise.resolve({ data: { url: 'https://signed-url.com' } }),
      );

      // 3. Third mock: OCR response
      mockAxios.post.mockImplementationOnce(() =>
        Promise.resolve({
          data: {
            pages: [{ markdown: 'Single page content' }],
          },
        }),
      );

      const req = {
        user: { id: 'user123' },
        app: {
          locals: {
            ocr: {
              apiKey: 'OCR_API_KEY',
              baseURL: 'OCR_BASEURL',
              mistralModel: 'mistral-ocr-latest',
            },
          },
        },
      };

      const file = {
        path: '/tmp/upload/file.pdf',
        originalname: 'single-page.pdf',
      };

      const result = await uploadMistralOCR({
        req,
        file,
        file_id: 'file123',
        entity_id: 'entity123',
      });

      // Verify that single page documents don't include page numbering
      expect(result.text).not.toContain('# PAGE');
      expect(result.text).toEqual('Single page content\n\n');
    });

    it('should use literal values in configuration when provided directly', async () => {
      const { loadAuthValues } = require('~/server/services/Tools/credentials');
      // We'll still mock this but it should not be used for literal values
      loadAuthValues.mockResolvedValue({});

      // Clear all previous mocks
      mockAxios.post.mockClear();
      mockAxios.get.mockClear();

      // 1. First mock: File upload response
      mockAxios.post.mockImplementationOnce(() =>
        Promise.resolve({ data: { id: 'file-123', purpose: 'ocr' } }),
      );

      // 2. Second mock: Signed URL response
      mockAxios.get.mockImplementationOnce(() =>
        Promise.resolve({ data: { url: 'https://signed-url.com' } }),
      );

      // 3. Third mock: OCR response
      mockAxios.post.mockImplementationOnce(() =>
        Promise.resolve({
          data: {
            pages: [{ markdown: 'Processed with literal config values' }],
          },
        }),
      );

      const req = {
        user: { id: 'user123' },
        app: {
          locals: {
            ocr: {
              // Direct values that should be used as-is, without variable substitution
              apiKey: 'actual-api-key-value',
              baseURL: 'https://direct-api-url.mistral.ai/v1',
              mistralModel: 'mistral-direct-model',
            },
          },
        },
      };

      const file = {
        path: '/tmp/upload/file.pdf',
        originalname: 'direct-values.pdf',
      };

      const result = await uploadMistralOCR({
        req,
        file,
        file_id: 'file123',
        entity_id: 'entity123',
      });

      // Verify the correct URL was used with the direct baseURL value
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://direct-api-url.mistral.ai/v1/files',
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer actual-api-key-value',
          }),
        }),
      );

      // Check the OCR call was made with the direct model value
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://direct-api-url.mistral.ai/v1/ocr',
        expect.objectContaining({
          model: 'mistral-direct-model',
        }),
        expect.any(Object),
      );

      // Verify the result
      expect(result.text).toEqual('Processed with literal config values\n\n');

      // Verify loadAuthValues was never called since we used direct values
      expect(loadAuthValues).not.toHaveBeenCalled();
    });

    it('should handle empty configuration values and use defaults', async () => {
      const { loadAuthValues } = require('~/server/services/Tools/credentials');
      // Set up the mock values to be returned by loadAuthValues
      loadAuthValues.mockResolvedValue({
        OCR_API_KEY: 'default-from-env-key',
        OCR_BASEURL: 'https://default-from-env.mistral.ai/v1',
      });

      // Clear all previous mocks
      mockAxios.post.mockClear();
      mockAxios.get.mockClear();

      // 1. First mock: File upload response
      mockAxios.post.mockImplementationOnce(() =>
        Promise.resolve({ data: { id: 'file-123', purpose: 'ocr' } }),
      );

      // 2. Second mock: Signed URL response
      mockAxios.get.mockImplementationOnce(() =>
        Promise.resolve({ data: { url: 'https://signed-url.com' } }),
      );

      // 3. Third mock: OCR response
      mockAxios.post.mockImplementationOnce(() =>
        Promise.resolve({
          data: {
            pages: [{ markdown: 'Content from default configuration' }],
          },
        }),
      );

      const req = {
        user: { id: 'user123' },
        app: {
          locals: {
            ocr: {
              // Empty string values - should fall back to defaults
              apiKey: '',
              baseURL: '',
              mistralModel: '',
            },
          },
        },
      };

      const file = {
        path: '/tmp/upload/file.pdf',
        originalname: 'empty-config.pdf',
      };

      const result = await uploadMistralOCR({
        req,
        file,
        file_id: 'file123',
        entity_id: 'entity123',
      });

      // Verify loadAuthValues was called with the default variable names
      expect(loadAuthValues).toHaveBeenCalledWith({
        userId: 'user123',
        authFields: ['OCR_BASEURL', 'OCR_API_KEY'],
        optional: expect.any(Set),
      });

      // Verify the API calls used the default values from loadAuthValues
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://default-from-env.mistral.ai/v1/files',
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer default-from-env-key',
          }),
        }),
      );

      // Verify the OCR model defaulted to mistral-ocr-latest
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://default-from-env.mistral.ai/v1/ocr',
        expect.objectContaining({
          model: 'mistral-ocr-latest',
        }),
        expect.any(Object),
      );

      // Check result
      expect(result.text).toEqual('Content from default configuration\n\n');
    });
  });
});
