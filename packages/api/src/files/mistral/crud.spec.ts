// Mock setup must be hoisted
jest.mock('fs');
jest.mock('form-data', () => {
  return jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    getHeaders: jest
      .fn()
      .mockReturnValue({ 'content-type': 'multipart/form-data; boundary=---boundary' }),
    getBuffer: jest.fn().mockReturnValue(Buffer.from('mock-form-data')),
    getLength: jest.fn().mockReturnValue(100),
  }));
});
jest.mock('axios', () => {
  const mockAxiosInstance = {
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn(), clear: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn(), clear: jest.fn() },
    },
    defaults: {
      proxy: null,
    },
  };

  return {
    ...mockAxiosInstance,
    create: jest.fn().mockReturnValue(mockAxiosInstance),
  };
});

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('~/utils/axios', () => ({
  createAxiosInstance: () => jest.requireMock('axios'),
  logAxiosError: jest.fn(({ message }) => message || 'Error'),
}));

import * as fs from 'fs';
import axios from 'axios';
import type { Request as ExpressRequest } from 'express';
import type { Readable } from 'stream';
import type { MistralFileUploadResponse, MistralSignedUrlResponse, OCRResult } from '~/types';
import { logger as mockLogger } from '@librechat/data-schemas';
import {
  uploadDocumentToMistral,
  uploadAzureMistralOCR,
  deleteMistralFile,
  uploadMistralOCR,
  getSignedUrl,
  performOCR,
} from './crud';

interface MockReadStream extends Partial<Readable> {
  on: jest.Mock;
  pipe: jest.Mock;
  pause: jest.Mock;
  resume: jest.Mock;
  emit: jest.Mock;
  once: jest.Mock;
  destroy: jest.Mock;
  path?: string;
  fd?: number;
  flags?: string;
  mode?: number;
  autoClose?: boolean;
  bytesRead?: number;
  closed?: boolean;
  pending?: boolean;
}

const mockAxios = jest.mocked(axios);

const mockLoadAuthValues = jest.fn();

