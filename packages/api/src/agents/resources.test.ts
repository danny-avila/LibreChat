import { primeResources } from './resources';
import { logger } from '@librechat/data-schemas';
import { EModelEndpoint, EToolResources, AgentCapabilities } from 'librechat-data-provider';
import type { Request as ServerRequest } from 'express';
import type { TFile } from 'librechat-data-provider';
import type { TGetFiles } from './resources';

// Mock logger
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('primeResources', () => {
  let mockReq: ServerRequest;
  let mockGetFiles: jest.MockedFunction<TGetFiles>;
  let requestFileSet: Set<string>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock request
    mockReq = {
      app: {
        locals: {
          [EModelEndpoint.agents]: {
            capabilities: [AgentCapabilities.ocr],
          },
        },
      },
    } as unknown as ServerRequest;

    // Setup mock getFiles function
    mockGetFiles = jest.fn();

    // Setup request file set
    requestFileSet = new Set(['file1', 'file2', 'file3']);
  });

  describe('when OCR is enabled and tool_resources has OCR file_ids', () => {
    it('should fetch OCR files and include them in attachments', async () => {
      const mockOcrFiles: TFile[] = [
        {
          user: 'user1',
          file_id: 'ocr-file-1',
          filename: 'document.pdf',
          filepath: '/uploads/document.pdf',
          object: 'file',
          type: 'application/pdf',
          bytes: 1024,
          embedded: false,
          usage: 0,
        },
      ];

      mockGetFiles.mockResolvedValue(mockOcrFiles);

      const tool_resources = {
        [EToolResources.ocr]: {
          file_ids: ['ocr-file-1'],
        },
      };

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments: undefined,
        tool_resources,
      });

      expect(mockGetFiles).toHaveBeenCalledWith({ file_id: { $in: ['ocr-file-1'] } }, {}, {});
      expect(result.attachments).toEqual(mockOcrFiles);
      expect(result.tool_resources).toEqual(tool_resources);
    });
  });

  describe('when OCR is disabled', () => {
    it('should not fetch OCR files even if tool_resources has OCR file_ids', async () => {
      (mockReq.app as ServerRequest['app']).locals[EModelEndpoint.agents].capabilities = [];

      const tool_resources = {
        [EToolResources.ocr]: {
          file_ids: ['ocr-file-1'],
        },
      };

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments: undefined,
        tool_resources,
      });

      expect(mockGetFiles).not.toHaveBeenCalled();
      expect(result.attachments).toBeUndefined();
      expect(result.tool_resources).toEqual(tool_resources);
    });
  });

  describe('when attachments are provided', () => {
    it('should process files with fileIdentifier as execute_code resources', async () => {
      const mockFiles: TFile[] = [
        {
          user: 'user1',
          file_id: 'file1',
          filename: 'script.py',
          filepath: '/uploads/script.py',
          object: 'file',
          type: 'text/x-python',
          bytes: 512,
          embedded: false,
          usage: 0,
          metadata: {
            fileIdentifier: 'python-script',
          },
        },
      ];

      const attachments = Promise.resolve(mockFiles);

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources: {},
      });

      expect(result.attachments).toEqual(mockFiles);
      expect(result.tool_resources?.[EToolResources.execute_code]?.files).toEqual(mockFiles);
    });

    it('should process embedded files as file_search resources', async () => {
      const mockFiles: TFile[] = [
        {
          user: 'user1',
          file_id: 'file2',
          filename: 'document.txt',
          filepath: '/uploads/document.txt',
          object: 'file',
          type: 'text/plain',
          bytes: 256,
          embedded: true,
          usage: 0,
        },
      ];

      const attachments = Promise.resolve(mockFiles);

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources: {},
      });

      expect(result.attachments).toEqual(mockFiles);
      expect(result.tool_resources?.[EToolResources.file_search]?.files).toEqual(mockFiles);
    });

    it('should process image files in requestFileSet as image_edit resources', async () => {
      const mockFiles: TFile[] = [
        {
          user: 'user1',
          file_id: 'file1',
          filename: 'image.png',
          filepath: '/uploads/image.png',
          object: 'file',
          type: 'image/png',
          bytes: 2048,
          embedded: false,
          usage: 0,
          height: 800,
          width: 600,
        },
      ];

      const attachments = Promise.resolve(mockFiles);

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources: {},
      });

      expect(result.attachments).toEqual(mockFiles);
      expect(result.tool_resources?.[EToolResources.image_edit]?.files).toEqual(mockFiles);
    });

    it('should not process image files not in requestFileSet', async () => {
      const mockFiles: TFile[] = [
        {
          user: 'user1',
          file_id: 'file-not-in-set',
          filename: 'image.png',
          filepath: '/uploads/image.png',
          object: 'file',
          type: 'image/png',
          bytes: 2048,
          embedded: false,
          usage: 0,
          height: 800,
          width: 600,
        },
      ];

      const attachments = Promise.resolve(mockFiles);

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources: {},
      });

      expect(result.attachments).toEqual(mockFiles);
      expect(result.tool_resources?.[EToolResources.image_edit]).toBeUndefined();
    });

    it('should not process image files without height and width', async () => {
      const mockFiles: TFile[] = [
        {
          user: 'user1',
          file_id: 'file1',
          filename: 'image.png',
          filepath: '/uploads/image.png',
          object: 'file',
          type: 'image/png',
          bytes: 2048,
          embedded: false,
          usage: 0,
          // Missing height and width
        },
      ];

      const attachments = Promise.resolve(mockFiles);

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources: {},
      });

      expect(result.attachments).toEqual(mockFiles);
      expect(result.tool_resources?.[EToolResources.image_edit]).toBeUndefined();
    });

    it('should filter out null files from attachments', async () => {
      const mockFiles: Array<TFile | null> = [
        {
          user: 'user1',
          file_id: 'file1',
          filename: 'valid.txt',
          filepath: '/uploads/valid.txt',
          object: 'file',
          type: 'text/plain',
          bytes: 256,
          embedded: false,
          usage: 0,
        },
        null,
        {
          user: 'user1',
          file_id: 'file2',
          filename: 'valid2.txt',
          filepath: '/uploads/valid2.txt',
          object: 'file',
          type: 'text/plain',
          bytes: 128,
          embedded: false,
          usage: 0,
        },
      ];

      const attachments = Promise.resolve(mockFiles);

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources: {},
      });

      expect(result.attachments).toHaveLength(2);
      expect(result.attachments?.[0]?.file_id).toBe('file1');
      expect(result.attachments?.[1]?.file_id).toBe('file2');
    });

    it('should merge existing tool_resources with new files', async () => {
      const mockFiles: TFile[] = [
        {
          user: 'user1',
          file_id: 'file1',
          filename: 'script.py',
          filepath: '/uploads/script.py',
          object: 'file',
          type: 'text/x-python',
          bytes: 512,
          embedded: false,
          usage: 0,
          metadata: {
            fileIdentifier: 'python-script',
          },
        },
      ];

      const existingToolResources = {
        [EToolResources.execute_code]: {
          files: [
            {
              user: 'user1',
              file_id: 'existing-file',
              filename: 'existing.py',
              filepath: '/uploads/existing.py',
              object: 'file' as const,
              type: 'text/x-python',
              bytes: 256,
              embedded: false,
              usage: 0,
            },
          ],
        },
      };

      const attachments = Promise.resolve(mockFiles);

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources: existingToolResources,
      });

      expect(result.tool_resources?.[EToolResources.execute_code]?.files).toHaveLength(2);
      expect(result.tool_resources?.[EToolResources.execute_code]?.files?.[0]?.file_id).toBe(
        'existing-file',
      );
      expect(result.tool_resources?.[EToolResources.execute_code]?.files?.[1]?.file_id).toBe(
        'file1',
      );
    });
  });

  describe('when both OCR and attachments are provided', () => {
    it('should include both OCR files and attachment files', async () => {
      const mockOcrFiles: TFile[] = [
        {
          user: 'user1',
          file_id: 'ocr-file-1',
          filename: 'document.pdf',
          filepath: '/uploads/document.pdf',
          object: 'file',
          type: 'application/pdf',
          bytes: 1024,
          embedded: false,
          usage: 0,
        },
      ];

      const mockAttachmentFiles: TFile[] = [
        {
          user: 'user1',
          file_id: 'file1',
          filename: 'attachment.txt',
          filepath: '/uploads/attachment.txt',
          object: 'file',
          type: 'text/plain',
          bytes: 256,
          embedded: false,
          usage: 0,
        },
      ];

      mockGetFiles.mockResolvedValue(mockOcrFiles);
      const attachments = Promise.resolve(mockAttachmentFiles);

      const tool_resources = {
        [EToolResources.ocr]: {
          file_ids: ['ocr-file-1'],
        },
      };

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources,
      });

      expect(result.attachments).toHaveLength(2);
      expect(result.attachments?.[0]?.file_id).toBe('ocr-file-1');
      expect(result.attachments?.[1]?.file_id).toBe('file1');
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully and log them', async () => {
      const mockFiles: TFile[] = [
        {
          user: 'user1',
          file_id: 'file1',
          filename: 'test.txt',
          filepath: '/uploads/test.txt',
          object: 'file',
          type: 'text/plain',
          bytes: 256,
          embedded: false,
          usage: 0,
        },
      ];

      const attachments = Promise.resolve(mockFiles);
      const error = new Error('Test error');

      // Mock getFiles to throw an error when called for OCR
      mockGetFiles.mockRejectedValue(error);

      const tool_resources = {
        [EToolResources.ocr]: {
          file_ids: ['ocr-file-1'],
        },
      };

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources,
      });

      expect(logger.error).toHaveBeenCalledWith('Error priming resources', error);
      expect(result.attachments).toEqual(mockFiles);
      expect(result.tool_resources).toEqual(tool_resources);
    });

    it('should handle promise rejection in attachments', async () => {
      const error = new Error('Attachment error');
      const attachments = Promise.reject(error);

      // The function should now handle rejected attachment promises gracefully
      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources: {},
      });

      // Should log both the main error and the attachment error
      expect(logger.error).toHaveBeenCalledWith('Error priming resources', error);
      expect(logger.error).toHaveBeenCalledWith(
        'Error resolving attachments in catch block',
        error,
      );

      // Should return empty array when attachments promise is rejected
      expect(result.attachments).toEqual([]);
      expect(result.tool_resources).toEqual({});
    });
  });

  describe('edge cases', () => {
    it('should handle missing app.locals gracefully', async () => {
      const reqWithoutLocals = {} as ServerRequest;

      const result = await primeResources({
        req: reqWithoutLocals,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments: undefined,
        tool_resources: {
          [EToolResources.ocr]: {
            file_ids: ['ocr-file-1'],
          },
        },
      });

      expect(mockGetFiles).not.toHaveBeenCalled();
      // When app.locals is missing and there's an error accessing properties,
      // the function falls back to the catch block which returns an empty array
      expect(result.attachments).toEqual([]);
    });

    it('should handle undefined tool_resources', async () => {
      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments: undefined,
        tool_resources: undefined,
      });

      expect(result.tool_resources).toEqual({});
      expect(result.attachments).toBeUndefined();
    });

    it('should handle empty requestFileSet', async () => {
      const mockFiles: TFile[] = [
        {
          user: 'user1',
          file_id: 'file1',
          filename: 'image.png',
          filepath: '/uploads/image.png',
          object: 'file',
          type: 'image/png',
          bytes: 2048,
          embedded: false,
          usage: 0,
          height: 800,
          width: 600,
        },
      ];

      const attachments = Promise.resolve(mockFiles);
      const emptyRequestFileSet = new Set<string>();

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet: emptyRequestFileSet,
        attachments,
        tool_resources: {},
      });

      expect(result.attachments).toEqual(mockFiles);
      expect(result.tool_resources?.[EToolResources.image_edit]).toBeUndefined();
    });
  });
});
