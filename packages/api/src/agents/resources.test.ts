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

    it('should prevent duplicate files when same file exists in OCR and attachments', async () => {
      const sharedFile: TFile = {
        user: 'user1',
        file_id: 'shared-file-id',
        filename: 'document.pdf',
        filepath: '/uploads/document.pdf',
        object: 'file',
        type: 'application/pdf',
        bytes: 1024,
        embedded: false,
        usage: 0,
      };

      const mockOcrFiles: TFile[] = [sharedFile];
      const mockAttachmentFiles: TFile[] = [
        sharedFile,
        {
          user: 'user1',
          file_id: 'unique-file',
          filename: 'other.txt',
          filepath: '/uploads/other.txt',
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
          file_ids: ['shared-file-id'],
        },
      };

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources,
      });

      // Should only have 2 files, not 3 (no duplicate)
      expect(result.attachments).toHaveLength(2);
      expect(result.attachments?.filter((f) => f?.file_id === 'shared-file-id')).toHaveLength(1);
      expect(result.attachments?.find((f) => f?.file_id === 'unique-file')).toBeDefined();
    });

    it('should still categorize duplicate files for tool_resources', async () => {
      const sharedFile: TFile = {
        user: 'user1',
        file_id: 'shared-file-id',
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
      };

      const mockOcrFiles: TFile[] = [sharedFile];
      const mockAttachmentFiles: TFile[] = [sharedFile];

      mockGetFiles.mockResolvedValue(mockOcrFiles);
      const attachments = Promise.resolve(mockAttachmentFiles);

      const tool_resources = {
        [EToolResources.ocr]: {
          file_ids: ['shared-file-id'],
        },
      };

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources,
      });

      // File should appear only once in attachments
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments?.[0]?.file_id).toBe('shared-file-id');

      // But should still be categorized in tool_resources
      expect(result.tool_resources?.[EToolResources.execute_code]?.files).toHaveLength(1);
      expect(result.tool_resources?.[EToolResources.execute_code]?.files?.[0]?.file_id).toBe(
        'shared-file-id',
      );
    });

    it('should handle multiple duplicate files', async () => {
      const file1: TFile = {
        user: 'user1',
        file_id: 'file-1',
        filename: 'doc1.pdf',
        filepath: '/uploads/doc1.pdf',
        object: 'file',
        type: 'application/pdf',
        bytes: 1024,
        embedded: false,
        usage: 0,
      };

      const file2: TFile = {
        user: 'user1',
        file_id: 'file-2',
        filename: 'doc2.pdf',
        filepath: '/uploads/doc2.pdf',
        object: 'file',
        type: 'application/pdf',
        bytes: 2048,
        embedded: false,
        usage: 0,
      };

      const uniqueFile: TFile = {
        user: 'user1',
        file_id: 'unique-file',
        filename: 'unique.txt',
        filepath: '/uploads/unique.txt',
        object: 'file',
        type: 'text/plain',
        bytes: 256,
        embedded: false,
        usage: 0,
      };

      const mockOcrFiles: TFile[] = [file1, file2];
      const mockAttachmentFiles: TFile[] = [file1, file2, uniqueFile];

      mockGetFiles.mockResolvedValue(mockOcrFiles);
      const attachments = Promise.resolve(mockAttachmentFiles);

      const tool_resources = {
        [EToolResources.ocr]: {
          file_ids: ['file-1', 'file-2'],
        },
      };

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources,
      });

      // Should have 3 files total (2 from OCR + 1 unique from attachments)
      expect(result.attachments).toHaveLength(3);

      // Each file should appear only once
      const fileIds = result.attachments?.map((f) => f?.file_id);
      expect(fileIds).toContain('file-1');
      expect(fileIds).toContain('file-2');
      expect(fileIds).toContain('unique-file');

      // Check no duplicates
      const uniqueFileIds = new Set(fileIds);
      expect(uniqueFileIds.size).toBe(fileIds?.length);
    });

    it('should handle files without file_id gracefully', async () => {
      const fileWithoutId: Partial<TFile> = {
        user: 'user1',
        filename: 'no-id.txt',
        filepath: '/uploads/no-id.txt',
        object: 'file',
        type: 'text/plain',
        bytes: 256,
        embedded: false,
        usage: 0,
      };

      const normalFile: TFile = {
        user: 'user1',
        file_id: 'normal-file',
        filename: 'normal.txt',
        filepath: '/uploads/normal.txt',
        object: 'file',
        type: 'text/plain',
        bytes: 512,
        embedded: false,
        usage: 0,
      };

      const mockOcrFiles: TFile[] = [normalFile];
      const mockAttachmentFiles = [fileWithoutId as TFile, normalFile];

      mockGetFiles.mockResolvedValue(mockOcrFiles);
      const attachments = Promise.resolve(mockAttachmentFiles);

      const tool_resources = {
        [EToolResources.ocr]: {
          file_ids: ['normal-file'],
        },
      };

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources,
      });

      // Should include file without ID and one instance of normal file
      expect(result.attachments).toHaveLength(2);
      expect(result.attachments?.filter((f) => f?.file_id === 'normal-file')).toHaveLength(1);
      expect(result.attachments?.some((f) => !f?.file_id)).toBe(true);
    });

    it('should prevent duplicates from existing tool_resources', async () => {
      const existingFile: TFile = {
        user: 'user1',
        file_id: 'existing-file',
        filename: 'existing.py',
        filepath: '/uploads/existing.py',
        object: 'file',
        type: 'text/x-python',
        bytes: 512,
        embedded: false,
        usage: 0,
        metadata: {
          fileIdentifier: 'python-script',
        },
      };

      const newFile: TFile = {
        user: 'user1',
        file_id: 'new-file',
        filename: 'new.py',
        filepath: '/uploads/new.py',
        object: 'file',
        type: 'text/x-python',
        bytes: 256,
        embedded: false,
        usage: 0,
        metadata: {
          fileIdentifier: 'python-script',
        },
      };

      const existingToolResources = {
        [EToolResources.execute_code]: {
          files: [existingFile],
        },
      };

      const attachments = Promise.resolve([existingFile, newFile]);

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources: existingToolResources,
      });

      // Should only add the new file to attachments
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments?.[0]?.file_id).toBe('new-file');

      // Should not duplicate the existing file in tool_resources
      expect(result.tool_resources?.[EToolResources.execute_code]?.files).toHaveLength(2);
      const fileIds = result.tool_resources?.[EToolResources.execute_code]?.files?.map(
        (f) => f.file_id,
      );
      expect(fileIds).toEqual(['existing-file', 'new-file']);
    });

    it('should handle duplicates within attachments array', async () => {
      const duplicatedFile: TFile = {
        user: 'user1',
        file_id: 'dup-file',
        filename: 'duplicate.txt',
        filepath: '/uploads/duplicate.txt',
        object: 'file',
        type: 'text/plain',
        bytes: 256,
        embedded: false,
        usage: 0,
      };

      const uniqueFile: TFile = {
        user: 'user1',
        file_id: 'unique-file',
        filename: 'unique.txt',
        filepath: '/uploads/unique.txt',
        object: 'file',
        type: 'text/plain',
        bytes: 128,
        embedded: false,
        usage: 0,
      };

      // Same file appears multiple times in attachments
      const attachments = Promise.resolve([
        duplicatedFile,
        duplicatedFile,
        uniqueFile,
        duplicatedFile,
      ]);

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources: {},
      });

      // Should only have 2 unique files
      expect(result.attachments).toHaveLength(2);
      const fileIds = result.attachments?.map((f) => f?.file_id);
      expect(fileIds).toContain('dup-file');
      expect(fileIds).toContain('unique-file');

      // Verify no duplicates
      expect(fileIds?.filter((id) => id === 'dup-file')).toHaveLength(1);
    });

    it('should prevent duplicates across different tool_resource categories', async () => {
      const multiPurposeFile: TFile = {
        user: 'user1',
        file_id: 'multi-file',
        filename: 'data.txt',
        filepath: '/uploads/data.txt',
        object: 'file',
        type: 'text/plain',
        bytes: 512,
        embedded: true, // Will be categorized as file_search
        usage: 0,
      };

      const existingToolResources = {
        [EToolResources.file_search]: {
          files: [multiPurposeFile],
        },
      };

      // Try to add the same file again
      const attachments = Promise.resolve([multiPurposeFile]);

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources: existingToolResources,
      });

      // Should not add to attachments (already exists)
      expect(result.attachments).toHaveLength(0);

      // Should not duplicate in file_search
      expect(result.tool_resources?.[EToolResources.file_search]?.files).toHaveLength(1);
      expect(result.tool_resources?.[EToolResources.file_search]?.files?.[0]?.file_id).toBe(
        'multi-file',
      );
    });

    it('should handle complex scenario with OCR, existing tool_resources, and attachments', async () => {
      const ocrFile: TFile = {
        user: 'user1',
        file_id: 'ocr-file',
        filename: 'scan.pdf',
        filepath: '/uploads/scan.pdf',
        object: 'file',
        type: 'application/pdf',
        bytes: 2048,
        embedded: false,
        usage: 0,
      };

      const existingFile: TFile = {
        user: 'user1',
        file_id: 'existing-file',
        filename: 'code.py',
        filepath: '/uploads/code.py',
        object: 'file',
        type: 'text/x-python',
        bytes: 512,
        embedded: false,
        usage: 0,
        metadata: {
          fileIdentifier: 'python-script',
        },
      };

      const newFile: TFile = {
        user: 'user1',
        file_id: 'new-file',
        filename: 'image.png',
        filepath: '/uploads/image.png',
        object: 'file',
        type: 'image/png',
        bytes: 4096,
        embedded: false,
        usage: 0,
        height: 800,
        width: 600,
      };

      mockGetFiles.mockResolvedValue([ocrFile, existingFile]); // OCR returns both files
      const attachments = Promise.resolve([existingFile, ocrFile, newFile]); // Attachments has duplicates

      const existingToolResources = {
        [EToolResources.ocr]: {
          file_ids: ['ocr-file', 'existing-file'],
        },
        [EToolResources.execute_code]: {
          files: [existingFile],
        },
      };

      requestFileSet.add('new-file'); // Only new-file is in request set

      const result = await primeResources({
        req: mockReq,
        getFiles: mockGetFiles,
        requestFileSet,
        attachments,
        tool_resources: existingToolResources,
      });

      // Should have 3 unique files total
      expect(result.attachments).toHaveLength(3);
      const attachmentIds = result.attachments?.map((f) => f?.file_id).sort();
      expect(attachmentIds).toEqual(['existing-file', 'new-file', 'ocr-file']);

      // Check tool_resources
      expect(result.tool_resources?.[EToolResources.execute_code]?.files).toHaveLength(1);
      expect(result.tool_resources?.[EToolResources.image_edit]?.files).toHaveLength(1);
      expect(result.tool_resources?.[EToolResources.image_edit]?.files?.[0]?.file_id).toBe(
        'new-file',
      );
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
