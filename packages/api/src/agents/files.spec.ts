import {
  RemoteAgentFileError,
  remoteInlineFileSource,
  remoteInlineFileMarkerPrefix,
  extractRemoteAgentChatFiles,
  extractRemoteAgentResponseFiles,
  attachDocumentsToMessageContent,
} from './files';

const pdfData = 'data:application/pdf;base64,SGVsbG8=';
const textData = 'data:text/plain;base64,V29ybGQ=';

describe('remote agent file extraction', () => {
  describe('extractRemoteAgentChatFiles', () => {
    it('extracts a file from the latest user message and replaces it with a text marker', () => {
      const result = extractRemoteAgentChatFiles(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Read this.' },
              {
                type: 'file',
                file: {
                  filename: 'document.pdf',
                  file_data: pdfData,
                },
              },
            ],
          },
        ],
        'user-1',
      );

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({
        filename: 'document.pdf',
        filepath: '',
        source: remoteInlineFileSource,
        type: 'application/pdf',
        bytes: 5,
        object: 'file',
        usage: 1,
        user: 'user-1',
        metadata: {
          inlineBase64: 'SGVsbG8=',
        },
      });
      expect(result.files[0].file_id).toMatch(/^remote_/);
      expect(result.files[0].temp_file_id).toBe(result.files[0].file_id);
      expect(result.value[0].content).toEqual([
        { type: 'text', text: 'Read this.' },
        { type: 'text', text: `${remoteInlineFileMarkerPrefix}${result.files[0].file_id}` },
      ]);
    });

    it('extracts multiple files from the latest user message', () => {
      const result = extractRemoteAgentChatFiles([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Compare these.' },
            { type: 'file', file: { filename: 'a.pdf', file_data: pdfData } },
            { type: 'file', file: { filename: 'b.txt', file_data: textData } },
          ],
        },
      ]);

      expect(result.files.map((file) => file.filename)).toEqual(['a.pdf', 'b.txt']);
      expect(result.value[0].content).toEqual([
        { type: 'text', text: 'Compare these.' },
        { type: 'text', text: `${remoteInlineFileMarkerPrefix}${result.files[0].file_id}` },
        { type: 'text', text: `${remoteInlineFileMarkerPrefix}${result.files[1].file_id}` },
      ]);
    });

    it('rejects file parts outside the latest user message', () => {
      expect(() =>
        extractRemoteAgentChatFiles([
          {
            role: 'user',
            content: [{ type: 'file', file: { filename: 'old.pdf', file_data: pdfData } }],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Latest message.' }],
          },
        ]),
      ).toThrow(RemoteAgentFileError);
    });

    it('rejects malformed file data', () => {
      expect(() =>
        extractRemoteAgentChatFiles([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                file: {
                  filename: 'document.pdf',
                  file_data: 'SGVsbG8=',
                },
              },
            ],
          },
        ]),
      ).toThrow('File "document.pdf" must use a base64 data URL.');
    });

    it('rejects missing filename, missing MIME type, and empty base64', () => {
      expect(() =>
        extractRemoteAgentChatFiles([
          {
            role: 'user',
            content: [{ type: 'file', file: { file_data: pdfData } }],
          },
        ]),
      ).toThrow('File input requires a filename.');

      expect(() =>
        extractRemoteAgentChatFiles([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                file: { filename: 'document.pdf', file_data: 'data:;base64,SGVsbG8=' },
              },
            ],
          },
        ]),
      ).toThrow('File "document.pdf" data URL requires a MIME type.');

      expect(() =>
        extractRemoteAgentChatFiles([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                file: { filename: 'document.pdf', file_data: 'data:application/pdf;base64,' },
              },
            ],
          },
        ]),
      ).toThrow('File "document.pdf" contains empty base64 data.');
    });
  });

  describe('extractRemoteAgentResponseFiles', () => {
    it('extracts input_file parts from message items without type message', () => {
      const result = extractRemoteAgentResponseFiles(
        [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'Read this.' },
              {
                type: 'input_file',
                filename: 'document.pdf',
                file_data: pdfData,
              },
            ],
          },
        ],
        'user-1',
      );

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({
        filename: 'document.pdf',
        source: remoteInlineFileSource,
        type: 'application/pdf',
        metadata: {
          inlineBase64: 'SGVsbG8=',
        },
      });
      expect(Array.isArray(result.value)).toBe(true);
      if (Array.isArray(result.value)) {
        expect(result.value[0].type).toBe('message');
        expect(result.value[0].content).toEqual([
          { type: 'input_text', text: 'Read this.' },
          { type: 'input_text', text: `${remoteInlineFileMarkerPrefix}${result.files[0].file_id}` },
        ]);
      }
    });

    it('extracts multiple input_file parts from a typed message item', () => {
      const result = extractRemoteAgentResponseFiles([
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'Compare these.' },
            { type: 'input_file', filename: 'a.pdf', file_data: pdfData },
            { type: 'input_file', filename: 'b.txt', file_data: textData },
          ],
        },
      ]);

      expect(result.files.map((file) => file.filename)).toEqual(['a.pdf', 'b.txt']);
      expect(Array.isArray(result.value)).toBe(true);
      if (Array.isArray(result.value)) {
        expect(result.value[0].content).toEqual([
          { type: 'input_text', text: 'Compare these.' },
          { type: 'input_text', text: `${remoteInlineFileMarkerPrefix}${result.files[0].file_id}` },
          { type: 'input_text', text: `${remoteInlineFileMarkerPrefix}${result.files[1].file_id}` },
        ]);
      }
    });

    it('rejects input_file parts outside the latest user input message', () => {
      expect(() =>
        extractRemoteAgentResponseFiles([
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_file', filename: 'old.pdf', file_data: pdfData }],
          },
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Latest message.' }],
          },
        ]),
      ).toThrow(RemoteAgentFileError);
    });

    it('returns string input unchanged', () => {
      expect(extractRemoteAgentResponseFiles('Hello')).toEqual({ value: 'Hello', files: [] });
    });
  });

  describe('attachDocumentsToMessageContent', () => {
    it('replaces file markers with documents while preserving text and image order', () => {
      const image = { type: 'image_url', image_url: { url: 'https://example.com/image.png' } };
      const document = { type: 'document', source: { type: 'base64', data: 'abc' } };
      const message = {
        content: [
          { type: 'text', text: 'Look at this image first.' },
          image,
          { type: 'text', text: 'Then compare this file.' },
          { type: 'text', text: `${remoteInlineFileMarkerPrefix}remote_file_1` },
        ],
      };

      attachDocumentsToMessageContent(message, [document], 'Attached file(s): document.pdf');

      expect(message.content).toEqual([
        { type: 'text', text: 'Look at this image first.' },
        image,
        { type: 'text', text: 'Then compare this file.' },
        document,
      ]);
    });

    it('adds fallback text when the message has no real text', () => {
      const document = { type: 'document', source: { type: 'base64', data: 'abc' } };
      const message = {
        content: [{ type: 'text', text: `${remoteInlineFileMarkerPrefix}remote_file_1` }],
      };

      attachDocumentsToMessageContent(message, [document], 'Attached file(s): document.pdf');

      expect(message.content).toEqual([
        { type: 'text', text: 'Attached file(s): document.pdf' },
        document,
      ]);
    });
  });
});
