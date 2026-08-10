import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { isMcpAppMimeType, MCP_APP_MIME_TYPE } from 'librechat-data-provider';
import type * as t from '../types';
import { formatToolContent } from '../parsers';

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

    it('should preserve the image payload in the string for unrecognized providers', () => {
      const result: t.MCPToolCallResponse = {
        content: [{ type: 'image', data: 'iVBORw0KGgoAAAA...', mimeType: 'image/png' }],
      };

      const [content, artifacts] = formatToolContent(result, 'unknown' as t.Provider);

      expect(artifacts).toBeUndefined();
      expect(content).toContain('iVBORw0KGgoAAAA...');
      expect(content).toContain('image/png');
    });
  });

  describe('recognized providers', () => {
    const allProviders: t.Provider[] = [
      'google',
      'anthropic',
      'openai',
      'azureopenai',
      'openrouter',
      'xai',
      'deepseek',
      'ollama',
      'bedrock',
    ];

    allProviders.forEach((provider) => {
      describe(`${provider} provider`, () => {
        it('should format text content as string', () => {
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

        it('should extract images to artifacts and keep text as string', () => {
          const result: t.MCPToolCallResponse = {
            content: [
              { type: 'text', text: 'Before image' },
              { type: 'image', data: 'base64data', mimeType: 'image/png' },
              { type: 'text', text: 'After image' },
            ],
          };

          const [content, artifacts] = formatToolContent(result, provider);
          expect(content).toBe('Before image\n\nAfter image');
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
          expect(content).toBe('(No response)');
          expect(artifacts).toBeUndefined();
        });
      });
    });
  });

  describe('image handling', () => {
    const originalMaxImageBytes = process.env.MCP_IMAGE_DATA_MAX_BYTES;

    afterEach(() => {
      if (originalMaxImageBytes === undefined) {
        delete process.env.MCP_IMAGE_DATA_MAX_BYTES;
        return;
      }
      process.env.MCP_IMAGE_DATA_MAX_BYTES = originalMaxImageBytes;
    });

    it('should handle images with http URLs', () => {
      const result: t.MCPToolCallResponse = {
        content: [{ type: 'image', data: 'https://example.com/image.png', mimeType: 'image/png' }],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');
      expect(content).toBe('');
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

      const [content, artifacts] = formatToolContent(result, 'openai');
      expect(content).toBe('');
      expect(artifacts).toEqual({
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAA...' },
          },
        ],
      });
    });

    it('should return empty string for image-only content when artifacts exist', () => {
      const result: t.MCPToolCallResponse = {
        content: [{ type: 'image', data: 'base64data', mimeType: 'image/png' }],
      };
      const [content, artifacts] = formatToolContent(result, 'anthropic');
      expect(content).toBe('');
      expect(artifacts).toBeDefined();
      expect(artifacts?.content).toHaveLength(1);
    });

    it('should handle multiple images without text', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          { type: 'image', data: 'https://example.com/a.png', mimeType: 'image/png' },
          { type: 'image', data: 'https://example.com/b.jpg', mimeType: 'image/jpeg' },
        ],
      };
      const [content, artifacts] = formatToolContent(result, 'google');
      expect(content).toBe('');
      expect(artifacts).toBeDefined();
      expect(artifacts?.content).toHaveLength(2);
    });

    it('should reject oversized base64 image data before creating artifacts', () => {
      process.env.MCP_IMAGE_DATA_MAX_BYTES = '3';
      const result: t.MCPToolCallResponse = {
        content: [{ type: 'image', data: 'QUJDRA==', mimeType: 'image/png' }],
      };

      expect(() => formatToolContent(result, 'openai')).toThrow(
        'MCP image result exceeds maximum size of 3 bytes',
      );
    });

    it('should allow base64 image data when decoded size is within the cap', () => {
      process.env.MCP_IMAGE_DATA_MAX_BYTES = '4';
      const result: t.MCPToolCallResponse = {
        content: [{ type: 'image', data: 'QUJDRA==', mimeType: 'image/png' }],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');

      expect(content).toBe('');
      expect(artifacts?.content?.[0]).toEqual({
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,QUJDRA==' },
      });
    });

    it('should reject oversized image data for unrecognized providers before stringifying', () => {
      process.env.MCP_IMAGE_DATA_MAX_BYTES = '3';
      const result: t.MCPToolCallResponse = {
        content: [{ type: 'image', data: 'QUJDRA==', mimeType: 'image/png' }],
      };

      expect(() => formatToolContent(result, 'unknown' as t.Provider)).toThrow(
        'MCP image result exceeds maximum size of 3 bytes',
      );
    });

    it('should not apply the image data cap to remote image URLs', () => {
      process.env.MCP_IMAGE_DATA_MAX_BYTES = '3';
      const result: t.MCPToolCallResponse = {
        content: [{ type: 'image', data: 'https://example.com/large.png', mimeType: 'image/png' }],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');

      expect(content).toBe('');
      expect(artifacts?.content?.[0]).toEqual({
        type: 'image_url',
        image_url: { url: 'https://example.com/large.png' },
      });
    });

    it('should enforce the image cap on base64 data that merely starts with "http"', () => {
      process.env.MCP_IMAGE_DATA_MAX_BYTES = '3';
      const result: t.MCPToolCallResponse = {
        content: [{ type: 'image', data: 'httpAAAAAAAA', mimeType: 'image/png' }],
      };

      expect(() => formatToolContent(result, 'openai')).toThrow(
        'MCP image result exceeds maximum size of 3 bytes',
      );
    });

    it('should treat base64 starting with "http" as inline data, not a remote URL', () => {
      const result: t.MCPToolCallResponse = {
        content: [{ type: 'image', data: 'httpAAAA', mimeType: 'image/png' }],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');

      expect(content).toBe('');
      expect(artifacts?.content?.[0]).toEqual({
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,httpAAAA' },
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
              mimeType: 'text/html;profile=mcp-app',
              text: '<div>carousel</div>',
            },
          },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');
      expect(typeof content).toBe('string');
      expect(content).toContain('UI Resource ID:');
      expect(content).toContain('UI Resource Marker: \\ui{');
      expect(content).toContain('Resource URI: ui://carousel');
      expect(content).toContain('Resource MIME Type: text/html;profile=mcp-app');

      const uiResourceArtifact = artifacts?.ui_resources?.data?.[0];
      expect(uiResourceArtifact).toBeTruthy();
      expect(uiResourceArtifact).toMatchObject({
        uri: 'ui://carousel',
        mimeType: 'text/html;profile=mcp-app',
        text: '<div>carousel</div>',
      });
      expect(uiResourceArtifact?.resourceId).toEqual(expect.any(String));
    });

    it('treats non-HTML ui:// resources as plain text rather than renderable markers', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'ui://legacy',
              mimeType: 'application/json',
              text: '{"items": []}',
            },
          },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');
      expect(content).toContain('Resource Text: {"items": []}');
      expect(content).toContain('Resource URI: ui://legacy');
      expect(content).not.toContain('UI Resource Marker:');
      expect(artifacts).toBeUndefined();
    });

    it('attaches the tool result to embedded mcp-app resources for the app bridge', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'ui://app',
              mimeType: 'text/html;profile=mcp-app',
              text: '<p>hi</p>',
            },
          },
        ],
        structuredContent: { count: 3 },
        isError: false,
      };

      const [, artifacts] = formatToolContent(result, 'openai', {
        serverName: 'srv',
        toolName: 'do_thing',
      });

      const uiResourceArtifact = artifacts?.ui_resources?.data?.[0];
      expect(uiResourceArtifact).toMatchObject({
        uri: 'ui://app',
        serverName: 'srv',
        toolName: 'do_thing',
        structuredContent: { count: 3 },
      });
      // The shared result snapshot keeps the resource reference and an empty carrier key but not the
      // body (see the no-duplication test below); the app's own html stays on the resource itself.
      // The empty key is required: a resource with neither text nor blob fails CallToolResultSchema,
      // so the app bridge would reject the whole result instead of dispatching ontoolresult.
      expect(uiResourceArtifact?.content).toEqual([
        {
          type: 'resource',
          resource: { uri: 'ui://app', mimeType: 'text/html;profile=mcp-app', text: '' },
        },
      ]);
      expect(CallToolResultSchema.safeParse({ content: uiResourceArtifact?.content }).success).toBe(
        true,
      );
      expect(uiResourceArtifact?.text).toBe('<p>hi</p>');
    });

    it('renders a plain text/html ui:// resource statically without app-bridge metadata', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: { uri: 'ui://static', mimeType: 'text/html', text: '<p>hi</p>' },
          },
        ],
        structuredContent: { count: 3 },
      };

      const [content, artifacts] = formatToolContent(result, 'openai', {
        serverName: 'srv',
        toolName: 'do_thing',
      });

      const uiResourceArtifact = artifacts?.ui_resources?.data?.[0];
      expect(content).toContain('UI Resource Marker:');
      expect(uiResourceArtifact).toMatchObject({ uri: 'ui://static' });
      expect(uiResourceArtifact?.serverName).toBeUndefined();
      expect(uiResourceArtifact?.toolName).toBeUndefined();
      expect(uiResourceArtifact?.structuredContent).toBeUndefined();
      expect(uiResourceArtifact?.resultMeta).toBeUndefined();
    });

    it('still synthesizes the tool-declared app when the result returns a different ui:// resource', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'ui://chart',
              mimeType: 'text/html;profile=mcp-app',
              text: '<p>c</p>',
            },
          },
        ],
      };

      const [, artifacts] = formatToolContent(result, 'openai', {
        serverName: 'srv',
        toolName: 'do_thing',
        resourceUri: 'ui://app',
      });

      const uris = (artifacts?.ui_resources?.data ?? []).map((r) => r.uri);
      expect(uris).toContain('ui://chart');
      expect(uris).toContain('ui://app');
    });

    it('does not double-synthesize when the returned resource is the declared app', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: { uri: 'ui://app', mimeType: 'text/html;profile=mcp-app', text: '<p>a</p>' },
          },
        ],
      };

      const [, artifacts] = formatToolContent(result, 'openai', {
        serverName: 'srv',
        toolName: 'do_thing',
        resourceUri: 'ui://app',
      });

      const uris = (artifacts?.ui_resources?.data ?? []).map((r) => r.uri);
      expect(uris).toEqual(['ui://app']);
    });

    it('does not copy every embedded app body into each app resource result', () => {
      const bigA = 'A'.repeat(5000);
      const bigB = 'B'.repeat(5000);
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: { uri: 'ui://a', mimeType: 'text/html;profile=mcp-app', text: bigA },
          },
          {
            type: 'resource',
            resource: { uri: 'ui://b', mimeType: 'text/html;profile=mcp-app', text: bigB },
          },
        ],
      };

      const [, artifacts] = formatToolContent(result, 'openai', {
        serverName: 'srv',
        toolName: 'do_thing',
      });

      const data = artifacts?.ui_resources?.data ?? [];
      expect(data).toHaveLength(2);
      // Each app keeps its OWN html...
      expect(data[0].text).toBe(bigA);
      expect(data[1].text).toBe(bigB);
      // ...but the shared result snapshot carries no resource bodies, so N apps do not persist N
      // copies of every app's html.
      for (const resource of data) {
        const snapshot = JSON.stringify(resource.content ?? []);
        expect(snapshot).not.toContain(bigA);
        expect(snapshot).not.toContain(bigB);
        expect(snapshot).toContain('ui://a');
      }
    });

    it('suppresses embedded ui:// resources when apps are disabled for the scope', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: { uri: 'ui://app', mimeType: 'text/html', text: '<p>hi</p>' },
          },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'openai', {
        serverName: 'srv',
        toolName: 'do_thing',
        enableApps: false,
      });

      expect(artifacts?.ui_resources).toBeUndefined();
      expect(content).toContain('Resource URI: ui://app');
      expect(content).not.toContain('UI Resource Marker:');
    });

    it('does not synthesize the tool-declared app when apps are disabled for the scope', () => {
      const result: t.MCPToolCallResponse = { content: [{ type: 'text', text: 'done' }] };

      const [content, artifacts] = formatToolContent(result, 'openai', {
        serverName: 'srv',
        toolName: 'do_thing',
        resourceUri: 'ui://app',
        enableApps: false,
      });

      expect(artifacts?.ui_resources).toBeUndefined();
      expect(content).toBe('done');
    });

    it('does not synthesize an app for an empty declared resourceUri', () => {
      const result: t.MCPToolCallResponse = { content: [{ type: 'text', text: 'done' }] };

      const [, artifacts] = formatToolContent(result, 'openai', {
        serverName: 'srv',
        toolName: 'do_thing',
        resourceUri: '',
      });

      expect(artifacts?.ui_resources).toBeUndefined();
    });

    it('gives embedded ui:// resources distinct ids per tool result payload', () => {
      const resourceIdFor = (sc: Record<string, unknown>) =>
        formatToolContent(
          {
            content: [
              {
                type: 'resource',
                resource: { uri: 'ui://app', mimeType: 'text/html', text: '<p>same</p>' },
              },
            ],
            structuredContent: sc,
          } as t.MCPToolCallResponse,
          'openai',
          { serverName: 'srv', toolName: 'do_thing' },
        )[1]?.ui_resources?.data?.[0]?.resourceId;

      expect(resourceIdFor({ a: 1 })).not.toEqual(resourceIdFor({ a: 2 }));
    });

    it('should handle regular resources', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'file://document.pdf',
              mimeType: 'application/pdf',
              text: 'Document content',
            },
          },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');
      expect(content).toBe(
        'Resource Text: Document content\n' +
          'Resource URI: file://document.pdf\n' +
          'Resource MIME Type: application/pdf',
      );
      expect(artifacts).toBeUndefined();
    });

    it('should handle resources with partial data', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'https://example.com/resource',
              text: '',
            },
          },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');
      expect(content).toBe('Resource URI: https://example.com/resource');
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
              mimeType: 'text/html;profile=mcp-app',
              text: '<button>Click me</button>',
            },
          },
          {
            type: 'resource',
            resource: {
              uri: 'file://data.csv',
              text: '',
            },
          },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');
      expect(typeof content).toBe('string');
      expect(content).toContain('Some text');
      expect(content).toContain('UI Resource Marker: \\ui{');
      expect(content).toContain('Resource URI: ui://button');
      expect(content).toContain('Resource MIME Type: text/html;profile=mcp-app');
      expect(content).toContain('Resource URI: file://data.csv');

      const uiResource = artifacts?.ui_resources?.data?.[0];
      expect(uiResource).toMatchObject({
        uri: 'ui://button',
        mimeType: 'text/html;profile=mcp-app',
        text: '<button>Click me</button>',
      });
      expect(uiResource?.resourceId).toEqual(expect.any(String));
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
              mimeType: 'text/html;profile=mcp-app',
              text: '<svg>graph</svg>',
            },
          },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'openai');
      expect(typeof content).toBe('string');
      expect(content).toContain('Content with multimedia');
      expect(content).toContain('UI Resource Marker: \\ui{');
      expect(content).toContain('Resource URI: ui://graph');
      expect(content).toContain('Resource MIME Type: text/html;profile=mcp-app');
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
              mimeType: 'text/html;profile=mcp-app',
              text: '<svg>graph</svg>',
              resourceId: expect.any(String),
            },
          ],
        },
      });
    });

    it('does not attach bridge fields to an app-profile resource with no server or tool context', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: { uri: 'ui://graph', mimeType: MCP_APP_MIME_TYPE, text: '<p>g</p>' },
          },
        ],
        structuredContent: { a: 1 },
      };

      const [, artifacts] = formatToolContent(result, 'openai', { toolName: 'do_thing' });
      const uiResource = artifacts?.ui_resources?.data?.[0];

      expect(uiResource?.serverName).toBeUndefined();
      expect(uiResource?.toolName).toBeUndefined();
      expect(uiResource?.content).toBeUndefined();
      expect(uiResource?.structuredContent).toBeUndefined();
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
      expect(content).toBe(
        'Normal text\n\n' + JSON.stringify({ type: 'unknown', data: 'some data' }, null, 2),
      );
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
              mimeType: 'text/html;profile=mcp-app',
              text: '<svg>chart</svg>',
            },
          },
          {
            type: 'resource',
            resource: {
              uri: 'https://api.example.com/data',
              text: '',
            },
          },
          { type: 'image', data: 'https://example.com/image2.jpg', mimeType: 'image/jpeg' },
          { type: 'text', text: 'Conclusion' },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'anthropic');
      expect(typeof content).toBe('string');
      expect(content).toContain('Introduction');
      expect(content).toContain('Middle section');
      expect(content).toContain('UI Resource ID:');
      expect(content).toContain('UI Resource Marker: \\ui{');
      expect(content).toContain('Resource URI: ui://chart');
      expect(content).toContain('Resource MIME Type: text/html;profile=mcp-app');
      expect(content).toContain('Resource URI: https://api.example.com/data');
      expect(content).toContain('Conclusion');
      expect(content).toContain('UI Resource Markers Available:');
      expect(artifacts).toMatchObject({
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
              mimeType: 'text/html;profile=mcp-app',
              text: '<svg>chart</svg>',
              resourceId: expect.any(String),
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
      expect(content).toBe('Error occurred');
      expect(artifacts).toBeUndefined();
    });

    it('should handle metadata in responses', () => {
      const result: t.MCPToolCallResponse = {
        _meta: { timestamp: Date.now(), source: 'test' },
        content: [{ type: 'text', text: 'Response with metadata' }],
      };

      const [content, artifacts] = formatToolContent(result, 'google');
      expect(content).toBe('Response with metadata');
      expect(artifacts).toBeUndefined();
    });
  });

  describe('MCP apps on unrecognized providers', () => {
    it('extracts an embedded app resource instead of dumping its html into the model text', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          { type: 'text', text: 'ok' },
          {
            type: 'resource',
            resource: {
              uri: 'ui://s/app',
              mimeType: 'text/html;profile=mcp-app',
              text: '<html>SECRET_BODY</html>',
            },
          },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'vertexai' as t.Provider, {
        serverName: 's',
        toolName: 't',
        toolArgs: { a: 1 },
      });

      const data = artifacts?.ui_resources?.data ?? [];
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({ uri: 'ui://s/app', serverName: 's', toolName: 't' });
      expect(data[0].content).toEqual(expect.any(Array));
      expect(content).toMatch(/UI Resource Marker: \\ui\{[a-f0-9]{10}\}/);
      expect(content).not.toContain('SECRET_BODY');
    });

    it('synthesizes the tool-declared app for an unrecognized provider', () => {
      const [, artifacts] = formatToolContent(
        { content: [{ type: 'text', text: 'done' }] },
        'vertexai' as t.Provider,
        { serverName: 's', toolName: 't', resourceUri: 'ui://s/app' },
      );

      expect(artifacts?.ui_resources?.data).toMatchObject([
        { uri: 'ui://s/app', mimeType: 'text/html;profile=mcp-app' },
      ]);
    });

    it('keeps the plain string output when apps are disabled for the scope', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: { uri: 'ui://app', mimeType: 'text/html;profile=mcp-app', text: '<p>hi</p>' },
          },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'vertexai' as t.Provider, {
        serverName: 's',
        toolName: 't',
        enableApps: false,
      });

      expect(artifacts).toBeUndefined();
      // Suppressing the app must not paste a whole untrusted HTML document into model context: the
      // pre-apps baseline never carried one, and the document is meant for the sandbox.
      expect(content).toBe('Resource URI: ui://app\nType: text/html;profile=mcp-app');
      expect(content).not.toContain('<p>hi</p>');
    });

    it('leaves images stringified in the text when an app widens the extraction path', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          { type: 'image', data: 'base64data', mimeType: 'image/png' },
          {
            type: 'resource',
            resource: { uri: 'ui://app', mimeType: 'text/html;profile=mcp-app', text: '<p>a</p>' },
          },
        ],
      };

      const [content, artifacts] = formatToolContent(result, 'vertexai' as t.Provider, {
        serverName: 's',
        toolName: 't',
      });

      expect(artifacts?.ui_resources).toBeDefined();
      expect(artifacts?.content).toBeUndefined();
      expect(content).toContain('base64data');
    });

    it('extracts a non-app ui:// resource without app-bridge metadata', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: { uri: 'ui://s/doc', mimeType: 'text/html', text: '<p>doc</p>' },
          },
        ],
      };

      const [, artifacts] = formatToolContent(result, 'vertexai' as t.Provider, {
        serverName: 's',
        toolName: 't',
      });

      const resource = artifacts?.ui_resources?.data?.[0];
      expect(resource).toMatchObject({ uri: 'ui://s/doc', mimeType: 'text/html' });
      expect(resource?.serverName).toBeUndefined();
      expect(resource?.toolName).toBeUndefined();
      expect(resource?.content).toBeUndefined();
    });
  });

  describe('un-profiled echo of the tool-declared app uri', () => {
    const echoResult = (resource: Record<string, unknown>): t.MCPToolCallResponse => ({
      content: [{ type: 'resource', resource } as t.ToolContentPart],
    });

    const appMetadata = { serverName: 'srv', toolName: 'do_thing', resourceUri: 'ui://app' };

    it('drops the static echo and renders only the declared app', () => {
      const [content, artifacts] = formatToolContent(
        echoResult({ uri: 'ui://app', mimeType: 'text/html', text: '<p>static</p>' }),
        'openai',
        appMetadata,
      );

      const data = artifacts?.ui_resources?.data ?? [];
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        uri: 'ui://app',
        mimeType: 'text/html;profile=mcp-app',
        serverName: 'srv',
        toolName: 'do_thing',
      });
      expect(content.match(/UI Resource Marker:/g)).toHaveLength(1);
      expect(content).toContain('Resource URI: ui://app');
      expect(content).not.toContain('Resource Text:');
      expect(content).not.toContain('<p>static</p>');
    });

    it('drops the echo when its mime type is omitted entirely', () => {
      const [content, artifacts] = formatToolContent(
        echoResult({ uri: 'ui://app', text: '<p>static</p>' }),
        'openai',
        appMetadata,
      );

      const data = artifacts?.ui_resources?.data ?? [];
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({ uri: 'ui://app', mimeType: 'text/html;profile=mcp-app' });
      expect(content).not.toContain('<p>static</p>');
    });

    it('renders the declared app when the echo carries no body at all', () => {
      const [, artifacts] = formatToolContent(
        echoResult({ uri: 'ui://app', mimeType: 'text/html' }),
        'openai',
        appMetadata,
      );

      const data = artifacts?.ui_resources?.data ?? [];
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        uri: 'ui://app',
        mimeType: 'text/html;profile=mcp-app',
        serverName: 'srv',
        toolName: 'do_thing',
      });
    });

    it('produces the same artifact on an unrecognized provider', () => {
      const resource = { uri: 'ui://app', mimeType: 'text/html', text: '<p>static</p>' };
      const [, recognized] = formatToolContent(echoResult(resource), 'openai', appMetadata);
      const [, unrecognized] = formatToolContent(
        echoResult(resource),
        'vertexai' as t.Provider,
        appMetadata,
      );

      expect(unrecognized?.ui_resources).toEqual(recognized?.ui_resources);
    });

    it('keeps a different un-profiled ui:// resource alongside the declared app', () => {
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: { uri: 'ui://chart', mimeType: 'text/html', text: '<p>chart</p>' },
          },
        ],
      };

      const [, artifacts] = formatToolContent(result, 'openai', appMetadata);

      const data = artifacts?.ui_resources?.data ?? [];
      expect(data).toHaveLength(2);
      const chart = data.find((resource) => resource.uri === 'ui://chart');
      expect(chart).toMatchObject({ mimeType: 'text/html' });
      expect(chart?.serverName).toBeUndefined();
      expect(chart?.toolName).toBeUndefined();
      expect(data.some((resource) => resource.uri === 'ui://app')).toBe(true);
    });

    it('does not persist an embedded body on the synthesized app', () => {
      const body = 'A'.repeat(5000);
      const [, artifacts] = formatToolContent(
        echoResult({ uri: 'ui://app', mimeType: 'text/html', text: body }),
        'openai',
        appMetadata,
      );

      const snapshot = JSON.stringify(artifacts?.ui_resources?.data?.[0]?.content ?? []);
      expect(snapshot).not.toContain(body);
      expect(snapshot).toContain('ui://app');
    });

    it('does not persist a sibling app body on the synthesized app', () => {
      const body = 'B'.repeat(5000);
      const result: t.MCPToolCallResponse = {
        content: [
          {
            type: 'resource',
            resource: { uri: 'ui://chart', mimeType: 'text/html;profile=mcp-app', text: body },
          },
        ],
      };

      const [, artifacts] = formatToolContent(result, 'openai', appMetadata);

      const synthetic = artifacts?.ui_resources?.data?.find(
        (resource) => resource.uri === 'ui://app',
      );
      const snapshot = JSON.stringify(synthetic?.content ?? []);
      expect(snapshot).not.toContain(body);
      expect(snapshot).toContain('ui://chart');
    });
  });
});