describe('MistralOCR Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadDocumentToMistral', () => {
    beforeEach(() => {
      // Create a more complete mock for file streams that FormData can work with
      const mockReadStream: MockReadStream = {
        on: jest.fn().mockImplementation(function (
          this: MockReadStream,
          event: string,
          handler: () => void,
        ) {
          // Simulate immediate 'end' event to make FormData complete processing
          if (event === 'end') {
            handler();
          }
          return this;
        }),
        pipe: jest.fn().mockImplementation(function (this: MockReadStream) {
          return this;
        }),
        pause: jest.fn(),
        resume: jest.fn(),
        emit: jest.fn(),
        once: jest.fn(),
        destroy: jest.fn(),
        path: '/path/to/test.pdf',
        fd: 1,
        flags: 'r',
        mode: 0o666,
        autoClose: true,
        bytesRead: 0,
        closed: false,
        pending: false,
      };

      (jest.mocked(fs).createReadStream as jest.Mock).mockReturnValue(mockReadStream);
    });

    it('should upload a document to Mistral API using file streaming', async () => {
      const mockResponse: { data: MistralFileUploadResponse } = {
        data: {
          id: 'file-123',
          object: 'file',
          bytes: 1024,
          created_at: Date.now(),
          filename: 'test.pdf',
          purpose: 'ocr',
        },
      };
      mockAxios.post!.mockResolvedValueOnce(mockResponse);

      try {
        const result = await uploadDocumentToMistral({
          filePath: '/path/to/test.pdf',
          fileName: 'test.pdf',
          apiKey: 'test-api-key',
        });

        // Check that createReadStream was called with the correct file path
        expect(jest.mocked(fs).createReadStream).toHaveBeenCalledWith('/path/to/test.pdf');

        // Since we're mocking FormData, we'll just check that axios was called correctly
        expect(mockAxios.post).toHaveBeenCalledWith(
          'https://api.mistral.ai/v1/files',
          expect.anything(),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer test-api-key',
            }),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          }),
        );
        expect(result).toEqual(mockResponse.data);
      } catch (error) {
        console.error('Test error:', error);
        throw error;
      }
    });

    it('should handle errors during document upload', async () => {
      const errorMessage = 'API error';
      mockAxios.post!.mockRejectedValueOnce(new Error(errorMessage));

      await expect(
        uploadDocumentToMistral({
          filePath: '/path/to/test.pdf',
          fileName: 'test.pdf',
          apiKey: 'test-api-key',
        }),
      ).rejects.toThrow(errorMessage);
    });
  });

  describe('getSignedUrl', () => {
    it('should fetch signed URL from Mistral API', async () => {
      const mockResponse: { data: MistralSignedUrlResponse } = {
        data: {
          url: 'https://document-url.com',
          expires_at: Date.now() + 86400000,
        },
      };
      mockAxios.get!.mockResolvedValueOnce(mockResponse);

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
      mockAxios.get!.mockRejectedValueOnce(new Error(errorMessage));

      await expect(
        getSignedUrl({
          fileId: 'file-123',
          apiKey: 'test-api-key',
        }),
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith('Error fetching signed URL:', errorMessage);
    });
  });

  describe('deleteMistralFile', () => {
    it('should delete a file from Mistral API', async () => {
      mockAxios.delete!.mockResolvedValueOnce({ data: {} });

      await deleteMistralFile({
        fileId: 'file-123',
        apiKey: 'test-api-key',
        baseURL: 'https://api.mistral.ai/v1',
      });

      expect(mockAxios.delete).toHaveBeenCalledWith('https://api.mistral.ai/v1/files/file-123', {
        headers: {
          Authorization: 'Bearer test-api-key',
        },
      });
    });

    it('should use default baseURL when not provided', async () => {
      mockAxios.delete!.mockResolvedValueOnce({ data: {} });

      await deleteMistralFile({
        fileId: 'file-456',
        apiKey: 'test-api-key',
      });

      expect(mockAxios.delete).toHaveBeenCalledWith('https://api.mistral.ai/v1/files/file-456', {
        headers: {
          Authorization: 'Bearer test-api-key',
        },
      });
    });

    it('should not throw when deletion fails', async () => {
      mockAxios.delete!.mockRejectedValueOnce(new Error('Delete failed'));

      // Should not throw
      await expect(
        deleteMistralFile({
          fileId: 'file-789',
          apiKey: 'test-api-key',
        }),
      ).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error deleting Mistral file file-789:',
        expect.any(Error),
      );
    });
  });

  describe('performOCR', () => {
    it('should perform OCR using Mistral API (document_url)', async () => {
      const mockResponse: { data: OCRResult } = {
        data: {
          model: 'mistral-ocr-latest',
          pages: [
            {
              index: 0,
              markdown: 'Page 1 content',
              images: [],
              dimensions: { dpi: 300, height: 1100, width: 850 },
            },
            {
              index: 1,
              markdown: 'Page 2 content',
              images: [],
              dimensions: { dpi: 300, height: 1100, width: 850 },
            },
          ],
          document_annotation: '',
          usage_info: {
            pages_processed: 2,
            doc_size_bytes: 1024,
          },
        },
      };
      mockAxios.post!.mockResolvedValueOnce(mockResponse);

      const result = await performOCR({
        apiKey: 'test-api-key',
        url: 'https://document-url.com',
        model: 'mistral-ocr-latest',
        documentType: 'document_url',
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/ocr',
        {
          model: 'mistral-ocr-latest',
          include_image_base64: false,
          image_limit: 0,
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

    it('should perform OCR using Mistral API (image_url)', async () => {
      const mockResponse: { data: OCRResult } = {
        data: {
          model: 'mistral-ocr-latest',
          pages: [
            {
              index: 0,
              markdown: 'Image OCR content',
              images: [],
              dimensions: { dpi: 300, height: 1100, width: 850 },
            },
          ],
          document_annotation: '',
          usage_info: {
            pages_processed: 1,
            doc_size_bytes: 2048,
          },
        },
      };
      mockAxios.post!.mockResolvedValueOnce(mockResponse);

      const result = await performOCR({
        apiKey: 'test-api-key',
        url: 'https://image-url.com/image.png',
        model: 'mistral-ocr-latest',
        documentType: 'image_url',
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/ocr',
        {
          model: 'mistral-ocr-latest',
          include_image_base64: false,
          image_limit: 0,
          document: {
            type: 'image_url',
            image_url: 'https://image-url.com/image.png',
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
      mockAxios.post!.mockRejectedValueOnce(new Error(errorMessage));

      await expect(
        performOCR({
          apiKey: 'test-api-key',
          url: 'https://document-url.com',
        }),
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith('Error performing OCR:', errorMessage);
    });
  });

  describe('uploadMistralOCR', () => {
    beforeEach(() => {
      const mockReadStream: MockReadStream = {
        on: jest.fn().mockImplementation(function (
          this: MockReadStream,
          event: string,
          handler: () => void,
        ) {
          // Simulate immediate 'end' event to make FormData complete processing
          if (event === 'end') {
            handler();
          }
          return this;
        }),
        pipe: jest.fn().mockImplementation(function (this: MockReadStream) {
          return this;
        }),
        pause: jest.fn(),
        resume: jest.fn(),
        emit: jest.fn(),
        once: jest.fn(),
        destroy: jest.fn(),
        path: '/tmp/upload/file.pdf',
        fd: 1,
        flags: 'r',
        mode: 0o666,
        autoClose: true,
        bytesRead: 0,
        closed: false,
        pending: false,
      };

      (jest.mocked(fs).createReadStream as jest.Mock).mockReturnValue(mockReadStream);
    });

    it('should process OCR for a file with standard configuration', async () => {
      // Setup mocks
      mockLoadAuthValues.mockResolvedValue({
        OCR_API_KEY: 'test-api-key',
        OCR_BASEURL: 'https://api.mistral.ai/v1',
      });

      // Mock file upload response
      mockAxios.post!.mockResolvedValueOnce({
        data: {
          id: 'file-123',
          object: 'file',
          bytes: 1024,
          created_at: Date.now(),
          filename: 'document.pdf',
          purpose: 'ocr',
        } as MistralFileUploadResponse,
      });

      // Mock signed URL response
      mockAxios.get!.mockResolvedValueOnce({
        data: {
          url: 'https://signed-url.com',
          expires_at: Date.now() + 86400000,
        } as MistralSignedUrlResponse,
      });

      // Mock OCR response with text and images
      mockAxios.post!.mockResolvedValueOnce({
        data: {
          model: 'mistral-medium',
          pages: [
            {
              index: 0,
              markdown: 'Page 1 content',
              images: [
                {
                  id: 'img1',
                  top_left_x: 0,
                  top_left_y: 0,
                  bottom_right_x: 100,
                  bottom_right_y: 100,
                  image_base64: 'base64image1',
                  image_annotation: '',
                },
              ],
              dimensions: { dpi: 300, height: 1100, width: 850 },
            },
            {
              index: 1,
              markdown: 'Page 2 content',
              images: [
                {
                  id: 'img2',
                  top_left_x: 0,
                  top_left_y: 0,
                  bottom_right_x: 100,
                  bottom_right_y: 100,
                  image_base64: 'base64image2',
                  image_annotation: '',
                },
              ],
              dimensions: { dpi: 300, height: 1100, width: 850 },
            },
          ],
          document_annotation: '',
          usage_info: {
            pages_processed: 2,
            doc_size_bytes: 1024,
          },
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
      } as unknown as ExpressRequest;

      const file = {
        path: '/tmp/upload/file.pdf',
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      const result = await uploadMistralOCR({
        req,
        file,
        loadAuthValues: mockLoadAuthValues,
      });

      expect((fs as jest.Mocked<typeof fs>).createReadStream).toHaveBeenCalledWith(
        '/tmp/upload/file.pdf',
      );

      expect(mockLoadAuthValues).toHaveBeenCalledWith({
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

    it('should process OCR for an image file and use image_url type', async () => {
      mockLoadAuthValues.mockResolvedValue({
        OCR_API_KEY: 'test-api-key',
        OCR_BASEURL: 'https://api.mistral.ai/v1',
      });

      // Mock file upload response
      mockAxios.post!.mockResolvedValueOnce({
        data: {
          id: 'file-456',
          object: 'file',
          bytes: 2048,
          created_at: Date.now(),
          filename: 'image.png',
          purpose: 'ocr',
        } as MistralFileUploadResponse,
      });

      // Mock signed URL response
      mockAxios.get!.mockResolvedValueOnce({
        data: {
          url: 'https://signed-url.com/image.png',
          expires_at: Date.now() + 86400000,
        } as MistralSignedUrlResponse,
      });

      // Mock OCR response for image
      mockAxios.post!.mockResolvedValueOnce({
        data: {
          model: 'mistral-medium',
          pages: [
            {
              index: 0,
              markdown: 'Image OCR result',
              images: [
                {
                  id: 'img1',
                  top_left_x: 0,
                  top_left_y: 0,
                  bottom_right_x: 100,
                  bottom_right_y: 100,
                  image_base64: 'imgbase64',
                  image_annotation: '',
                },
              ],
              dimensions: { dpi: 300, height: 1100, width: 850 },
            },
          ],
          document_annotation: '',
          usage_info: {
            pages_processed: 1,
            doc_size_bytes: 2048,
          },
        },
      });

      const req = {
        user: { id: 'user456' },
        app: {
          locals: {
            ocr: {
              apiKey: '${OCR_API_KEY}',
              baseURL: '${OCR_BASEURL}',
              mistralModel: 'mistral-medium',
            },
          },
        },
      } as unknown as ExpressRequest;

      const file = {
        path: '/tmp/upload/image.png',
        originalname: 'image.png',
        mimetype: 'image/png',
      } as Express.Multer.File;

      const result = await uploadMistralOCR({
        req,
        file,
        loadAuthValues: mockLoadAuthValues,
      });

      expect((fs as jest.Mocked<typeof fs>).createReadStream).toHaveBeenCalledWith(
        '/tmp/upload/image.png',
      );

      expect(mockLoadAuthValues).toHaveBeenCalledWith({
        userId: 'user456',
        authFields: ['OCR_BASEURL', 'OCR_API_KEY'],
        optional: expect.any(Set),
      });

      // Check that the OCR API was called with image_url type
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/ocr',
        expect.objectContaining({
          document: expect.objectContaining({
            type: 'image_url',
            image_url: 'https://signed-url.com/image.png',
          }),
        }),
        expect.any(Object),
      );

      expect(result).toEqual({
        filename: 'image.png',
        bytes: expect.any(Number),
        filepath: 'mistral_ocr',
        text: expect.stringContaining('Image OCR result'),
        images: ['imgbase64'],
      });
    });

    it('should process variable references in configuration', async () => {
      // Setup mocks with environment variables
      mockLoadAuthValues.mockResolvedValue({
        CUSTOM_API_KEY: 'custom-api-key',
        CUSTOM_BASEURL: 'https://custom-api.mistral.ai/v1',
      });

      // Mock API responses
      mockAxios.post!.mockResolvedValueOnce({
        data: {
          id: 'file-123',
          object: 'file',
          bytes: 1024,
          created_at: Date.now(),
          filename: 'document.pdf',
          purpose: 'ocr',
        } as MistralFileUploadResponse,
      });
      mockAxios.get!.mockResolvedValueOnce({
        data: {
          url: 'https://signed-url.com',
          expires_at: Date.now() + 86400000,
        } as MistralSignedUrlResponse,
      });
      mockAxios.post!.mockResolvedValueOnce({
        data: {
          model: 'mistral-large',
          pages: [
            {
              index: 0,
              markdown: 'Content from custom API',
              images: [],
              dimensions: { dpi: 300, height: 1100, width: 850 },
            },
          ],
          document_annotation: '',
          usage_info: {
            pages_processed: 1,
            doc_size_bytes: 1024,
          },
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
      } as unknown as ExpressRequest;

      // Set environment variable for model
      process.env.CUSTOM_MODEL = 'mistral-large';

      const file = {
        path: '/tmp/upload/file.pdf',
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      const result = await uploadMistralOCR({
        req,
        file,
        loadAuthValues: mockLoadAuthValues,
      });

      expect((fs as jest.Mocked<typeof fs>).createReadStream).toHaveBeenCalledWith(
        '/tmp/upload/file.pdf',
      );

      // Verify that custom environment variables were extracted and used
      expect(mockLoadAuthValues).toHaveBeenCalledWith({
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
      mockLoadAuthValues.mockResolvedValue({
        OCR_API_KEY: 'default-api-key',
        OCR_BASEURL: undefined, // Testing optional parameter
      });

      mockAxios.post!.mockResolvedValueOnce({
        data: {
          id: 'file-123',
          object: 'file',
          bytes: 1024,
          created_at: Date.now(),
          filename: 'document.pdf',
          purpose: 'ocr',
        } as MistralFileUploadResponse,
      });
      mockAxios.get!.mockResolvedValueOnce({
        data: {
          url: 'https://signed-url.com',
          expires_at: Date.now() + 86400000,
        } as MistralSignedUrlResponse,
      });
      mockAxios.post!.mockResolvedValueOnce({
        data: {
          model: 'mistral-ocr-latest',
          pages: [
            {
              index: 0,
              markdown: 'Default API result',
              images: [],
              dimensions: { dpi: 300, height: 1100, width: 850 },
            },
          ],
          document_annotation: '',
          usage_info: {
            pages_processed: 1,
            doc_size_bytes: 1024,
          },
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
      } as unknown as ExpressRequest;

      const file = {
        path: '/tmp/upload/file.pdf',
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await uploadMistralOCR({
        req,
        file,
        loadAuthValues: mockLoadAuthValues,
      });

      expect((fs as jest.Mocked<typeof fs>).createReadStream).toHaveBeenCalledWith(
        '/tmp/upload/file.pdf',
      );

      // Should use the default values
      expect(mockLoadAuthValues).toHaveBeenCalledWith({
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
      mockLoadAuthValues.mockResolvedValue({
        OCR_API_KEY: 'test-api-key',
      });

      // Mock file upload to fail
      mockAxios.post!.mockRejectedValueOnce(new Error('Upload failed'));

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
      } as unknown as ExpressRequest;

      const file = {
        path: '/tmp/upload/file.pdf',
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await expect(
        uploadMistralOCR({
          req,
          file,
          loadAuthValues: mockLoadAuthValues,
        }),
      ).rejects.toThrow('Error uploading document to Mistral OCR API');
      expect((fs as jest.Mocked<typeof fs>).createReadStream).toHaveBeenCalledWith(
        '/tmp/upload/file.pdf',
      );
    });

    it('should handle single page documents without page numbering', async () => {
      mockLoadAuthValues.mockResolvedValue({
        OCR_API_KEY: 'test-api-key',
        OCR_BASEURL: 'https://api.mistral.ai/v1', // Make sure this is included
      });

      // Clear all previous mocks
      mockAxios.post!.mockClear();
      mockAxios.get!.mockClear();

      // 1. First mock: File upload response
      mockAxios.post!.mockImplementationOnce(() =>
        Promise.resolve({
          data: {
            id: 'file-123',
            object: 'file',
            bytes: 1024,
            created_at: Date.now(),
            filename: 'single-page.pdf',
            purpose: 'ocr',
          } as MistralFileUploadResponse,
        }),
      );

      // 2. Second mock: Signed URL response
      mockAxios.get!.mockImplementationOnce(() =>
        Promise.resolve({
          data: {
            url: 'https://signed-url.com',
            expires_at: Date.now() + 86400000,
          } as MistralSignedUrlResponse,
        }),
      );

      // 3. Third mock: OCR response
      mockAxios.post!.mockImplementationOnce(() =>
        Promise.resolve({
          data: {
            model: 'mistral-ocr-latest',
            pages: [
              {
                index: 0,
                markdown: 'Single page content',
                images: [],
                dimensions: { dpi: 300, height: 1100, width: 850 },
              },
            ],
            document_annotation: '',
            usage_info: {
              pages_processed: 1,
              doc_size_bytes: 1024,
            },
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
      } as unknown as ExpressRequest;

      const file = {
        path: '/tmp/upload/file.pdf',
        originalname: 'single-page.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      const result = await uploadMistralOCR({
        req,
        file,
        loadAuthValues: mockLoadAuthValues,
      });

      expect((fs as jest.Mocked<typeof fs>).createReadStream).toHaveBeenCalledWith(
        '/tmp/upload/file.pdf',
      );

      // Verify that single page documents don't include page numbering
      expect(result.text).not.toContain('# PAGE');
      expect(result.text).toEqual('Single page content\n\n');
    });

    it('should use literal values in configuration when provided directly', async () => {
      // We'll still mock this but it should not be used for literal values
      mockLoadAuthValues.mockResolvedValue({});

      // Clear all previous mocks
      mockAxios.post!.mockClear();
      mockAxios.get!.mockClear();

      // 1. First mock: File upload response
      mockAxios.post!.mockImplementationOnce(() =>
        Promise.resolve({
          data: {
            id: 'file-123',
            object: 'file',
            bytes: 1024,
            created_at: Date.now(),
            filename: 'direct-values.pdf',
            purpose: 'ocr',
          } as MistralFileUploadResponse,
        }),
      );

      // 2. Second mock: Signed URL response
      mockAxios.get!.mockImplementationOnce(() =>
        Promise.resolve({
          data: {
            url: 'https://signed-url.com',
            expires_at: Date.now() + 86400000,
          } as MistralSignedUrlResponse,
        }),
      );

      // 3. Third mock: OCR response
      mockAxios.post!.mockImplementationOnce(() =>
        Promise.resolve({
          data: {
            model: 'mistral-direct-model',
            pages: [
              {
                index: 0,
                markdown: 'Processed with literal config values',
                images: [],
                dimensions: { dpi: 300, height: 1100, width: 850 },
              },
            ],
            document_annotation: '',
            usage_info: {
              pages_processed: 1,
              doc_size_bytes: 1024,
            },
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
      } as unknown as ExpressRequest;

      const file = {
        path: '/tmp/upload/file.pdf',
        originalname: 'direct-values.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      const result = await uploadMistralOCR({
        req,
        file,
        loadAuthValues: mockLoadAuthValues,
      });

      expect((fs as jest.Mocked<typeof fs>).createReadStream).toHaveBeenCalledWith(
        '/tmp/upload/file.pdf',
      );

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
      expect(mockLoadAuthValues).not.toHaveBeenCalled();
    });

    it('should handle empty configuration values and use defaults', async () => {
      // Set up the mock values to be returned by loadAuthValues
      mockLoadAuthValues.mockResolvedValue({
        OCR_API_KEY: 'default-from-env-key',
        OCR_BASEURL: 'https://default-from-env.mistral.ai/v1',
      });

      // Clear all previous mocks
      mockAxios.post!.mockClear();
      mockAxios.get!.mockClear();

      // 1. First mock: File upload response
      mockAxios.post!.mockImplementationOnce(() =>
        Promise.resolve({
          data: {
            id: 'file-123',
            object: 'file',
            bytes: 1024,
            created_at: Date.now(),
            filename: 'empty-config.pdf',
            purpose: 'ocr',
          } as MistralFileUploadResponse,
        }),
      );

      // 2. Second mock: Signed URL response
      mockAxios.get!.mockImplementationOnce(() =>
        Promise.resolve({
          data: {
            url: 'https://signed-url.com',
            expires_at: Date.now() + 86400000,
          } as MistralSignedUrlResponse,
        }),
      );

      // 3. Third mock: OCR response
      mockAxios.post!.mockImplementationOnce(() =>
        Promise.resolve({
          data: {
            model: 'mistral-ocr-latest',
            pages: [
              {
                index: 0,
                markdown: 'Content from default configuration',
                images: [],
                dimensions: { dpi: 300, height: 1100, width: 850 },
              },
            ],
            document_annotation: '',
            usage_info: {
              pages_processed: 1,
              doc_size_bytes: 1024,
            },
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
      } as unknown as ExpressRequest;

      const file = {
        path: '/tmp/upload/file.pdf',
        originalname: 'empty-config.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      const result = await uploadMistralOCR({
        req,
        file,
        loadAuthValues: mockLoadAuthValues,
      });

      expect((fs as jest.Mocked<typeof fs>).createReadStream).toHaveBeenCalledWith(
        '/tmp/upload/file.pdf',
      );

      // Verify loadAuthValues was called with the default variable names
      expect(mockLoadAuthValues).toHaveBeenCalledWith({
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

    describe('Mixed env var and hardcoded configuration', () => {
      beforeEach(() => {
        const mockReadStream: MockReadStream = {
          on: jest.fn().mockImplementation(function (
            this: MockReadStream,
            event: string,
            handler: () => void,
          ) {
            // Simulate immediate 'end' event to make FormData complete processing
            if (event === 'end') {
              handler();
            }
            return this;
          }),
          pipe: jest.fn().mockImplementation(function (this: MockReadStream) {
            return this;
          }),
          pause: jest.fn(),
          resume: jest.fn(),
          emit: jest.fn(),
          once: jest.fn(),
          destroy: jest.fn(),
          path: '/tmp/upload/file.pdf',
          fd: 1,
          flags: 'r',
          mode: 0o666,
          autoClose: true,
          bytesRead: 0,
          closed: false,
          pending: false,
        };

        (jest.mocked(fs).createReadStream as jest.Mock).mockReturnValue(mockReadStream);
      });

      it('should preserve hardcoded baseURL when only apiKey is an env var', async () => {
        // This test demonstrates the current bug
        mockLoadAuthValues.mockResolvedValue({
          AZURE_MISTRAL_OCR_API_KEY: 'test-api-key-from-env',
          // Note: OCR_BASEURL is not returned, simulating it not being set
        });

        // Mock file upload response
        mockAxios.post!.mockResolvedValueOnce({
          data: {
            id: 'file-123',
            object: 'file',
            bytes: 1024,
            created_at: Date.now(),
            filename: 'document.pdf',
            purpose: 'ocr',
          } as MistralFileUploadResponse,
        });

        // Mock signed URL response
        mockAxios.get!.mockResolvedValueOnce({
          data: {
            url: 'https://signed-url.com',
            expires_at: Date.now() + 86400000,
          } as MistralSignedUrlResponse,
        });

        // Mock OCR response
        mockAxios.post!.mockResolvedValueOnce({
          data: {
            model: 'mistral-ocr-2503',
            pages: [
              {
                index: 0,
                markdown: 'Test content',
                images: [],
                dimensions: { dpi: 300, height: 1100, width: 850 },
              },
            ],
            document_annotation: '',
            usage_info: {
              pages_processed: 1,
              doc_size_bytes: 1024,
            },
          },
        });

        const req = {
          user: { id: 'user123' },
          app: {
            locals: {
              ocr: {
                apiKey: '${AZURE_MISTRAL_OCR_API_KEY}',
                baseURL: 'https://endpoint.models.ai.azure.com/v1',
                mistralModel: 'mistral-ocr-2503',
              },
            },
          },
        } as unknown as ExpressRequest;

        const file = {
          path: '/tmp/upload/file.pdf',
          originalname: 'document.pdf',
          mimetype: 'application/pdf',
        } as Express.Multer.File;

        await uploadMistralOCR({
          req,
          file,
          loadAuthValues: mockLoadAuthValues,
        });

        // Check that loadAuthValues was called only with the env var field
        expect(mockLoadAuthValues).toHaveBeenCalledWith({
          userId: 'user123',
          authFields: ['AZURE_MISTRAL_OCR_API_KEY'],
          optional: expect.any(Set),
        });

        // The fix: baseURL should be the hardcoded value
        const uploadCall = mockAxios.post!.mock.calls[0];
        expect(uploadCall[0]).toBe('https://endpoint.models.ai.azure.com/v1/files');
      });

      it('should preserve hardcoded apiKey when only baseURL is an env var', async () => {
        // This test demonstrates the current bug
        mockLoadAuthValues.mockResolvedValue({
          CUSTOM_OCR_BASEURL: 'https://custom-ocr-endpoint.com/v1',
          // Note: OCR_API_KEY is not returned, simulating it not being set
        });

        // Mock file upload response
        mockAxios.post!.mockResolvedValueOnce({
          data: {
            id: 'file-456',
            object: 'file',
            bytes: 1024,
            created_at: Date.now(),
            filename: 'document.pdf',
            purpose: 'ocr',
          } as MistralFileUploadResponse,
        });

        // Mock signed URL response
        mockAxios.get!.mockResolvedValueOnce({
          data: {
            url: 'https://signed-url.com',
            expires_at: Date.now() + 86400000,
          } as MistralSignedUrlResponse,
        });

        // Mock OCR response
        mockAxios.post!.mockResolvedValueOnce({
          data: {
            model: 'mistral-ocr-latest',
            pages: [
              {
                index: 0,
                markdown: 'Test content',
                images: [],
                dimensions: { dpi: 300, height: 1100, width: 850 },
              },
            ],
            document_annotation: '',
            usage_info: {
              pages_processed: 1,
              doc_size_bytes: 1024,
            },
          },
        });

        const req = {
          user: { id: 'user456' },
          app: {
            locals: {
              ocr: {
                apiKey: 'hardcoded-api-key-12345',
                baseURL: '${CUSTOM_OCR_BASEURL}',
                mistralModel: 'mistral-ocr-latest',
              },
            },
          },
        } as unknown as ExpressRequest;

        const file = {
          path: '/tmp/upload/file.pdf',
          originalname: 'document.pdf',
          mimetype: 'application/pdf',
        } as Express.Multer.File;

        await uploadMistralOCR({
          req,
          file,
          loadAuthValues: mockLoadAuthValues,
        });

        // Check that loadAuthValues was called only with the env var field
        expect(mockLoadAuthValues).toHaveBeenCalledWith({
          userId: 'user456',
          authFields: ['CUSTOM_OCR_BASEURL'],
          optional: expect.any(Set),
        });

        // The fix: apiKey should be the hardcoded value
        const uploadCall = mockAxios.post!.mock.calls[0];
        const authHeader = uploadCall[2]?.headers?.Authorization;
        expect(authHeader).toBe('Bearer hardcoded-api-key-12345');
      });
    });

    describe('File cleanup', () => {
      beforeEach(() => {
        const mockReadStream: MockReadStream = {
          on: jest.fn().mockImplementation(function (
            this: MockReadStream,
            event: string,
            handler: () => void,
          ) {
            if (event === 'end') {
              handler();
            }
            return this;
          }),
          pipe: jest.fn().mockImplementation(function (this: MockReadStream) {
            return this;
          }),
          pause: jest.fn(),
          resume: jest.fn(),
          emit: jest.fn(),
          once: jest.fn(),
          destroy: jest.fn(),
          path: '/tmp/upload/file.pdf',
          fd: 1,
          flags: 'r',
          mode: 0o666,
          autoClose: true,
          bytesRead: 0,
          closed: false,
          pending: false,
        };

        (jest.mocked(fs).createReadStream as jest.Mock).mockReturnValue(mockReadStream);
        // Clear all mocks before each test
        mockAxios.delete!.mockClear();
      });

      it('should delete the uploaded file after successful OCR processing', async () => {
        mockLoadAuthValues.mockResolvedValue({
          OCR_API_KEY: 'test-api-key',
          OCR_BASEURL: 'https://api.mistral.ai/v1',
        });

        // Mock file upload response
        mockAxios.post!.mockResolvedValueOnce({
          data: {
            id: 'file-cleanup-123',
            object: 'file',
            bytes: 1024,
            created_at: Date.now(),
            filename: 'document.pdf',
            purpose: 'ocr',
          } as MistralFileUploadResponse,
        });

        // Mock signed URL response
        mockAxios.get!.mockResolvedValueOnce({
          data: {
            url: 'https://signed-url.com',
            expires_at: Date.now() + 86400000,
          } as MistralSignedUrlResponse,
        });

        // Mock OCR response
        mockAxios.post!.mockResolvedValueOnce({
          data: {
            model: 'mistral-ocr-latest',
            pages: [
              {
                index: 0,
                markdown: 'OCR content',
                images: [],
                dimensions: { dpi: 300, height: 1100, width: 850 },
              },
            ],
            document_annotation: '',
            usage_info: {
              pages_processed: 1,
              doc_size_bytes: 1024,
            },
          },
        });

        // Mock delete file response
        mockAxios.delete!.mockResolvedValueOnce({ data: {} });

        const req = {
          user: { id: 'user123' },
          app: {
            locals: {
              ocr: {
                apiKey: '${OCR_API_KEY}',
                baseURL: '${OCR_BASEURL}',
                mistralModel: 'mistral-ocr-latest',
              },
            },
          },
        } as unknown as ExpressRequest;

        const file = {
          path: '/tmp/upload/file.pdf',
          originalname: 'document.pdf',
          mimetype: 'application/pdf',
        } as Express.Multer.File;

        await uploadMistralOCR({
          req,
          file,
          loadAuthValues: mockLoadAuthValues,
        });

        // Verify delete was called with correct parameters
        expect(mockAxios.delete).toHaveBeenCalledWith(
          'https://api.mistral.ai/v1/files/file-cleanup-123',
          {
            headers: {
              Authorization: 'Bearer test-api-key',
            },
          },
        );
        expect(mockAxios.delete).toHaveBeenCalledTimes(1);
      });

      it('should delete the uploaded file even when OCR processing fails', async () => {
        mockLoadAuthValues.mockResolvedValue({
          OCR_API_KEY: 'test-api-key',
          OCR_BASEURL: 'https://api.mistral.ai/v1',
        });

        // Mock file upload response
        mockAxios.post!.mockResolvedValueOnce({
          data: {
            id: 'file-cleanup-456',
            object: 'file',
            bytes: 1024,
            created_at: Date.now(),
            filename: 'document.pdf',
            purpose: 'ocr',
          } as MistralFileUploadResponse,
        });

        // Mock signed URL response
        mockAxios.get!.mockResolvedValueOnce({
          data: {
            url: 'https://signed-url.com',
            expires_at: Date.now() + 86400000,
          } as MistralSignedUrlResponse,
        });

        // Mock OCR to fail
        mockAxios.post!.mockRejectedValueOnce(new Error('OCR processing failed'));

        // Mock delete file response
        mockAxios.delete!.mockResolvedValueOnce({ data: {} });

        const req = {
          user: { id: 'user123' },
          app: {
            locals: {
              ocr: {
                apiKey: '${OCR_API_KEY}',
                baseURL: '${OCR_BASEURL}',
                mistralModel: 'mistral-ocr-latest',
              },
            },
          },
        } as unknown as ExpressRequest;

        const file = {
          path: '/tmp/upload/file.pdf',
          originalname: 'document.pdf',
          mimetype: 'application/pdf',
        } as Express.Multer.File;

        await expect(
          uploadMistralOCR({
            req,
            file,
            loadAuthValues: mockLoadAuthValues,
          }),
        ).rejects.toThrow('Error uploading document to Mistral OCR API');

        // Verify delete was still called despite the error
        expect(mockAxios.delete).toHaveBeenCalledWith(
          'https://api.mistral.ai/v1/files/file-cleanup-456',
          {
            headers: {
              Authorization: 'Bearer test-api-key',
            },
          },
        );
        expect(mockAxios.delete).toHaveBeenCalledTimes(1);
      });

      it('should handle deletion errors gracefully without throwing', async () => {
        mockLoadAuthValues.mockResolvedValue({
          OCR_API_KEY: 'test-api-key',
          OCR_BASEURL: 'https://api.mistral.ai/v1',
        });

        // Mock file upload response
        mockAxios.post!.mockResolvedValueOnce({
          data: {
            id: 'file-cleanup-789',
            object: 'file',
            bytes: 1024,
            created_at: Date.now(),
            filename: 'document.pdf',
            purpose: 'ocr',
          } as MistralFileUploadResponse,
        });

        // Mock signed URL response
        mockAxios.get!.mockResolvedValueOnce({
          data: {
            url: 'https://signed-url.com',
            expires_at: Date.now() + 86400000,
          } as MistralSignedUrlResponse,
        });

        // Mock OCR response
        mockAxios.post!.mockResolvedValueOnce({
          data: {
            model: 'mistral-ocr-latest',
            pages: [
              {
                index: 0,
                markdown: 'OCR content',
                images: [],
                dimensions: { dpi: 300, height: 1100, width: 850 },
              },
            ],
            document_annotation: '',
            usage_info: {
              pages_processed: 1,
              doc_size_bytes: 1024,
            },
          },
        });

        // Mock delete to fail
        mockAxios.delete!.mockRejectedValueOnce(new Error('Delete failed'));

        const req = {
          user: { id: 'user123' },
          app: {
            locals: {
              ocr: {
                apiKey: '${OCR_API_KEY}',
                baseURL: '${OCR_BASEURL}',
                mistralModel: 'mistral-ocr-latest',
              },
            },
          },
        } as unknown as ExpressRequest;

        const file = {
          path: '/tmp/upload/file.pdf',
          originalname: 'document.pdf',
          mimetype: 'application/pdf',
        } as Express.Multer.File;

        // Should not throw even if delete fails
        const result = await uploadMistralOCR({
          req,
          file,
          loadAuthValues: mockLoadAuthValues,
        });

        expect(result).toEqual({
          filename: 'document.pdf',
          bytes: expect.any(Number),
          filepath: 'mistral_ocr',
          text: 'OCR content\n\n',
          images: [],
        });

        // Verify delete was attempted
        expect(mockAxios.delete).toHaveBeenCalledWith(
          'https://api.mistral.ai/v1/files/file-cleanup-789',
          {
            headers: {
              Authorization: 'Bearer test-api-key',
            },
          },
        );

        // Verify error was logged
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error deleting Mistral file file-cleanup-789:',
          expect.any(Error),
        );
      });

      it('should not attempt cleanup if file upload fails', async () => {
        mockLoadAuthValues.mockResolvedValue({
          OCR_API_KEY: 'test-api-key',
          OCR_BASEURL: 'https://api.mistral.ai/v1',
        });

        // Mock file upload to fail
        mockAxios.post!.mockRejectedValueOnce(new Error('Upload failed'));

        const req = {
          user: { id: 'user123' },
          app: {
            locals: {
              ocr: {
                apiKey: '${OCR_API_KEY}',
                baseURL: '${OCR_BASEURL}',
                mistralModel: 'mistral-ocr-latest',
              },
            },
          },
        } as unknown as ExpressRequest;

        const file = {
          path: '/tmp/upload/file.pdf',
          originalname: 'document.pdf',
          mimetype: 'application/pdf',
        } as Express.Multer.File;

        await expect(
          uploadMistralOCR({
            req,
            file,
            loadAuthValues: mockLoadAuthValues,
          }),
        ).rejects.toThrow('Error uploading document to Mistral OCR API');

        // Verify delete was NOT called since upload failed
        expect(mockAxios.delete).not.toHaveBeenCalled();
      });
    });
  });

  describe('uploadAzureMistralOCR', () => {
    beforeEach(() => {
      (jest.mocked(fs).readFileSync as jest.Mock).mockReturnValue(Buffer.from('mock-file-content'));
    });

    it('should process OCR using Azure Mistral with base64 encoding', async () => {
      mockLoadAuthValues.mockResolvedValue({
        OCR_API_KEY: 'azure-api-key',
        OCR_BASEURL: 'https://azure.mistral.ai/v1',
      });

      // Mock OCR response
      mockAxios.post!.mockResolvedValueOnce({
        data: {
          model: 'mistral-ocr-latest',
          pages: [
            {
              index: 0,
              markdown: 'Azure OCR content',
              images: [
                {
                  id: 'azure1',
                  top_left_x: 0,
                  top_left_y: 0,
                  bottom_right_x: 100,
                  bottom_right_y: 100,
                  image_base64: 'azure-base64',
                  image_annotation: '',
                },
              ],
              dimensions: { dpi: 300, height: 1100, width: 850 },
            },
          ],
          document_annotation: '',
          usage_info: {
            pages_processed: 1,
            doc_size_bytes: 1024,
          },
        },
      });

      const req = {
        user: { id: 'user123' },
        app: {
          locals: {
            ocr: {
              apiKey: '${OCR_API_KEY}',
              baseURL: '${OCR_BASEURL}',
              mistralModel: 'mistral-ocr-latest',
            },
          },
        },
      } as unknown as ExpressRequest;

      const file = {
        path: '/tmp/upload/azure-file.pdf',
        originalname: 'azure-document.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      const result = await uploadAzureMistralOCR({
        req,
        file,
        loadAuthValues: mockLoadAuthValues,
      });

      expect(jest.mocked(fs).readFileSync).toHaveBeenCalledWith('/tmp/upload/azure-file.pdf');

      // Verify OCR was called with base64 data URL
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://azure.mistral.ai/v1/ocr',
        expect.objectContaining({
          document: expect.objectContaining({
            type: 'document_url',
            document_url: expect.stringMatching(/^data:application\/pdf;base64,/),
          }),
        }),
        expect.any(Object),
      );

      expect(result).toEqual({
        filename: 'azure-document.pdf',
        bytes: expect.any(Number),
        filepath: 'azure_mistral_ocr',
        text: 'Azure OCR content\n\n',
        images: ['azure-base64'],
      });
    });

    describe('Mixed env var and hardcoded configuration', () => {
      it('should preserve hardcoded baseURL when only apiKey is an env var', async () => {
        // This test demonstrates the current bug
        mockLoadAuthValues.mockResolvedValue({
          AZURE_MISTRAL_OCR_API_KEY: 'test-api-key-from-env',
          // Note: OCR_BASEURL is not returned, simulating it not being set
        });

        // Mock OCR response
        mockAxios.post!.mockResolvedValueOnce({
          data: {
            model: 'mistral-ocr-2503',
            pages: [
              {
                index: 0,
                markdown: 'Test content',
                images: [],
                dimensions: { dpi: 300, height: 1100, width: 850 },
              },
            ],
            document_annotation: '',
            usage_info: {
              pages_processed: 1,
              doc_size_bytes: 1024,
            },
          },
        });

        const req = {
          user: { id: 'user123' },
          app: {
            locals: {
              ocr: {
                apiKey: '${AZURE_MISTRAL_OCR_API_KEY}',
                baseURL: 'https://endpoint.models.ai.azure.com/v1',
                mistralModel: 'mistral-ocr-2503',
              },
            },
          },
        } as unknown as ExpressRequest;

        const file = {
          path: '/tmp/upload/file.pdf',
          originalname: 'document.pdf',
          mimetype: 'application/pdf',
        } as Express.Multer.File;

        await uploadAzureMistralOCR({
          req,
          file,
          loadAuthValues: mockLoadAuthValues,
        });

        // Check that loadAuthValues was called only with the env var field
        expect(mockLoadAuthValues).toHaveBeenCalledWith({
          userId: 'user123',
          authFields: ['AZURE_MISTRAL_OCR_API_KEY'],
          optional: expect.any(Set),
        });

        // The fix: baseURL should be the hardcoded value
        const ocrCall = mockAxios.post!.mock.calls[0];
        expect(ocrCall[0]).toBe('https://endpoint.models.ai.azure.com/v1/ocr');
      });

      it('should preserve hardcoded apiKey when only baseURL is an env var', async () => {
        // This test demonstrates the current bug
        mockLoadAuthValues.mockResolvedValue({
          CUSTOM_OCR_BASEURL: 'https://custom-ocr-endpoint.com/v1',
          // Note: OCR_API_KEY is not returned, simulating it not being set
        });

        // Mock OCR response
        mockAxios.post!.mockResolvedValueOnce({
          data: {
            model: 'mistral-ocr-latest',
            pages: [
              {
                index: 0,
                markdown: 'Test content',
                images: [],
                dimensions: { dpi: 300, height: 1100, width: 850 },
              },
            ],
            document_annotation: '',
            usage_info: {
              pages_processed: 1,
              doc_size_bytes: 1024,
            },
          },
        });

        const req = {
          user: { id: 'user456' },
          app: {
            locals: {
              ocr: {
                apiKey: 'hardcoded-api-key-12345',
                baseURL: '${CUSTOM_OCR_BASEURL}',
                mistralModel: 'mistral-ocr-latest',
              },
            },
          },
        } as unknown as ExpressRequest;

        const file = {
          path: '/tmp/upload/file.pdf',
          originalname: 'document.pdf',
          mimetype: 'application/pdf',
        } as Express.Multer.File;

        await uploadAzureMistralOCR({
          req,
          file,
          loadAuthValues: mockLoadAuthValues,
        });

        // Check that loadAuthValues was called only with the env var field
        expect(mockLoadAuthValues).toHaveBeenCalledWith({
          userId: 'user456',
          authFields: ['CUSTOM_OCR_BASEURL'],
          optional: expect.any(Set),
        });

        // The fix: apiKey should be the hardcoded value
        const ocrCall = mockAxios.post!.mock.calls[0];
        const authHeader = ocrCall[2]?.headers?.Authorization;
        expect(authHeader).toBe('Bearer hardcoded-api-key-12345');
      });
    });
  });
});
