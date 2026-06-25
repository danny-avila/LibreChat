import crypto from 'node:crypto';
import { Tools } from 'librechat-data-provider';
import type { UIResource } from 'librechat-data-provider';
import type * as t from './types';

export const DEFAULT_MCP_IMAGE_DATA_MAX_BYTES: number = 10 * 1024 * 1024;

function generateResourceId(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').substring(0, 10);
}

/**
 * Derives a UI resource ID that is unique per result snapshot. The frontend indexes conversation
 * resources by ID, so two calls that share a base (resourceUri/text) and args but differ in
 * structuredContent, text content, _meta, or error state must not collide and overwrite each other.
 */
function deriveResourceId(
  base: string,
  result: t.MCPToolCallResponse,
  toolArgs: unknown,
  serverName?: string,
  toolName?: string,
): string {
  const meta = (result as { _meta?: unknown } | undefined)?._meta;
  const parts = [
    serverName ?? '',
    toolName ?? '',
    base,
    result?.structuredContent != null ? JSON.stringify(result.structuredContent) : '',
    result?.content != null ? JSON.stringify(result.content) : '',
    meta != null ? JSON.stringify(meta) : '',
    result?.isError === true ? '1' : '',
    toolArgs != null ? JSON.stringify(toolArgs) : '',
  ];
  return generateResourceId(parts.join('\x00'));
}

function getMCPImageDataMaxBytes(): number {
  const raw = process.env.MCP_IMAGE_DATA_MAX_BYTES;
  if (!raw) {
    return DEFAULT_MCP_IMAGE_DATA_MAX_BYTES;
  }

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MCP_IMAGE_DATA_MAX_BYTES;
}

function getBase64Padding(data: string): number {
  if (data.endsWith('==')) {
    return 2;
  }
  if (data.endsWith('=')) {
    return 1;
  }
  return 0;
}

function estimateBase64ImageBytes(data: string): number {
  const padding = getBase64Padding(data);
  return Math.max(0, Math.floor((data.length * 3) / 4) - padding);
}

function isRemoteImageUrl(data: string): boolean {
  return data.startsWith('http://') || data.startsWith('https://');
}

function assertImageDataWithinLimit(item: t.ImageContent): void {
  if (isRemoteImageUrl(item.data)) {
    return;
  }

  const maxBytes = getMCPImageDataMaxBytes();
  const estimatedBytes = estimateBase64ImageBytes(item.data);
  if (estimatedBytes <= maxBytes) {
    return;
  }

  throw new Error(
    `MCP image result exceeds maximum size of ${maxBytes} bytes: ${estimatedBytes} bytes`,
  );
}

const RECOGNIZED_PROVIDERS = new Set([
  'google',
  'anthropic',
  'openai',
  'azureopenai',
  'openrouter',
  'xai',
  'deepseek',
  'ollama',
  'bedrock',
]);

const imageFormatters: Record<string, undefined | t.ImageFormatter> = {
  // google: (item) => ({
  //   type: 'image',
  //   inlineData: {
  //     mimeType: item.mimeType,
  //     data: item.data,
  //   },
  // }),
  // anthropic: (item) => ({
  //   type: 'image',
  //   source: {
  //     type: 'base64',
  //     media_type: item.mimeType,
  //     data: item.data,
  //   },
  // }),
  default: (item) => ({
    type: 'image_url',
    image_url: {
      url: isRemoteImageUrl(item.data) ? item.data : `data:${item.mimeType};base64,${item.data}`,
    },
  }),
};

function isImageContent(item: t.ToolContentPart): item is t.ImageContent {
  return item.type === 'image';
}

function parseAsString(result: t.MCPToolCallResponse): string {
  const content = result?.content ?? [];
  if (!content.length) {
    return '(No response)';
  }

  const text = content
    .map((item) => {
      if (item.type === 'text') {
        return item.text;
      }
      if (item.type === 'resource') {
        const resourceText = [];
        if ('text' in item.resource && item.resource.text != null && item.resource.text) {
          resourceText.push(item.resource.text);
        }
        if (item.resource.uri) {
          resourceText.push(`Resource URI: ${item.resource.uri}`);
        }
        if (item.resource.mimeType != null && item.resource.mimeType) {
          resourceText.push(`Type: ${item.resource.mimeType}`);
        }
        return resourceText.join('\n');
      }
      if (isImageContent(item)) {
        assertImageDataWithinLimit(item);
      }
      return JSON.stringify(item, null, 2);
    })
    .filter(Boolean)
    .join('\n\n');

  return text;
}

/**
 * Converts MCPToolCallResponse content into a plain-text string plus optional artifacts
 * (images, UI resources). All providers receive string content; images are separated into
 * artifacts and merged back by the agents package via formatArtifactPayload / formatAnthropicArtifactContent.
 *
 * @param provider - Used only to distinguish recognized vs. unrecognized providers.
 * All recognized providers currently produce identical string output;
 * provider-specific artifact merging is delegated to the agents package.
 */
