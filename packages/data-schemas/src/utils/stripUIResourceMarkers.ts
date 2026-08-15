import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { math } from 'micromark-extension-llm-math';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { directive } from 'micromark-extension-directive';
import { decodeString } from 'micromark-util-decode-string';
import { directiveFromMarkdown } from 'mdast-util-directive';
import { Constants, ContentTypes } from 'librechat-data-provider';

const UI_RESOURCE_PATTERN = /\\ui\{[\w]+(?:,[\w]+)*\}/g;
const CITATION_CLEANUP = /\\ue20[0-46]|[\ue200-\ue204\ue206]/g;
const COMPOSITE_CITATION = /(?:\\ue200|\ue200).*?(?:\\ue201|\ue201)/g;
const HIGHLIGHTED_CITATION = /(?:\\ue203|\ue203).*?(?:\\ue204|\ue204)/g;
const STANDALONE_CITATION = /(?:\\ue202|\ue202)turn\d+(?:search|image|news|video|ref|file)\d+/;
const MARKDOWN_ESCAPE_OR_REFERENCE = /\\(.)|&(#(?:\d{1,7}|[xX][\dA-Fa-f]{1,6})|[\dA-Za-z]{1,31});/g;

type MarkdownNode = {
  type: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: MarkdownNode[];
};

type SourceSegment = {
  decodedStart: number;
  decodedEnd: number;
  sourceStart: number;
  sourceEnd: number;
  literal: boolean;
};

function removeCitationCleanup(value: string, segments: SourceSegment[]) {
  const removals: Array<[number, number]> = [];
  const highlightedRanges: Array<[number, number]> = [];
  HIGHLIGHTED_CITATION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HIGHLIGHTED_CITATION.exec(value)) != null) {
    highlightedRanges.push([match.index, HIGHLIGHTED_CITATION.lastIndex]);
  }
  COMPOSITE_CITATION.lastIndex = 0;
  let highlightedIndex = 0;
  while ((match = COMPOSITE_CITATION.exec(value)) != null) {
    while (highlightedRanges[highlightedIndex]?.[1] <= match.index) {
      highlightedIndex++;
    }
    const highlighted = highlightedRanges[highlightedIndex];
    const nestedInHighlight =
      highlighted != null &&
      match.index >= highlighted[0] &&
      COMPOSITE_CITATION.lastIndex <= highlighted[1];
    if (!nestedInHighlight && STANDALONE_CITATION.test(match[0])) {
      removals.push([match.index, COMPOSITE_CITATION.lastIndex]);
    }
  }
  CITATION_CLEANUP.lastIndex = 0;
  highlightedIndex = 0;
  while ((match = CITATION_CLEANUP.exec(value)) != null) {
    while (highlightedRanges[highlightedIndex]?.[1] <= match.index) {
      highlightedIndex++;
    }
    const highlighted = highlightedRanges[highlightedIndex];
    if (!highlighted || match.index < highlighted[0]) {
      removals.push([match.index, CITATION_CLEANUP.lastIndex]);
    }
  }
  if (removals.length === 0) {
    return { value, segments };
  }
  removals.sort((a, b) => a[0] - b[0]);
  const mergedRemovals: Array<[number, number]> = [];
  for (const removal of removals) {
    const previous = mergedRemovals[mergedRemovals.length - 1];
    if (previous && removal[0] <= previous[1]) {
      previous[1] = Math.max(previous[1], removal[1]);
    } else {
      mergedRemovals.push([...removal]);
    }
  }

  let cleanedValue = '';
  const cleanedSegments: SourceSegment[] = [];
  let removalIndex = 0;

  const appendSlice = (segment: SourceSegment, start: number, end: number) => {
    if (start >= end) {
      return;
    }
    const decodedStart = cleanedValue.length;
    cleanedValue += value.slice(start, end);
    const sourceStart = segment.literal
      ? segment.sourceStart + start - segment.decodedStart
      : segment.sourceStart;
    const sourceEnd = segment.literal
      ? segment.sourceStart + end - segment.decodedStart
      : segment.sourceEnd;
    const previous = cleanedSegments[cleanedSegments.length - 1];
    if (
      segment.literal &&
      previous?.literal &&
      previous.decodedEnd === decodedStart &&
      previous.sourceEnd === sourceStart
    ) {
      previous.decodedEnd = cleanedValue.length;
      previous.sourceEnd = sourceEnd;
      return;
    }
    cleanedSegments.push({
      decodedStart,
      decodedEnd: cleanedValue.length,
      sourceStart,
      sourceEnd,
      literal: segment.literal,
    });
  };

  for (const segment of segments) {
    let cursor = segment.decodedStart;
    while (cursor < segment.decodedEnd) {
      while (mergedRemovals[removalIndex]?.[1] <= cursor) {
        removalIndex++;
      }
      const removal = mergedRemovals[removalIndex];
      if (!removal || removal[0] >= segment.decodedEnd) {
        appendSlice(segment, cursor, segment.decodedEnd);
        break;
      }
      appendSlice(segment, cursor, Math.min(removal[0], segment.decodedEnd));
      cursor = Math.max(cursor, removal[1]);
    }
  }

  return { value: cleanedValue, segments: cleanedSegments };
}

