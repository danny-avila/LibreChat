const fs = require('fs');
const mockAxios = {
  put: jest.fn().mockResolvedValue({ data: 'Extracted text from Tika' }),
  interceptors: {
    response: {
      use: jest.fn(),
    },
  },
};
jest.mock('axios', () => mockAxios);
jest.mock('fs');
jest.mock('~/config', () => ({
  logger: {
    error: jest.fn(),
  },
  createAxiosInstance: () => mockAxios,
}));
jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

const { uploadTikaOCR } = require('./crud');

describe('TikaOCR Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadDocumentToTika', () => {
    it('should upload a document to Tika and return extracted text', async () => {
      const mockFilePath = '/path/to/test.pdf';
      const mockFileData = Buffer.from('mock file data');
      fs.readFileSync.mockReturnValue(mockFileData);

      const result = await uploadTikaOCR({
        req: {
          user: { id: 'user123' },
          app: {
            locals: {
              ocr: {
                baseURL: 'http://tika:9998',
              },
            },
          },
        },
        file: {
          path: mockFilePath,
          originalname: 'test.pdf',
        },
        file_id: 'file123',
        entity_id: 'entity123',
      });

      expect(fs.readFileSync).toHaveBeenCalledWith(mockFilePath);
      expect(mockAxios.put).toHaveBeenCalledWith(
        'http://tika:9998/tika',
        mockFileData,
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/pdf',
            Accept: 'text/plain',
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }),
      );
      expect(result).toEqual({
        filename: 'test.pdf',
        bytes: 'Extracted text from Tika'.length * 4,
        filepath: 'tika_ocr',
        text: 'Extracted text from Tika',
        images: [],
      });
    });

    it('should handle errors during document upload', async () => {
      const errorMessage = 'Tika API error';
      mockAxios.put.mockRejectedValueOnce(new Error(errorMessage));

      await expect(
        uploadTikaOCR({
          req: {
            user: { id: 'user123' },
            app: {
              locals: {
                ocr: {
                  baseURL: 'http://tika:9998',
                },
              },
            },
          },
          file: {
            path: '/path/to/test.pdf',
            originalname: 'test.pdf',
          },
          file_id: 'file123',
          entity_id: 'entity123',
        }),
      ).rejects.toThrow('Error uploading document to Tika OCR API');

      const { logger } = require('~/config');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error uploading document to Tika:'),
        expect.any(String),
      );
    });

    it('should resolve baseURL from environment variables when configured', async () => {
      const { loadAuthValues } = require('~/server/services/Tools/credentials');
      loadAuthValues.mockResolvedValue({
        OCR_BASEURL: 'http://env-tika:9998',
      });

      const result = await uploadTikaOCR({
        req: {
          user: { id: 'user123' },
          app: {
            locals: {
              ocr: {
                baseURL: '${OCR_BASEURL}',
              },
            },
          },
        },
        file: {
          path: '/path/to/test.pdf',
          originalname: 'test.pdf',
        },
        file_id: 'file123',
        entity_id: 'entity123',
      });

      expect(loadAuthValues).toHaveBeenCalledWith({
        userId: 'user123',
        authFields: ['OCR_BASEURL'],
        optional: expect.any(Set),
      });
      expect(mockAxios.put).toHaveBeenCalledWith(
        'http://env-tika:9998/tika',
        expect.any(Buffer),
        expect.any(Object),
      );
      expect(result.text).toEqual('Extracted text from Tika');
    });

    it('should handle empty baseURL and use default', async () => {
      const result = await uploadTikaOCR({
        req: {
          user: { id: 'user123' },
          app: {
            locals: {
              ocr: {
                baseURL: '',
              },
            },
          },
        },
        file: {
          path: '/path/to/test.pdf',
          originalname: 'test.pdf',
        },
        file_id: 'file123',
        entity_id: 'entity123',
      });

      expect(mockAxios.put).toHaveBeenCalledWith(
        'http://tika:9998/tika',
        expect.any(Buffer),
        expect.any(Object),
      );
      expect(result.text).toEqual('Extracted text from Tika');
    });
  });
});