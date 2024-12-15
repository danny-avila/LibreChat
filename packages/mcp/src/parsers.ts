import type * as t from './types/mcp';
const RECOGNIZED_PROVIDERS = new Set(['google', 'anthropic', 'openAI']);

const imageFormatters: Record<string, undefined | t.ImageFormatter> = {
  google: (item) => ({
    type: 'image',
    inlineData: {
      mimeType: item.mimeType,
      data: item.data,
    },
  }),
  anthropic: (item) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: item.mimeType,
      data: item.data,
    },
  }),
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
 * Recognized types: "image", "image_url", "text", "json"
 *
 * @param {t.MCPToolCallResponse} result - The MCPToolCallResponse object
 * @param {string} provider - The provider name (google, anthropic, openai)
 * @returns {Array<Object>} Formatted content blocks
 */
export function formatToolContent(
  result: t.MCPToolCallResponse,
  provider: t.Provider,
): string | t.FormattedContent[] {
  if (!RECOGNIZED_PROVIDERS.has(provider)) {
    return parseAsString(result);
  }
  const content = result?.content ?? [];
  if (!content.length) {
    return [{ type: 'text', text: '(No response)' }];
  }

  const formattedContent: t.FormattedContent[] = [];
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
      if (currentTextBlock) {
        formattedContent.push({ type: 'text', text: currentTextBlock });
        currentTextBlock = '';
      }
      let formatter = imageFormatters[provider];
      if (!formatter) {
        formatter = imageFormatters.default as t.ImageFormatter;
      }
      formattedContent.push(formatter(item));
    },

    resource: (item) => {
      const resourceText = [];
      if (item.resource.text != null && item.resource.text) {
        resourceText.push(item.resource.text);
      }
      if (item.resource.uri.length) {
        resourceText.push(`Resource URI: ${item.resource.uri}`);
      }
      if (item.resource.mimeType != null && item.resource.mimeType) {
        resourceText.push(`Type: ${item.resource.mimeType}`);
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

  if (currentTextBlock) {
    formattedContent.push({ type: 'text', text: currentTextBlock });
  }

  return formattedContent;
}
