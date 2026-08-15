import { fromMarkdown } from 'mdast-util-from-markdown';
import { directiveFromMarkdown } from 'mdast-util-directive';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { directive } from 'micromark-extension-directive';
import { gfm } from 'micromark-extension-gfm';
import { math } from 'micromark-extension-llm-math';
import { decodeString } from 'micromark-util-decode-string';
import { ContentTypes } from 'librechat-data-provider';

const UI_RESOURCE_PATTERN = /\\ui\{[\w]+(?:,[\w]+)*\}/g;
const MARKDOWN_ESCAPE_OR_REFERENCE = /\\(.)|&(#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/gi;

type MarkdownNode = {
  type: string;
  value?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: MarkdownNode[];
};

function decodeTextWithSourceSpans(source: string) {
  let value = '';
  const spans: Array<[number, number]> = [];
  let cursor = 0;
  MARKDOWN_ESCAPE_OR_REFERENCE.lastIndex = 0;

  const appendLiteral = (start: number, end: number) => {
    value += source.slice(start, end);
    for (let i = start; i < end; i++) {
      spans.push([i, i + 1]);
    }
  };

  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_ESCAPE_OR_REFERENCE.exec(source)) != null) {
    appendLiteral(cursor, match.index);
    const decoded = decodeString(match[0]);
    if (decoded === match[0]) {
      appendLiteral(match.index, MARKDOWN_ESCAPE_OR_REFERENCE.lastIndex);
    } else {
      value += decoded;
      for (let i = 0; i < decoded.length; i++) {
        spans.push([match.index, MARKDOWN_ESCAPE_OR_REFERENCE.lastIndex]);
      }
    }
    cursor = MARKDOWN_ESCAPE_OR_REFERENCE.lastIndex;
  }
  appendLiteral(cursor, source.length);
  return { value, spans };
}

function alignTextSpans(
  decoded: ReturnType<typeof decodeTextWithSourceSpans>,
  nodeValue: string,
): Array<[number, number]> | null {
  // mdast omits indentation that continues a paragraph, so align decoded text
  // back to source offsets while allowing only leading line whitespace to differ.
  const result: Array<[number, number]> = [];
  let sourceIndex = 0;
  let lineHasContent = false;

  for (let valueIndex = 0; valueIndex < nodeValue.length; valueIndex++) {
    const expected = nodeValue[valueIndex];
    if (expected === '\n' && decoded.value[sourceIndex] === '\r') {
      const nextIndex = decoded.value[sourceIndex + 1] === '\n' ? sourceIndex + 1 : sourceIndex;
      const first = decoded.spans[sourceIndex];
      const last = decoded.spans[nextIndex];
      if (!first || !last) {
        return null;
      }
      result.push([first[0], last[1]]);
      sourceIndex = nextIndex + 1;
      lineHasContent = false;
      continue;
    }
    while (decoded.value[sourceIndex] !== expected) {
      const candidate = decoded.value[sourceIndex];
      if (candidate == null || lineHasContent || (candidate !== ' ' && candidate !== '\t')) {
        return null;
      }
      sourceIndex++;
    }
    const span = decoded.spans[sourceIndex];
    if (!span) {
      return null;
    }
    result.push(span);
    sourceIndex++;
    if (expected === '\n' || expected === '\r') {
      lineHasContent = false;
    } else if (expected !== ' ' && expected !== '\t') {
      lineHasContent = true;
    }
  }
  return result;
}

function collectMarkerRanges(node: MarkdownNode, source: string, ranges: Array<[number, number]>) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (node.type === 'text' && node.value != null && start != null && end != null) {
    const decoded = decodeTextWithSourceSpans(source.slice(start, end));
    const spans = alignTextSpans(decoded, node.value);
    if (!spans) {
      return;
    }

    UI_RESOURCE_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = UI_RESOURCE_PATTERN.exec(node.value)) != null) {
      const first = spans[match.index];
      const last = spans[match.index + match[0].length - 1];
      if (first && last) {
        ranges.push([start + first[0], start + last[1]]);
      }
    }
  }
  node.children?.forEach((child) => collectMarkerRanges(child, source, ranges));
}

/** Remove MCP-UI markers only from Markdown text nodes visited by the renderer plugin. */
export function stripUIResourceMarkers(text: string): string;
export function stripUIResourceMarkers(text: undefined): undefined;
export function stripUIResourceMarkers(text: string | undefined): string | undefined;
export function stripUIResourceMarkers(text: string | undefined): string | undefined {
  if (text == null || (!text.includes('\\') && !text.includes('&'))) {
    return text;
  }

  const ranges: Array<[number, number]> = [];
  collectMarkerRanges(
    fromMarkdown(text, {
      extensions: [gfm(), directive(), math({ singleDollarTextMath: false })],
      mdastExtensions: [gfmFromMarkdown(), directiveFromMarkdown(), mathFromMarkdown()],
    }) as unknown as MarkdownNode,
    text,
    ranges,
  );
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