describe('shared result snapshot', () => {
  const appMeta = { serverName: 'srv', toolName: 'do_thing' };

  const snapshotOf = (
    result: t.MCPToolCallResponse,
    metadata: Parameters<typeof formatToolContent>[2] = appMeta,
  ) => {
    const [, artifacts] = formatToolContent(result, 'openai', metadata);
    return artifacts?.ui_resources?.data?.[0]?.content;
  };

  const appView = (text: string) => ({
    type: 'resource' as const,
    resource: { uri: 'ui://app', mimeType: MCP_APP_MIME_TYPE, text },
  });

  const schemaCases: Array<{ name: string; result: t.MCPToolCallResponse; metadata?: object }> = [
    { name: 'app view with text', result: { content: [appView('<p>hi</p>')] } },
    {
      name: 'app view with blob',
      result: {
        content: [
          {
            type: 'resource',
            resource: { uri: 'ui://app', mimeType: MCP_APP_MIME_TYPE, blob: 'YmluYXJ5' },
          },
        ],
      },
    },
    {
      name: 'app view plus a file resource',
      result: {
        content: [
          appView('<p>hi</p>'),
          {
            type: 'resource',
            resource: { uri: 'file://report', mimeType: 'text/plain', text: 'row,1' },
          },
        ],
      },
    },
    {
      name: 'synthesized declared app',
      result: { content: [{ type: 'text', text: 'done' }] },
      metadata: { ...appMeta, resourceUri: 'ui://app' },
    },
  ];

  // An emptied carrier key keeps the snapshot a valid CallToolResult. Deleting it instead makes the
  // app's own CallToolResultSchema parse fail, so ontoolresult never fires for the whole result.
  it.each(schemaCases)('stays a valid CallToolResult: $name', ({ result, metadata }) => {
    const content = snapshotOf(
      result,
      (metadata ?? appMeta) as Parameters<typeof formatToolContent>[2],
    );
    expect(CallToolResultSchema.safeParse({ content }).success).toBe(true);
  });

  it('empties the ui:// carrier key in the snapshot while the top level keeps the body', () => {
    const [, artifacts] = formatToolContent(
      {
        content: [
          {
            type: 'resource',
            resource: { uri: 'ui://app', mimeType: MCP_APP_MIME_TYPE, blob: 'YmluYXJ5' },
          },
        ],
      },
      'openai',
      appMeta,
    );

    const uiResource = artifacts?.ui_resources?.data?.[0];
    expect(uiResource?.blob).toBe('YmluYXJ5');
    expect(uiResource?.content).toEqual([
      {
        type: 'resource',
        resource: { uri: 'ui://app', mimeType: MCP_APP_MIME_TYPE, blob: '' },
      },
    ]);
  });

  it.each([
    { uri: 'file://report', mimeType: 'text/plain', text: 'row,1' },
    { uri: 'db://items/1', mimeType: 'application/json', text: '{"a":1}' },
    { uri: 'custom://thing', mimeType: 'text/plain', text: 'payload' },
  ])('preserves a non-UI body in the snapshot: $uri', (resource) => {
    const content = snapshotOf({ content: [appView('<p>hi</p>'), { type: 'resource', resource }] });
    expect(content?.[1]).toEqual({ type: 'resource', resource });
  });

  it('preserves a non-UI blob body in the snapshot', () => {
    const resource = {
      uri: 'file://report.bin',
      mimeType: 'application/octet-stream',
      blob: 'YQ==',
    };
    const content = snapshotOf({ content: [appView('<p>hi</p>'), { type: 'resource', resource }] });
    expect(content?.[1]).toEqual({ type: 'resource', resource });
  });
});

