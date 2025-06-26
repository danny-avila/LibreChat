const { sanitizeFilename } = require('@librechat/api');

// Test the wrapper function directly
const createSanitizedUploadWrapper = (uploadFunction) => {
  return async (params) => {
    const { req, file, file_id, ...restParams } = params;
    const sanitizedFile = {
      ...file,
      originalname: sanitizeFilename(file.originalname),
    };
    return uploadFunction({ req, file: sanitizedFile, file_id, ...restParams });
  };
};

describe('File Processing - Filename Sanitization', () => {
  describe('Core sanitization behavior', () => {
    it('should fix the original DOCX space issue', () => {
      const result = sanitizeFilename('Databricks AI and ML Feature showcase.docx');
      expect(result).toBe('Databricks_AI_and_ML_Feature_showcase.docx');
      expect(result).not.toContain(' ');
    });

    it('should handle basic filenames with spaces', () => {
      const result = sanitizeFilename('My Document.pdf');
      expect(result).toBe('My_Document.pdf');
      expect(result).not.toContain(' ');
    });

    it('should preserve file extensions', () => {
      const testFiles = [
        'test.pdf',
        'document.docx',
        'spreadsheet.xlsx',
        'image.jpg',
        'archive.zip',
      ];

      testFiles.forEach((filename) => {
        const result = sanitizeFilename(filename);
        const originalExt = filename.split('.').pop();
        expect(result).toMatch(new RegExp(`\\.${originalExt}$`));
      });
    });
  });

  describe('createSanitizedUploadWrapper', () => {
    it('should sanitize filenames in upload parameters', async () => {
      const mockUpload = jest.fn().mockResolvedValue({
        filepath: 'test-url',
        bytes: 1024,
      });

      const wrappedUpload = createSanitizedUploadWrapper(mockUpload);

      const params = {
        req: { user: { id: 'user-123' } },
        file: {
          originalname: 'Databricks AI and ML Feature showcase.docx',
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        file_id: 'file-456',
      };

      await wrappedUpload(params);

      expect(mockUpload).toHaveBeenCalledWith({
        req: params.req,
        file: {
          ...params.file,
          originalname: 'Databricks_AI_and_ML_Feature_showcase.docx',
        },
        file_id: params.file_id,
      });
    });

    it('should pass through all other parameters', async () => {
      const mockUpload = jest.fn().mockResolvedValue({ filepath: 'test' });
      const wrappedUpload = createSanitizedUploadWrapper(mockUpload);

      const params = {
        req: { user: { id: 'user' } },
        file: { originalname: 'test file.txt' },
        file_id: 'file-id',
        basePath: 'uploads',
        entity_id: 'agent-123',
        customParam: 'value',
      };

      await wrappedUpload(params);

      const call = mockUpload.mock.calls[0][0];
      expect(call.basePath).toBe('uploads');
      expect(call.entity_id).toBe('agent-123');
      expect(call.customParam).toBe('value');
    });
  });

  describe('S3 key generation consistency', () => {
    it('should ensure S3 keys work with sanitized filenames', () => {
      const userId = 'user-123';
      const fileId = 'file-456';
      const basePath = 'uploads';
      const originalFilename = 'My Document.pdf';

      const sanitizedFilename = sanitizeFilename(originalFilename);
      const localPath = `${basePath}/${userId}/${fileId}__${sanitizedFilename}`;

      expect(localPath).toBe('uploads/user-123/file-456__My_Document.pdf');
      expect(localPath).not.toContain(' ');
    });

    it('should prevent NoSuchKey errors', () => {
      const filenames = [
        'Databricks AI and ML Feature showcase.docx',
        'Document with spaces.pdf',
        'File   with   multiple   spaces.txt',
      ];

      filenames.forEach((filename) => {
        const sanitized = sanitizeFilename(filename);
        const localPath = `uploads/user/file__${sanitized}`;

        expect(localPath).not.toContain(' ');
        expect(localPath).toMatch(/^uploads\/user\/file__[\w\-_.]+$/);
      });
    });
  });
});
