import { Types } from 'mongoose';
import { FileSources, FileMetadataFields } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import { formatFileMetadata, extractFileContext } from './context';

describe('formatFileMetadata', () => {
  const createMockFile = (overrides: Partial<IMongoFile> = {}): IMongoFile =>
    ({
      _id: new Types.ObjectId(),
      user: new Types.ObjectId(),
      file_id: 'test-file-id-123',
      filename: 'test-document.pdf',
      type: 'application/pdf',
      bytes: 1048576, // 1 MB
      object: 'file',
      usage: 0,
      source: FileSources.s3,
      filepath: 's3://bucket/path/test-document.pdf',
      conversationId: 'conv-123',
      width: 800,
      height: 600,
      createdAt: new Date('2024-01-15T10:30:00Z'),
      updatedAt: new Date('2024-01-15T11:00:00Z'),
      ...overrides,
    }) as unknown as IMongoFile;

  describe('when disabled', () => {
    it('should return empty string when config is undefined', () => {
      const file = createMockFile();
      const result = formatFileMetadata(file, undefined);
      expect(result).toBe('');
    });

    it('should return empty string when enabled is false', () => {
      const file = createMockFile();
      const result = formatFileMetadata(file, { enabled: false });
      expect(result).toBe('');
    });
  });

  describe('markdown format', () => {
    it('should format default fields as markdown', () => {
      const file = createMockFile();
      const result = formatFileMetadata(file, { enabled: true });

      expect(result).toContain('**File Metadata:**');
      expect(result).toContain('**filename**: test-document.pdf');
      expect(result).toContain('**type**: application/pdf');
      expect(result).toContain('**bytes**: 1048576');
      expect(result).toContain('**size_human**: 1 MB');
    });

    it('should format custom fields as markdown', () => {
      const file = createMockFile();
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [
          FileMetadataFields.filename,
          FileMetadataFields.source,
          FileMetadataFields.filepath,
        ],
        format: 'markdown',
      });

      expect(result).toContain('**filename**: test-document.pdf');
      expect(result).toContain('**source**: s3');
      expect(result).toContain('**filepath**: s3://bucket/path/test-document.pdf');
      expect(result).not.toContain('**bytes**');
    });
  });

  describe('json format', () => {
    it('should format fields as JSON', () => {
      const file = createMockFile();
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [FileMetadataFields.filename, FileMetadataFields.bytes],
        format: 'json',
      });

      const parsed = JSON.parse(result);
      expect(parsed.filename).toBe('test-document.pdf');
      expect(parsed.bytes).toBe(1048576);
      expect(parsed.size_human).toBe('1 MB');
    });
  });

  describe('xml format', () => {
    it('should format fields as XML', () => {
      const file = createMockFile();
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [FileMetadataFields.filename, FileMetadataFields.type],
        format: 'xml',
      });

      expect(result).toContain('<file_metadata>');
      expect(result).toContain('<filename>test-document.pdf</filename>');
      expect(result).toContain('<type>application/pdf</type>');
      expect(result).toContain('</file_metadata>');
    });

    it('should escape special XML characters in values', () => {
      const file = createMockFile({ filename: 'file<script>.pdf' });
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [FileMetadataFields.filename],
        format: 'xml',
      });

      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('should escape ampersands and quotes in XML', () => {
      const file = createMockFile({ filename: 'test & "file".pdf' });
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [FileMetadataFields.filename],
        format: 'xml',
      });

      expect(result).toContain('&amp;');
      expect(result).toContain('&quot;');
    });
  });

  describe('opt-in fields', () => {
    it('should include filepath when configured', () => {
      const file = createMockFile();
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [FileMetadataFields.filepath],
        format: 'json',
      });

      const parsed = JSON.parse(result);
      expect(parsed.filepath).toBe('s3://bucket/path/test-document.pdf');
    });

    it('should include conversationId when configured', () => {
      const file = createMockFile();
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [FileMetadataFields.conversationId],
        format: 'json',
      });

      const parsed = JSON.parse(result);
      expect(parsed.conversationId).toBe('conv-123');
    });

    it('should include file_id when configured', () => {
      const file = createMockFile();
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [FileMetadataFields.file_id],
        format: 'json',
      });

      const parsed = JSON.parse(result);
      expect(parsed.file_id).toBe('test-file-id-123');
    });
  });

  describe('image dimensions', () => {
    it('should include width and height when configured and present', () => {
      const file = createMockFile({ width: 1920, height: 1080 });
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [FileMetadataFields.width, FileMetadataFields.height],
        format: 'json',
      });

      const parsed = JSON.parse(result);
      expect(parsed.width).toBe(1920);
      expect(parsed.height).toBe(1080);
    });

    it('should not include dimensions when not present on file', () => {
      const file = createMockFile({ width: undefined, height: undefined });
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [FileMetadataFields.width, FileMetadataFields.height],
        format: 'json',
      });

      // Should return empty because no fields have values
      expect(result).toBe('');
    });
  });

  describe('timestamps', () => {
    it('should format Date objects as ISO strings', () => {
      const file = createMockFile({
        createdAt: new Date('2024-01-15T10:30:00Z'),
      });
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [FileMetadataFields.createdAt],
        format: 'json',
      });

      const parsed = JSON.parse(result);
      expect(parsed.createdAt).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should pass through string timestamps as-is', () => {
      const file = createMockFile({
        createdAt: '2024-01-15T10:30:00Z' as unknown as Date,
      });
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [FileMetadataFields.createdAt],
        format: 'json',
      });

      const parsed = JSON.parse(result);
      expect(parsed.createdAt).toBe('2024-01-15T10:30:00Z');
    });
  });

  describe('bytes formatting', () => {
    it('should format 0 bytes correctly', () => {
      const file = createMockFile({ bytes: 0 });
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [FileMetadataFields.bytes],
        format: 'json',
      });

      const parsed = JSON.parse(result);
      expect(parsed.size_human).toBe('0 Bytes');
    });

    it('should format KB correctly', () => {
      const file = createMockFile({ bytes: 2048 }); // 2 KB
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [FileMetadataFields.bytes],
        format: 'json',
      });

      const parsed = JSON.parse(result);
      expect(parsed.size_human).toBe('2 KB');
    });

    it('should format GB correctly', () => {
      const file = createMockFile({ bytes: 1073741824 }); // 1 GB
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [FileMetadataFields.bytes],
        format: 'json',
      });

      const parsed = JSON.parse(result);
      expect(parsed.size_human).toBe('1 GB');
    });

    it('should format TB correctly', () => {
      const file = createMockFile({ bytes: 1099511627776 }); // 1 TB
      const result = formatFileMetadata(file, {
        enabled: true,
        fields: [FileMetadataFields.bytes],
        format: 'json',
      });

      const parsed = JSON.parse(result);
      expect(parsed.size_human).toBe('1 TB');
    });
  });
});