describe('ui:// resource identity and rendering', () => {
  const appMeta = { serverName: 'srv', toolName: 'do_thing' };

  it('gives two ui:// resources with identical html distinct ids', () => {
    const html = '<p>same</p>';
    const [, artifacts] = formatToolContent(
      {
        content: [
          {
            type: 'resource',
            resource: { uri: 'ui://a', mimeType: MCP_APP_MIME_TYPE, text: html },
          },
          {
            type: 'resource',
            resource: { uri: 'ui://b', mimeType: MCP_APP_MIME_TYPE, text: html },
          },
        ],
      },
      'openai',
      appMeta,
    );

    const ids = (artifacts?.ui_resources?.data ?? []).map((resource) => resource.resourceId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('does not emit a marker for a static ui:// view with no body', () => {
    const [content, artifacts] = formatToolContent(
      {
        content: [
          { type: 'resource', resource: { uri: 'ui://static', mimeType: 'text/html', text: '' } },
        ],
      },
      'openai',
    );

    expect(artifacts).toBeUndefined();
    expect(content).not.toContain('\\ui{');
    expect(content).toContain('Resource URI: ui://static');
  });

  it('suppresses the ui:// document body when apps are disabled for the scope', () => {
    const [content, artifacts] = formatToolContent(
      {
        content: [
          {
            type: 'resource',
            resource: { uri: 'ui://app', mimeType: MCP_APP_MIME_TYPE, text: '<html>doc</html>' },
          },
        ],
      },
      'openai',
      { ...appMeta, enableApps: false },
    );

    expect(artifacts).toBeUndefined();
    expect(content).toContain('Resource URI: ui://app');
    expect(content).not.toContain('<html>doc</html>');
    expect(content).not.toContain('Resource Text:');
    expect(content).not.toContain('\\ui{');
  });

  it('still surfaces a non-ui:// html resource body', () => {
    const [content] = formatToolContent(
      {
        content: [
          {
            type: 'resource',
            resource: { uri: 'file://page.html', mimeType: 'text/html', text: '<p>page</p>' },
          },
        ],
      },
      'openai',
    );

    expect(content).toContain('Resource Text: <p>page</p>');
  });
});

describe('isMcpAppMimeType', () => {
  const accepted = [
    MCP_APP_MIME_TYPE,
    'text/html; profile=mcp-app',
    'text/html;charset=utf-8;profile=mcp-app',
    'text/html;profile=mcp-app;charset=utf-8',
    'text/html;profile="mcp-app"',
    'TEXT/HTML; PROFILE=mcp-app',
  ];
  const rejected = [
    'application/xhtml+xml;profile=mcp-app',
    'text/htmlx;profile=mcp-app',
    'image/svg+xml;profile=mcp-app',
    'text/html',
    'text/html;xprofile=mcp-app',
    'text/html;profile=mcp-app-evil',
    undefined,
    null,
    42 as unknown as string,
  ];

  it.each(accepted)('accepts %s', (mimeType) => {
    expect(isMcpAppMimeType(mimeType)).toBe(true);
  });

  it.each(rejected)('rejects %s', (mimeType) => {
    expect(isMcpAppMimeType(mimeType as string | undefined)).toBe(false);
  });

  // The bridge payload the server attaches and the App Bridge the client starts must be decided by
  // the same predicate, or one side persists fields the other never reads. Scoped to lower-case
  // spellings: the tier-1 `includes('html')` gate this path runs first is case-sensitive, so an
  // upper-case media type is dropped before classification on both sides.
  it.each([
    ...accepted.filter((mimeType) => mimeType === mimeType.toLowerCase()),
    'text/html',
    'text/html;xprofile=mcp-app',
  ])('attaches bridge fields exactly when the profile matches: %s', (mimeType) => {
    const [, artifacts] = formatToolContent(
      {
        content: [{ type: 'resource', resource: { uri: 'ui://app', mimeType, text: '<p>a</p>' } }],
      },
      'openai',
      { serverName: 'srv', toolName: 'do_thing' },
    );
    const uiResource = artifacts?.ui_resources?.data?.[0];
    expect(!!uiResource?.serverName).toBe(isMcpAppMimeType(mimeType));
  });
});
