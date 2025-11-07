import { Providers } from '@librechat/agents';
import { mbToBytes } from 'librechat-data-provider';
import type { AppConfig, IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';
import { encodeAndFormatDocuments } from './document';

/** Mock the validation module */
jest.mock('~/files/validation', () => ({
  validatePdf: jest.fn(),
}));

/** Mock the utils module */
jest.mock('./utils', () => ({
  getFileStream: jest.fn(),
}));

import { validatePdf } from '~/files/validation';
import { getFileStream } from './utils';
import { Types } from 'mongoose';

const mockedValidatePdf = validatePdf as jest.MockedFunction<typeof validatePdf>;
const mockedGetFileStream = getFileStream as jest.MockedFunction<typeof getFileStream>;

describe('encodeAndFormatDocuments - fileConfig integration', () => {
  const mockStrategyFunctions = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** Helper to create a mock request with file config */
  const createMockRequest = (fileSizeLimit?: number): Partial<AppConfig> => ({
    config:
      fileSizeLimit !== undefined
        ? {
            fileConfig: {
              endpoints: {
                [Providers.OPENAI]: {
                  fileSizeLimit,
                },
              },
            },
          }
        : undefined,
  });

  /** Helper to create a mock PDF file */
  const createMockFile = (sizeInMB: number): IMongoFile =>
    ({
      _id: new Types.ObjectId(),
      user: new Types.ObjectId(),
      file_id: new Types.ObjectId().toString(),
      filename: 'test.pdf',
      type: 'application/pdf',
      bytes: Math.floor(sizeInMB * 1024 * 1024),
      object: 'file',
      usage: 0,
      source: 'test',
      filepath: '/test/path.pdf',
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as unknown as IMongoFile;

  describe('Configuration extraction and validation', () => {
    it('should pass configured file size limit to validatePdf for OpenAI', async () => {
      const configuredLimit = mbToBytes(15);
      const req = createMockRequest(15) as ServerRequest;
      const file = createMockFile(10);

      const mockContent = Buffer.from('test-pdf-content').toString('base64');
      mockedGetFileStream.mockResolvedValue({
        file,
        content: mockContent,
        metadata: file,
      });

      mockedValidatePdf.mockResolvedValue({ isValid: true });

      await encodeAndFormatDocuments(
        req,
        [file],
        { provider: Providers.OPENAI },
        mockStrategyFunctions,
      );

      expect(mockedValidatePdf).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Number),
        Providers.OPENAI,
        configuredLimit,
      );
    });

    it('should pass undefined when no fileConfig is provided', async () => {
      const req = {} as ServerRequest;
      const file = createMockFile(10);

      const mockContent = Buffer.from('test-pdf-content').toString('base64');
      mockedGetFileStream.mockResolvedValue({
        file,
        content: mockContent,
        metadata: file,
      });

      mockedValidatePdf.mockResolvedValue({ isValid: true });

      await encodeAndFormatDocuments(
        req,
        [file],
        { provider: Providers.OPENAI },
        mockStrategyFunctions,
      );

      expect(mockedValidatePdf).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Number),
        Providers.OPENAI,
        undefined,
      );
    });

    it('should use default config when fileConfig.endpoints is not defined', async () => {
      const req = {
        config: {
          fileConfig: {},
        },
      } as ServerRequest;
      const file = createMockFile(10);

      const mockContent = Buffer.from('test-pdf-content').toString('base64');
      mockedGetFileStream.mockResolvedValue({
        file,
        content: mockContent,
        metadata: file,
      });

      mockedValidatePdf.mockResolvedValue({ isValid: true });

      await encodeAndFormatDocuments(
        req,
        [file],
        { provider: Providers.OPENAI },
        mockStrategyFunctions,
      );

      /** mergeFileConfig provides a default limit when no endpoints config is specified */
      expect(mockedValidatePdf).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Number),
        Providers.OPENAI,
        expect.any(Number), // Just verify a limit is passed
      );
    });

    it('should use endpoint-specific config for Anthropic', async () => {
      const configuredLimit = mbToBytes(20);
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [Providers.ANTHROPIC]: {
                fileSizeLimit: 20,
              },
            },
          },
        },
      } as unknown as ServerRequest;
      const file = createMockFile(15);

      const mockContent = Buffer.from('test-pdf-content').toString('base64');
      mockedGetFileStream.mockResolvedValue({
        file,
        content: mockContent,
        metadata: file,
      });

      mockedValidatePdf.mockResolvedValue({ isValid: true });

      await encodeAndFormatDocuments(
        req,
        [file],
        { provider: Providers.ANTHROPIC },
        mockStrategyFunctions,
      );

      expect(mockedValidatePdf).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Number),
        Providers.ANTHROPIC,
        configuredLimit,
      );
    });

    it('should use endpoint-specific config for Google', async () => {
      const configuredLimit = mbToBytes(25);
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              [Providers.GOOGLE]: {
                fileSizeLimit: 25,
              },
            },
          },
        },
      } as unknown as ServerRequest;
      const file = createMockFile(18);

      const mockContent = Buffer.from('test-pdf-content').toString('base64');
      mockedGetFileStream.mockResolvedValue({
        file,
        content: mockContent,
        metadata: file,
      });

      mockedValidatePdf.mockResolvedValue({ isValid: true });

      await encodeAndFormatDocuments(
        req,
        [file],
        { provider: Providers.GOOGLE },
        mockStrategyFunctions,
      );

      expect(mockedValidatePdf).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Number),
        Providers.GOOGLE,
        configuredLimit,
      );
    });

    it('should use base default config when provider-specific config not found', async () => {
      const req = {
        config: {
          fileConfig: {
            endpoints: {
              /** Only configure a different provider, not OpenAI */
              [Providers.ANTHROPIC]: {
                fileSizeLimit: 25,
              },
            },
          },
        },
      } as unknown as ServerRequest;
      const file = createMockFile(20);

      const mockContent = Buffer.from('test-pdf-content').toString('base64');
      mockedGetFileStream.mockResolvedValue({
        file,
        content: mockContent,
        metadata: file,
      });

      mockedValidatePdf.mockResolvedValue({ isValid: true });

      await encodeAndFormatDocuments(
        req,
        [file],
        { provider: Providers.OPENAI },
        mockStrategyFunctions,
      );

      /** When provider-specific config not found, uses base default */
      expect(mockedValidatePdf).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Number),
        Providers.OPENAI,
        expect.any(Number), // Just verify a limit is passed
      );
    });
  });

  describe('Validation failure handling', () => {
    it('should throw error when validation fails', async () => {
      const req = createMockRequest(10) as ServerRequest;
      const file = createMockFile(12);

      const mockContent = Buffer.from('test-pdf-content').toString('base64');
      mockedGetFileStream.mockResolvedValue({
        file,
        content: mockContent,
        metadata: file,
      });

      mockedValidatePdf.mockResolvedValue({
        isValid: false,
        error: 'PDF file size (12MB) exceeds the 10MB limit',
      });

      await expect(
        encodeAndFormatDocuments(
          req,
          [file],
          { provider: Providers.OPENAI },
          mockStrategyFunctions,
        ),
      ).rejects.toThrow('PDF validation failed: PDF file size (12MB) exceeds the 10MB limit');
    });

    it('should not call validatePdf for non-PDF files', async () => {
      const req = createMockRequest(10) as ServerRequest;
      const file: IMongoFile = {
        ...createMockFile(5),
        type: 'image/jpeg',
        filename: 'test.jpg',
      };

      const mockContent = Buffer.from('test-image-content').toString('base64');
      mockedGetFileStream.mockResolvedValue({
        file,
        content: mockContent,
        metadata: file,
      });

      await encodeAndFormatDocuments(
        req,
        [file],
        { provider: Providers.OPENAI },
        mockStrategyFunctions,
      );

      expect(mockedValidatePdf).not.toHaveBeenCalled();
    });
  });

  describe('Bug reproduction scenarios', () => {
    it('should respect user-configured lower limit (stricter than provider)', async () => {
      /**
       * Scenario: User sets openAI.fileSizeLimit = 5MB (stricter than 10MB provider limit)
       * Uploads 7MB PDF
       * Expected: Validation called with 5MB limit
       */
      const req = createMockRequest(5) as ServerRequest;
      const file = createMockFile(7);

      const mockContent = Buffer.from('test-pdf-content').toString('base64');
      mockedGetFileStream.mockResolvedValue({
        file,
        content: mockContent,
        metadata: file,
      });

      mockedValidatePdf.mockResolvedValue({
        isValid: false,
        error: 'PDF file size (7MB) exceeds the 5MB limit',
      });

      await expect(
        encodeAndFormatDocuments(
          req,
          [file],
          { provider: Providers.OPENAI },
          mockStrategyFunctions,
        ),
      ).rejects.toThrow('PDF validation failed');

      expect(mockedValidatePdf).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Number),
        Providers.OPENAI,
        mbToBytes(5),
      );
    });

    it('should respect user-configured higher limit (but provider limit still applies)', async () => {
      /**
       * Scenario: User sets openAI.fileSizeLimit = 50MB (higher than 10MB provider limit)
       * Uploads 8MB PDF
       * Expected: Validation called with 50MB limit, but validation will use min(50, 10) = 10MB
       */
      const req = createMockRequest(50) as ServerRequest;
      const file = createMockFile(8);

      const mockContent = Buffer.from('test-pdf-content').toString('base64');
      mockedGetFileStream.mockResolvedValue({
        file,
        content: mockContent,
        metadata: file,
      });

      mockedValidatePdf.mockResolvedValue({ isValid: true });

      await encodeAndFormatDocuments(
        req,
        [file],
        { provider: Providers.OPENAI },
        mockStrategyFunctions,
      );

      expect(mockedValidatePdf).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Number),
        Providers.OPENAI,
        mbToBytes(50),
      );
    });

    it('should handle multiple files with different sizes', async () => {
      const req = createMockRequest(10) as ServerRequest;
      const file1 = createMockFile(5);
      const file2 = createMockFile(8);

      const mockContent1 = Buffer.from('pdf-content-1').toString('base64');
      const mockContent2 = Buffer.from('pdf-content-2').toString('base64');

      mockedGetFileStream
        .mockResolvedValueOnce({
          file: file1,
          content: mockContent1,
          metadata: file1,
        })
        .mockResolvedValueOnce({
          file: file2,
          content: mockContent2,
          metadata: file2,
        });

      mockedValidatePdf.mockResolvedValue({ isValid: true });

      await encodeAndFormatDocuments(
        req,
        [file1, file2],
        { provider: Providers.OPENAI },
        mockStrategyFunctions,
      );

      expect(mockedValidatePdf).toHaveBeenCalledTimes(2);
      expect(mockedValidatePdf).toHaveBeenNthCalledWith(
        1,
        expect.any(Buffer),
        expect.any(Number),
        Providers.OPENAI,
        mbToBytes(10),
      );
      expect(mockedValidatePdf).toHaveBeenNthCalledWith(
        2,
        expect.any(Buffer),
        expect.any(Number),
        Providers.OPENAI,
        mbToBytes(10),
      );
    });
  });

  describe('Document formatting after validation', () => {
    it('should format Anthropic document with valid PDF', async () => {
      const req = createMockRequest(30) as ServerRequest;
      const file = createMockFile(20);

      const mockContent = Buffer.from('test-pdf-content').toString('base64');
      mockedGetFileStream.mockResolvedValue({
        file,
        content: mockContent,
        metadata: file,
      });

      mockedValidatePdf.mockResolvedValue({ isValid: true });

      const result = await encodeAndFormatDocuments(
        req,
        [file],
        { provider: Providers.ANTHROPIC },
        mockStrategyFunctions,
      );

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]).toMatchObject({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: mockContent,
        },
        citations: { enabled: true },
      });
    });

    it('should format OpenAI document with responses API', async () => {
      const req = createMockRequest(15) as ServerRequest;
      const file = createMockFile(10);

      const mockContent = Buffer.from('test-pdf-content').toString('base64');
      mockedGetFileStream.mockResolvedValue({
        file,
        content: mockContent,
        metadata: file,
      });

      mockedValidatePdf.mockResolvedValue({ isValid: true });

      const result = await encodeAndFormatDocuments(
        req,
        [file],
        { provider: Providers.OPENAI, useResponsesApi: true },
        mockStrategyFunctions,
      );

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]).toMatchObject({
        type: 'input_file',
        filename: 'test.pdf',
        file_data: `data:application/pdf;base64,${mockContent}`,
      });
    });
  });
});