describe('extractFileContext', () => {
  const createMockFile = (overrides: Partial<IMongoFile> = {}): IMongoFile =>
    ({
      _id: new Types.ObjectId(),
      user: new Types.ObjectId(),
      file_id: 'test-file-id',
      filename: 'test.pdf',
      type: 'application/pdf',
      bytes: 1024,
      object: 'file',
      usage: 0,
      source: FileSources.local,
      filepath: '/uploads/test.pdf',
      ...overrides,
    }) as unknown as IMongoFile;

  const mockTokenCountFn = (text: string) => text.length;

  describe('when metadata is enabled', () => {
    it('should include metadata for all files', async () => {
      const files = [
        createMockFile({ filename: 'doc1.pdf', bytes: 1024 }),
        createMockFile({ filename: 'doc2.pdf', bytes: 2048 }),
      ];

      const result = await extractFileContext({
        attachments: files,
        req: {
          config: {
            fileConfig: {
              metadata: {
                enabled: true,
                fields: [FileMetadataFields.filename, FileMetadataFields.bytes],
                format: 'markdown',
              },
            },
          },
          body: { fileTokenLimit: 10000 },
        } as any,
        tokenCountFn: mockTokenCountFn,
      });

      expect(result).toContain('**filename**: doc1.pdf');
      expect(result).toContain('**filename**: doc2.pdf');
    });

    it('should combine metadata with text content', async () => {
      const files = [
        createMockFile({
          filename: 'doc.pdf',
          source: FileSources.text,
          text: 'This is the document content',
        }),
      ];

      const result = await extractFileContext({
        attachments: files,
        req: {
          config: {
            fileConfig: {
              metadata: {
                enabled: true,
                fields: [FileMetadataFields.filename],
                format: 'markdown',
              },
            },
          },
          body: { fileTokenLimit: 10000 },
        } as any,
        tokenCountFn: mockTokenCountFn,
      });

      expect(result).toContain('**filename**: doc.pdf');
      expect(result).toContain('This is the document content');
    });
  });

  describe('when metadata is disabled', () => {
    it('should only include text content without metadata', async () => {
      const files = [
        createMockFile({
          filename: 'doc.pdf',
          source: FileSources.text,
          text: 'Document content here',
        }),
      ];

      const result = await extractFileContext({
        attachments: files,
        req: {
          config: {
            fileConfig: {
              metadata: { enabled: false },
            },
          },
          body: { fileTokenLimit: 10000 },
        } as any,
        tokenCountFn: mockTokenCountFn,
      });

      expect(result).toContain('Document content here');
      expect(result).not.toContain('**File Metadata:**');
    });
  });

  describe('edge cases', () => {
    it('should return undefined for empty attachments', async () => {
      const result = await extractFileContext({
        attachments: [],
        req: {} as any,
        tokenCountFn: mockTokenCountFn,
      });

      expect(result).toBeUndefined();
    });

    it('should return undefined when no config and no text files', async () => {
      const files = [createMockFile()];

      const result = await extractFileContext({
        attachments: files,
        req: {} as any,
        tokenCountFn: mockTokenCountFn,
      });

      expect(result).toBeUndefined();
    });
  });
});
