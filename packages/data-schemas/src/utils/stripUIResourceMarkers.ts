import { fromMarkdown } from 'mdast-util-from-markdown';
import { ContentTypes } from 'librechat-data-provider';

const UI_RESOURCE_PATTERN = /\\ui\{[\w]+(?:,[\w]+)*\}/g;

type MarkdownNode = {
  type: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: MarkdownNode[];
};

function collectMarkerRanges(node: MarkdownNode, source: string, ranges: Array<[number, number]>) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (node.type === 'text' && start != null && end != null) {
    const value = source.slice(start, end);
    UI_RESOURCE_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = UI_RESOURCE_PATTERN.exec(value)) != null) {
      const matchStart = start + match.index;
      ranges.push([matchStart, matchStart + match[0].length]);
    }
  }
  node.children?.forEach((child) => collectMarkerRanges(child, source, ranges));
}

/** Remove MCP-UI markers only from Markdown text nodes visited by the renderer plugin. */
export function stripUIResourceMarkers(text: string): string;
export function stripUIResourceMarkers(text: undefined): undefined;
export function stripUIResourceMarkers(text: string | undefined): string | undefined;
export function stripUIResourceMarkers(text: string | undefined): string | undefined {
  if (text == null || !text.includes('\\ui{')) {
    return text;
  }

  const ranges: Array<[number, number]> = [];
  collectMarkerRanges(fromMarkdown(text) as unknown as MarkdownNode, text, ranges);
  if (ranges.length === 0) {
    return text;
  }

  let result = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    result += text.slice(cursor, start);
    cursor = end;
  }
  return result + text.slice(cursor);
}

function sanitizeTextPart(part: Record<string, unknown>): unknown {
  if (typeof part.text === 'string') {
    const text = stripUIResourceMarkers(part.text);
    return text === part.text ? part : { ...part, text };
  }
  if (part.text != null && typeof part.text === 'object') {
    const textData = part.text as Record<string, unknown>;
    if (typeof textData.value === 'string') {
      const value = stripUIResourceMarkers(textData.value);
      return value === textData.value ? part : { ...part, text: { ...textData, value } };
    }
  }
  return part;
}

/** Recursively sanitize assistant text parts, including persisted subagent content. */
export function sanitizeUIResourceContent(content: unknown): unknown {
  if (!Array.isArray(content)) {
    return content;
  }

  let result: unknown[] | null = null;
  for (let i = 0; i < content.length; i++) {
    const part = content[i];
    if (part == null || typeof part !== 'object') {
      continue;
    }

    let sanitizedPart: unknown = part;
    const record = part as Record<string, unknown>;
    if (record.type === ContentTypes.TEXT) {
      sanitizedPart = sanitizeTextPart(record);
    }

    const current = sanitizedPart as Record<string, unknown>;
    if (current.tool_call != null && typeof current.tool_call === 'object') {
      const toolCall = current.tool_call as Record<string, unknown>;
      if (Array.isArray(toolCall.subagent_content)) {
        const subagentContent = sanitizeUIResourceContent(toolCall.subagent_content);
        if (subagentContent !== toolCall.subagent_content) {
          sanitizedPart = {
            ...current,
            tool_call: { ...toolCall, subagent_content: subagentContent },
          };
        }
      }
    }

    if (sanitizedPart !== part) {
      result ??= [...content];
      result[i] = sanitizedPart;
    }
  }
  return result ?? content;
}
