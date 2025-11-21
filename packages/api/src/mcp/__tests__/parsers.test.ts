import { formatToolContent } from '../parsers';
import type * as t from '../types';

describe('formatToolContent', () => {
  describe('unrecognized providers', () => {
    it('should return string for unrecognized provider', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          { type: 'text', text: 'Hello world' },
          { type: 'text', text: 'Another text' },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'unknown' as t.Provider);
      expect(content).toBe('Hello world\n\nAnother text');
      expect(artifacts).toBeUndefined();
    });

    it('should return "(No response)" for empty content with unrecognized provider', () => {
      const result: t.MCPToolCallResponse = { content: [] };
      const [content, artifacts] = formatToolContent(result, 'unknown' as t.Provider);
      expect(content).toBe('(No response)');
      expect(artifacts).toBeUndefined();
    });

    it('should return "(No response)" for undefined result with unrecognized provider', () => {
      const result: t.MCPToolCallResponse = undefined;
      const [content, artifacts] = formatToolContent(result, 'unknown' as t.Provider);
      expect(content).toBe('(No response)');
      expect(artifacts).toBeUndefined();
    });
  });

  describe('recognized providers - content array providers', () => {
    const contentArrayProviders: t.Provider[] = ['google', 'anthropic', 'openai', 'azureopenai'];

    contentArrayProviders.forEach((provider) => {
      describe(`${provider} provider`, () => {
        it('should format text content as content array', () => {
          const result: t.MCPToolCallResponse = {
            content: [
              { type: 'text', text: 'First text' },
              { type: 'text', text: 'Second text' },
            ],
          };

          const [content, artifacts] = formatToolContent(result, provider);
          expect(content).toEqual([{ type: 'text', text: 'First text\n\nSecond text' }]);
          expect(artifacts).toBeUndefined();
        });

        it('should separate text blocks when images are present', () => {
          const result: t.MCPToolCallResponse = {
            content: [
              { type: 'text', text: 'Before image' },
              { type: 'image', data: 'base64data', mimeType: 'image/png' },
              { type: 'text', text: 'After image' },
            ],
          };

          const [content, artifacts] = formatToolContent(result, provider);
          expect(content).toEqual([
            { type: 'text', text: 'Before image' },
            { type: 'text', text: 'After image' },
          ]);
          expect(artifacts).toEqual({
            content: [
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,base64data' },
              },
            ],
          });
        });

        it('should handle empty content', () => {
          const result: t.MCPToolCallResponse = { content: [] };
          const [content, artifacts] = formatToolContent(result, provider);
          expect(content).toEqual([{ type: 'text', text: '(No response)' }]);
          expect(artifacts).toBeUndefined();
        });
      });
    });
  });

  describe('recognized providers - string providers', () => {
    const stringProviders: t.Provider[] = ['openrouter', 'xai', 'deepseek', 'ollama', 'bedrock'];

    stringProviders.forEach((provider) => {
      describe(`${provider} provider`, () => {
        it('should format content as string', () => {
          const result: t.MCPToolCallResponse = {
            content: [
              { type: 'text', text: 'First text' },
              { type: 'text', text: 'Second text' },
            ],
          };

          const [content, artifacts] = formatToolContent(result, provider);
          expect(content).toBe('First text\n\nSecond text');
          expect(artifacts).toBeUndefined();
        });

        it('should handle images with string output', () => {
          const result: t.MCPToolCallResponse = {
            content: [
              { type: 'text', text: 'Some text' },
              { type: 'image', data: 'base64data', mimeType: 'image/png' },
            ],
          };

          const [content, artifacts] = formatToolContent(result, provider);
          expect(content).toBe('Some text');
          expect(artifacts).toEqual({
            content: [
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,base64data' },
              },
            ],
          });
        });
      });
    });
  });

  describe('image handling', () => {
    it('should handle images with http URLs', () => {
      const result: t.MCPToolCallResponse = {
        content: [{ type: 'image', data: 'https://example.com/image.png', mimeType: 'image/png' }],
      };

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_content, artifacts] = formatToolContent(result, 'openai');
      expect(artifacts).toEqual({
        content: [
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/image.png' },
          },
        ],
      });
    });

    it('should handle images with base64 data', () => {
      const result: t.MCPToolCallResponse = {
        content: [{ type: 'image', data: 'iVBORw0KGgoAAAA...', mimeType: 'image/png' }],
      };

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_content, artifacts] = formatToolContent(result, 'openai');
      expect(artifacts).toEqual({
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAA...' },
          },
        ],
      });
    });
  });

  describe('resource handling', () => {
    it('should handle UI resources in artifacts', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'ui://carousel',
              mimeType: 'application/json',
              text: '{"items": []}',
              name: 'carousel',
              description: 'A carousel component',
            },
          },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');
      expect(content).toEqual([
        {
          type: 'text',
          text:
            'Resource Text: {"items": []}\n' +
            'Resource URI: ui://carousel\n' +
            'Resource: carousel\n' +
            'Resource Description: A carousel component\n' +
            'Resource MIME Type: application/json',
        },
      ]);
      expect(artifacts).toEqual({
        ui_resources: {
          data: [
            {
              uri: 'ui://carousel',
              mimeType: 'application/json',
              text: '{"items": []}',
              name: 'carousel',
              description: 'A carousel component',
            },
          ],
        },
      });
    });

    it('should handle regular resources', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'file://document.pdf',
              name: 'Document',
              description: 'Important document',
              mimeType: 'application/pdf',
              text: 'Document content',
            },
          },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');
      expect(content).toEqual([
        {
          type: 'text',
          text:
            'Resource Text: Document content\n' +
            'Resource URI: file://document.pdf\n' +
            'Resource: Document\n' +
            'Resource Description: Important document\n' +
            'Resource MIME Type: application/pdf',
        },
      ]);
      expect(artifacts).toBeUndefined();
    });

    it('should handle resources with partial data', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'https://example.com/resource',
              name: 'Example Resource',
              text: '',
            },
          },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');
      expect(content).toEqual([
        {
          type: 'text',
          text: 'Resource URI: https://example.com/resource\n' + 'Resource: Example Resource',
        },
      ]);
      expect(artifacts).toBeUndefined();
    });

    it('should handle mixed UI and regular resources', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          { type: 'text', text: 'Some text' },
          {
            type: 'resource',
            resource: {
              uri: 'ui://button',
              mimeType: 'application/json',
              text: '{"label": "Click me"}',
            },
          },
          {
            type: 'resource',
            resource: {
              uri: 'file://data.csv',
              name: 'Data file',
              text: '',
            },
          },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');
      expect(content).toEqual([
        {
          type: 'text',
          text:
            'Some text\n\n' +
            'Resource Text: {"label": "Click me"}\n' +
            'Resource URI: ui://button\n' +
            'Resource MIME Type: application/json\n\n' +
            'Resource URI: file://data.csv\n' +
            'Resource: Data file',
        },
      ]);
      expect(artifacts).toEqual({
        ui_resources: {
          data: [
            {
              uri: 'ui://button',
              mimeType: 'application/json',
              text: '{"label": "Click me"}',
            },
          ],
        },
      });
    });

    it('should handle both images and UI resources in artifacts', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          { type: 'text', text: 'Content with multimedia' },
          { type: 'image', data: 'base64imagedata', mimeType: 'image/png' },
          {
            type: 'resource',
            resource: {
              uri: 'ui://graph',
              mimeType: 'application/json',
              text: '{"type": "line"}',
            },
          },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');
      expect(content).toEqual([
        {
          type: 'text',
          text: 'Content with multimedia',
        },
        {
          type: 'text',
          text:
            'Resource Text: {"type": "line"}\n' +
            'Resource URI: ui://graph\n' +
            'Resource MIME Type: application/json',
        },
      ]);
      expect(artifacts).toEqual({
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,base64imagedata' },
          },
        ],
        ui_resources: {
          data: [
            {
              uri: 'ui://graph',
              mimeType: 'application/json',
              text: '{"type": "line"}',
            },
          ],
        },
      });
    });
  });

  describe('unknown content types', () => {
    it('should stringify unknown content types', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          { type: 'text', text: 'Normal text' },
          { type: 'unknown', data: 'some data' } as unknown as t.ToolContentPart,
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');
      expect(content).toEqual([
        {
          type: 'text',
          text: 'Normal text\n\n' + JSON.stringify({ type: 'unknown', data: 'some data' }, null, 2),
        },
      ]);
      expect(artifacts).toBeUndefined();
    });
  });

  describe('complex scenarios', () => {
    it('should handle mixed content with all types', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          { type: 'text', text: 'Introduction' },
          { type: 'image', data: 'image1.png', mimeType: 'image/png' },
          { type: 'text', text: 'Middle section' },
          {
            type: 'resource',
            resource: {
              uri: 'ui://chart',
              mimeType: 'application/json',
              text: '{"type": "bar"}',
            },
          },
          {
            type: 'resource',
            resource: {
              uri: 'https://api.example.com/data',
              name: 'API Data',
              description: 'External data source',
              text: '',
            },
          },
          { type: 'image', data: 'https://example.com/image2.jpg', mimeType: 'image/jpeg' },
          { type: 'text', text: 'Conclusion' },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'anthropic');
      expect(content).toEqual([
        { type: 'text', text: 'Introduction' },
        {
          type: 'text',
          text:
            'Middle section\n\n' +
            'Resource Text: {"type": "bar"}\n' +
            'Resource URI: ui://chart\n' +
            'Resource MIME Type: application/json\n\n' +
            'Resource URI: https://api.example.com/data\n' +
            'Resource: API Data\n' +
            'Resource Description: External data source',
        },
        { type: 'text', text: 'Conclusion' },
      ]);
      expect(artifacts).toEqual({
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,image1.png' },
          },
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/image2.jpg' },
          },
        ],
        ui_resources: {
          data: [
            {
              uri: 'ui://chart',
              mimeType: 'application/json',
              text: '{"type": "bar"}',
            },
          ],
        },
      });
    });

    it('should handle error responses gracefully', () => {
      const result: t.MCPToolCallResponse = {
        content: [{ type: 'text', text: 'Error occurred' }],
        isError: true,
      };

      const [content, artifacts] = formatToolContent(result, 'openai');
      expect(content).toEqual([{ type: 'text', text: 'Error occurred' }]);
      expect(artifacts).toBeUndefined();
    });

    it('should handle metadata in responses', () => {
      const result: t.MCPToolCallResponse = {
        _meta: { timestamp: Date.now(), source: 'test' },
        content: [{ type: 'text', text: 'Response with metadata' }],
      };

      const [content, artifacts] = formatToolContent(result, 'google');
      expect(content).toEqual([{ type: 'text', text: 'Response with metadata' }]);
      expect(artifacts).toBeUndefined();
    });
  });
});