function decodeTextWithSourceSpans(source: string) {
  let value = '';
  const segments: SourceSegment[] = [];
  let cursor = 0;
  MARKDOWN_ESCAPE_OR_REFERENCE.lastIndex = 0;

  const appendLiteral = (start: number, end: number) => {
    if (start === end) {
      return;
    }
    const decodedStart = value.length;
    value += source.slice(start, end);
    const previous = segments[segments.length - 1];
    if (previous?.literal && previous.decodedEnd === decodedStart && previous.sourceEnd === start) {
      previous.decodedEnd = value.length;
      previous.sourceEnd = end;
      return;
    }
    segments.push({
      decodedStart,
      decodedEnd: value.length,
      sourceStart: start,
      sourceEnd: end,
      literal: true,
    });
  };

  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_ESCAPE_OR_REFERENCE.exec(source)) != null) {
    appendLiteral(cursor, match.index);
    const decoded = decodeString(match[0]);
    if (decoded === match[0]) {
      appendLiteral(match.index, MARKDOWN_ESCAPE_OR_REFERENCE.lastIndex);
    } else {
      const decodedStart = value.length;
      value += decoded;
      segments.push({
        decodedStart,
        decodedEnd: value.length,
        sourceStart: match.index,
        sourceEnd: MARKDOWN_ESCAPE_OR_REFERENCE.lastIndex,
        literal: false,
      });
    }
    cursor = MARKDOWN_ESCAPE_OR_REFERENCE.lastIndex;
  }
  appendLiteral(cursor, source.length);
  return removeCitationCleanup(value, segments);
}

function mapDecodedRange(
  segments: SourceSegment[],
  decodedStart: number,
  decodedEnd: number,
  fromIndex: number,
): { range: [number, number]; segmentIndex: number } | null {
  let firstIndex = fromIndex;
  while (segments[firstIndex]?.decodedEnd <= decodedStart) {
    firstIndex++;
  }
  const first = segments[firstIndex];
  if (!first || decodedStart < first.decodedStart) {
    return null;
  }

  let lastIndex = firstIndex;
  while (segments[lastIndex]?.decodedEnd < decodedEnd) {
    lastIndex++;
  }
  const last = segments[lastIndex];
  if (!last || decodedEnd <= last.decodedStart) {
    return null;
  }

  const sourceStart = first.literal
    ? first.sourceStart + decodedStart - first.decodedStart
    : first.sourceStart;
  const sourceEnd = last.literal
    ? last.sourceStart + decodedEnd - last.decodedStart
    : last.sourceEnd;
  return { range: [sourceStart, sourceEnd], segmentIndex: lastIndex };
}

function collectMarkerRanges(root: MarkdownNode, source: string, ranges: Array<[number, number]>) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop() as MarkdownNode;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (node.type === 'text' && start != null && end != null) {
      const decoded = decodeTextWithSourceSpans(source.slice(start, end));
      UI_RESOURCE_PATTERN.lastIndex = 0;
      let segmentCursor = 0;
      let match: RegExpExecArray | null;
      while ((match = UI_RESOURCE_PATTERN.exec(decoded.value)) != null) {
        const mapped = mapDecodedRange(
          decoded.segments,
          match.index,
          match.index + match[0].length,
          segmentCursor,
        );
        if (mapped) {
          segmentCursor = mapped.segmentIndex;
          ranges.push([start + mapped.range[0], start + mapped.range[1]]);
        }
      }
    }
    if (node.type === 'textDirective') {
      continue;
    }
    if (node.children) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
}

function findUIResourceMarkerRanges(text: string): Array<[number, number]> {
  if (
    (!text.includes('\\') && !text.includes('&')) ||
    !decodeString(text).replace(CITATION_CLEANUP, '').includes('\\ui{')
  ) {
    return [];
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
  return ranges;
}

function removeSourceRanges(text: string, ranges: Array<[number, number]>) {
  let result = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    result += text.slice(cursor, start);
    cursor = end;
  }
  return result + text.slice(cursor);
}

