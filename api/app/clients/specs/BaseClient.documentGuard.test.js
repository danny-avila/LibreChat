const BaseClient = require('../BaseClient');
const { EModelEndpoint } = require('librechat-data-provider');

describe('BaseClient - Document Guard', () => {
  let client;

  beforeEach(() => {
    client = new BaseClient('testApiKey', {
      endpoint: EModelEndpoint.agents,
      req: { config: {}, user: { id: 'test-user' } },
    });
  });

  describe('validateDocumentsBeforeCompletion', () => {
    it('should pass when payload has no documents', () => {
      const payload = [
        {
          role: 'user',
          content: 'Hello',
        },
      ];

      expect(() => client.validateDocumentsBeforeCompletion(payload)).not.toThrow();
    });

    it('should pass when payload is a string', () => {
      const payload = 'Hello world';

      expect(() => client.validateDocumentsBeforeCompletion(payload)).not.toThrow();
    });

    it('should pass when documents array is empty', () => {
      const payload = [
        {
          role: 'user',
          content: 'Hello',
          documents: [],
        },
      ];

      expect(() => client.validateDocumentsBeforeCompletion(payload)).not.toThrow();
    });

    it('should BLOCK when document contains file.file_data (OpenAI-like format)', () => {
      const payload = [
        {
          role: 'user',
          content: 'Check this document',
          documents: [
            {
              type: 'file',
              file: {
                filename: 'test.pdf',
                file_data: 'data:application/pdf;base64,JVBERi0xLjcNCg==',
              },
            },
          ],
        },
      ];

      expect(() => client.validateDocumentsBeforeCompletion(payload)).toThrow(
        /Document "test\.pdf" contains raw binary data/,
      );
    });

    it('should BLOCK when document contains file_data field directly', () => {
      const payload = [
        {
          role: 'user',
          content: 'Check this document',
          documents: [
            {
              type: 'input_file',
              filename: 'test.pdf',
              file_data: 'data:application/pdf;base64,JVBERi0xLjcNCg==',
            },
          ],
        },
      ];

      expect(() => client.validateDocumentsBeforeCompletion(payload)).toThrow(
        /Document contains raw base64 data/,
      );
    });

    it('should BLOCK when document contains data field (base64)', () => {
      const payload = [
        {
          role: 'user',
          content: 'Check this document',
          documents: [
            {
              type: 'media',
              mimeType: 'application/pdf',
              data: 'JVBERi0xLjcNCg==',
            },
          ],
        },
      ];

      expect(() => client.validateDocumentsBeforeCompletion(payload)).toThrow(
        /Document contains raw base64 data/,
      );
    });

    it('should pass when document uses Anthropic document block format (allowed for Anthropic)', () => {
      const payload = [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: 'JVBERi0xLjcNCg==',
              },
            },
          ],
        },
      ];

      // This format doesn't have file.file_data, so it passes the guard
      // (Anthropic native format is handled differently)
      expect(() => client.validateDocumentsBeforeCompletion(payload)).not.toThrow();
    });

    it('should provide clear error message with filename when blocking', () => {
      const payload = [
        {
          role: 'user',
          content: 'Check this',
          documents: [
            {
              type: 'file',
              file: {
                filename: 'important-report.pdf',
                file_data: 'data:application/pdf;base64,ABC123',
              },
            },
          ],
        },
      ];

      expect(() => client.validateDocumentsBeforeCompletion(payload)).toThrow(
        /important-report\.pdf.*contains raw binary data.*must be parsed to text/i,
      );
    });
  });
});
