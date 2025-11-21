import { Tools } from 'librechat-data-provider';
import type { UIResource } from 'librechat-data-provider';
import type * as t from './types';

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
const CONTENT_ARRAY_PROVIDERS = new Set(['google', 'anthropic', 'azureopenai', 'openai']);

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
      url: item.data.startsWith('http') ? item.data : `data:${item.mimeType};base64,${item.data}`,
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
        if (item.resource.text != null && item.resource.text) {
          resourceText.push(item.resource.text);
        }
        if (item.resource.uri) {
          resourceText.push(`Resource URI: ${item.resource.uri}`);
        }
        if (item.resource.name) {
          resourceText.push(`Resource: ${item.resource.name}`);
        }
        if (item.resource.description) {
          resourceText.push(`Description: ${item.resource.description}`);
        }
        if (item.resource.mimeType != null && item.resource.mimeType) {
          resourceText.push(`Type: ${item.resource.mimeType}`);
        }
        return resourceText.join('\n');
      }
      return JSON.stringify(item, null, 2);
    })
    .filter(Boolean)
    .join('\n\n');

  return text;
}

/**
 * Converts MCPToolCallResponse content into recognized content block types
 * First element: string or formatted content (excluding image_url)
 * Second element: Recognized types - "image", "image_url", "text", "json"
 *
 * @param  result - The MCPToolCallResponse object
 * @param provider - The provider name (google, anthropic, openai)
 * @returns Tuple of content and image_urls
 */
export function formatToolContent(
  result: t.MCPToolCallResponse,
  provider: t.Provider,
): t.FormattedContentResult {
  if (!RECOGNIZED_PROVIDERS.has(provider)) {
    return [parseAsString(result), undefined];
  }

  const content = result?.content ?? [];
  if (!content.length) {
    return [[{ type: 'text', text: '(No response)' }], undefined];
  }

  const formattedContent: t.FormattedContent[] = [];
  const imageUrls: t.FormattedContent[] = [];
  let currentTextBlock = '';
  const uiResources: UIResource[] = [];

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
      if (CONTENT_ARRAY_PROVIDERS.has(provider) && currentTextBlock) {
        formattedContent.push({ type: 'text', text: currentTextBlock });
        currentTextBlock = '';
      }
      const formatter = imageFormatters.default as t.ImageFormatter;
      const formattedImage = formatter(item);

      if (formattedImage.type === 'image_url') {
        imageUrls.push(formattedImage);
      } else {
        formattedContent.push(formattedImage);
      }
    },

    resource: (item) => {
      if (item.resource.uri.startsWith('ui://')) {
        uiResources.push(item.resource as UIResource);
      }

      const resourceText = [];
      if (item.resource.text != null && item.resource.text) {
        resourceText.push(`Resource Text: ${item.resource.text}`);
      }
      if (item.resource.uri.length) {
        resourceText.push(`Resource URI: ${item.resource.uri}`);
      }
      if (item.resource.name) {
        resourceText.push(`Resource: ${item.resource.name}`);
      }
      if (item.resource.description) {
        resourceText.push(`Resource Description: ${item.resource.description}`);
      }
      if (item.resource.mimeType != null && item.resource.mimeType) {
        resourceText.push(`Resource MIME Type: ${item.resource.mimeType}`);
      }
      currentTextBlock += (currentTextBlock ? '\n\n' : '') + resourceText.join('\n');
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

  if (CONTENT_ARRAY_PROVIDERS.has(provider) && currentTextBlock) {
    formattedContent.push({ type: 'text', text: currentTextBlock });
  }

  let artifacts: t.Artifacts = undefined;
  if (imageUrls.length || uiResources.length) {
    artifacts = {
      ...(imageUrls.length && { content: imageUrls }),
      ...(uiResources.length && { [Tools.ui_resources]: { data: uiResources } }),
    };
  }

  if (CONTENT_ARRAY_PROVIDERS.has(provider)) {
    return [formattedContent, artifacts];
  }

  return [currentTextBlock, artifacts];
}