/** Remove MCP-UI markers only from Markdown text nodes visited by the renderer plugin. */
export function stripUIResourceMarkers(text: string): string;
export function stripUIResourceMarkers(text: undefined): undefined;
export function stripUIResourceMarkers(text: string | undefined): string | undefined;
export function stripUIResourceMarkers(text: string | undefined): string | undefined {
  if (text == null) {
    return text;
  }
  const ranges = findUIResourceMarkerRanges(text);
  return ranges.length === 0 ? text : removeSourceRanges(text, ranges);
}

/** Sanitize only the portion of a legacy message that the client renders as Markdown. */
export function stripMessageUIResourceMarkers(
  text: string | undefined,
  error?: unknown,
): string | undefined {
  if (text == null || error) {
    return text;
  }
  const thinkingMatch = /:::thinking[\s\S]*?:::/.exec(text);
  if (!thinkingMatch) {
    return stripUIResourceMarkers(text);
  }
  const start = thinkingMatch.index;
  const end = start + thinkingMatch[0].length;
  const regularContent = text.slice(0, start) + text.slice(end);
  const regularRanges = findUIResourceMarkerRanges(regularContent);
  if (regularRanges.length === 0) {
    return text;
  }
  const sourceRanges: Array<[number, number]> = [];
  const blockLength = end - start;
  for (const [rangeStart, rangeEnd] of regularRanges) {
    if (rangeEnd <= start) {
      sourceRanges.push([rangeStart, rangeEnd]);
    } else if (rangeStart >= start) {
      sourceRanges.push([rangeStart + blockLength, rangeEnd + blockLength]);
    } else {
      sourceRanges.push([rangeStart, start], [end, rangeEnd + blockLength]);
    }
  }
  return removeSourceRanges(text, sourceRanges);
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

type ContentFrame = {
  content: unknown[];
  sanitizeTextParts: boolean;
  index: number;
  result: unknown[] | null;
  onComplete: (content: unknown[]) => void;
};

function updateFramePart(
  frame: ContentFrame,
  index: number,
  originalPart: unknown,
  sanitizedPart: unknown,
) {
  if (sanitizedPart === originalPart) {
    return;
  }
  frame.result ??= [...frame.content];
  frame.result[index] = sanitizedPart;
}

/** Sanitize assistant text parts, including arbitrarily nested persisted subagent content. */
export function sanitizeUIResourceContent(content: unknown, sanitizeTextParts = true): unknown {
  if (!Array.isArray(content)) {
    return content;
  }

  let sanitizedContent = content;
  const stack: ContentFrame[] = [
    {
      content,
      sanitizeTextParts,
      index: 0,
      result: null,
      onComplete: (result) => {
        sanitizedContent = result;
      },
    },
  ];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.index >= frame.content.length) {
      stack.pop();
      frame.onComplete(frame.result ?? frame.content);
      continue;
    }

    const index = frame.index++;
    const part = frame.content[index];
    if (part == null || typeof part !== 'object') {
      continue;
    }

    let sanitizedPart: unknown = part;
    const record = part as Record<string, unknown>;
    if (frame.sanitizeTextParts && record.type === ContentTypes.TEXT) {
      sanitizedPart = sanitizeTextPart(record);
    }

    const current = sanitizedPart as Record<string, unknown>;
    if (current.tool_call == null || typeof current.tool_call !== 'object') {
      updateFramePart(frame, index, part, sanitizedPart);
      continue;
    }

    const toolCall = current.tool_call as Record<string, unknown>;
    let sanitizedToolCall = toolCall;
    if (toolCall.name === Constants.SUBAGENT && typeof toolCall.output === 'string') {
      const output = stripUIResourceMarkers(toolCall.output);
      if (output !== toolCall.output) {
        sanitizedToolCall = { ...sanitizedToolCall, output };
      }
    }

    if (Array.isArray(toolCall.subagent_content)) {
      const originalSubagentContent = toolCall.subagent_content;
      stack.push({
        content: originalSubagentContent,
        sanitizeTextParts: true,
        index: 0,
        result: null,
        onComplete: (subagentContent) => {
          if (subagentContent !== originalSubagentContent) {
            sanitizedToolCall = { ...sanitizedToolCall, subagent_content: subagentContent };
          }
          if (sanitizedToolCall !== toolCall) {
            sanitizedPart = { ...current, tool_call: sanitizedToolCall };
          }
          updateFramePart(frame, index, part, sanitizedPart);
        },
      });
      continue;
    }

    if (sanitizedToolCall !== toolCall) {
      sanitizedPart = { ...current, tool_call: sanitizedToolCall };
    }
    updateFramePart(frame, index, part, sanitizedPart);
  }

  return sanitizedContent;
}