export function formatToolContent(
  result: t.MCPToolCallResponse,
  provider: t.Provider,
  metadata?: {
    serverName?: string;
    toolName?: string;
    resourceUri?: string;
    csp?: UIResource['csp'];
    permissions?: UIResource['permissions'];
    toolArgs?: Record<string, unknown>;
  },
): t.FormattedContentResult {
  if (!RECOGNIZED_PROVIDERS.has(provider)) {
    return [parseAsString(result), undefined];
  }

  const content = result?.content ?? [];
  const hasSyntheticApp =
    metadata?.resourceUri != null && metadata.serverName != null && metadata.toolName != null;
  if (!content.length && !hasSyntheticApp) {
    return ['(No response)', undefined];
  }

  const imageUrls: t.FormattedContent[] = [];
  const uiResources: UIResource[] = [];
  let currentTextBlock = '';

  type ContentHandler = undefined | ((item: t.ToolContentPart) => void);

  const contentHandlers: {
    text: (item: Extract<t.ToolContentPart, { type: 'text' }>) => void;
    image: (item: t.ToolContentPart) => void;
    resource: (item: Extract<t.ToolContentPart, { type: 'resource' }>) => void;
  } = {
    text: (item) => {
      currentTextBlock += (currentTextBlock ? '\n\n' : '') + item.text;
    },

    image: (item) => {
      if (!isImageContent(item)) {
        return;
      }
      assertImageDataWithinLimit(item);
      const formatter = imageFormatters.default as t.ImageFormatter;
      const formattedImage = formatter(item);

      if (formattedImage.type === 'image_url') {
        imageUrls.push(formattedImage);
      }
    },

    resource: (item) => {
      // MCP Apps defines a single renderable resource type, text/html;profile=mcp-app, and the
      // host renders HTML only. ui:// resources with other mime types (json, remote-dom) have no
      // renderer, so they fall through to plain resource text instead of an unrenderable marker.
      const mimeType =
        typeof item.resource.mimeType === 'string' ? item.resource.mimeType : 'text/html';
      const isUiResource = item.resource.uri.startsWith('ui://') && mimeType.includes('html');
      const resourceText: string[] = [];

      if (isUiResource) {
        const baseHash =
          'text' in item.resource && item.resource.text && typeof item.resource.text === 'string'
            ? item.resource.text
            : item.resource.uri;
        const resourceId = deriveResourceId(
          baseHash,
          result,
          metadata?.toolArgs,
          metadata?.serverName,
          metadata?.toolName,
        );
        const itemUi = (item.resource._meta as { ui?: Record<string, unknown> } | undefined)?.ui as
          | { csp?: UIResource['csp']; permissions?: UIResource['permissions'] }
          | undefined;
        const uiResource: UIResource = {
          ...item.resource,
          resourceId,
          serverName: metadata?.serverName,
          toolName: metadata?.toolName,
          structuredContent: result?.structuredContent,
          content: result?.content,
          isError: result?.isError,
          resultMeta: (result as { _meta?: Record<string, unknown> })?._meta,
          csp: itemUi?.csp ?? metadata?.csp,
          permissions: itemUi?.permissions ?? metadata?.permissions,
          toolArgs: metadata?.toolArgs,
        };
        uiResources.push(uiResource);
        resourceText.push(`UI Resource ID: ${resourceId}`);
        resourceText.push(`UI Resource Marker: \\ui{${resourceId}}`);
      } else if ('text' in item.resource && item.resource.text != null && item.resource.text) {
        resourceText.push(`Resource Text: ${item.resource.text}`);
      }

      if (item.resource.uri.length) {
        resourceText.push(`Resource URI: ${item.resource.uri}`);
      }
      if (item.resource.mimeType != null && item.resource.mimeType) {
        resourceText.push(`Resource MIME Type: ${item.resource.mimeType}`);
      }

      if (resourceText.length) {
        currentTextBlock += (currentTextBlock ? '\n\n' : '') + resourceText.join('\n');
      }
    },
  };

  for (const item of content) {
    const handler = contentHandlers[item.type as keyof typeof contentHandlers] as ContentHandler;
    if (handler) {
      handler(item as never);
    } else {
      const stringified = JSON.stringify(item, null, 2);
      currentTextBlock += (currentTextBlock ? '\n\n' : '') + stringified;
    }
  }

  // MCP Apps: if the tool declares a ui:// resourceUri but didn't include a resource
  // content item, create a synthetic UIResource so the frontend renders AppRenderer.
  if (
    uiResources.length === 0 &&
    metadata?.resourceUri &&
    metadata.serverName &&
    metadata.toolName
  ) {
    const resourceId = deriveResourceId(
      metadata.resourceUri,
      result,
      metadata.toolArgs,
      metadata.serverName,
      metadata.toolName,
    );
    uiResources.push({
      resourceId,
      uri: metadata.resourceUri,
      mimeType: 'text/html;profile=mcp-app',
      serverName: metadata.serverName,
      toolName: metadata.toolName,
      structuredContent: result?.structuredContent,
      content: result?.content,
      csp: metadata.csp,
      permissions: metadata.permissions,
      toolArgs: metadata.toolArgs,
      isError: result?.isError,
      resultMeta: (result as { _meta?: Record<string, unknown> })?._meta,
    });
    currentTextBlock +=
      (currentTextBlock ? '\n\n' : '') +
      `UI Resource ID: ${resourceId}\nUI Resource Marker: \\ui{${resourceId}}`;
  }

  if (uiResources.length > 0) {
    const uiInstructions = `

UI Resource Markers Available:
- Each resource above includes a stable ID and a marker hint like \`\\ui{abc123}\`
- You should usually introduce what you're showing before placing the marker
- For a single resource: \\ui{resource-id}
- For multiple resources shown separately: \\ui{resource-id-a} \\ui{resource-id-b}
- For multiple resources in a carousel: \\ui{resource-id-a,resource-id-b,resource-id-c}
- The UI will be rendered inline where you place the marker
- Format: \\ui{resource-id} or \\ui{id1,id2,id3} using the IDs provided above`;

    currentTextBlock += uiInstructions;
  }

  let artifacts: t.Artifacts = undefined;
  if (imageUrls.length > 0) {
    artifacts = { content: imageUrls };
  }

  if (uiResources.length > 0) {
    artifacts = {
      ...artifacts,
      [Tools.ui_resources]: { data: uiResources },
    };
  }

  return [currentTextBlock || (artifacts !== undefined ? '' : '(No response)'), artifacts];
}
