export type ToolSegment =
  | { type: 'text'; text: string }
  | { type: 'tool'; call: string; result: string | null; raw: string };

const TOOL_OPEN_TAG = '<tool>';
const TOOL_CLOSE_TAG = '</tool>';
const TOOL_GROUP_OPEN_TAG = '<tool-group>';
const TOOL_GROUP_CLOSE_TAG = '</tool-group>';

type ToolTagType = 'tool' | 'group';
type ToolTagMatch = {
  index: number;
  type: ToolTagType;
};

const decodeHtmlEntities = (value: string): string => {
  if (!value.includes('&')) {
    return value;
  }

  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|#39);/g, (match, entity) => {
    if (entity === 'amp') {
      return '&';
    }
    if (entity === 'lt') {
      return '<';
    }
    if (entity === 'gt') {
      return '>';
    }
    if (entity === 'quot') {
      return '"';
    }
    if (entity === 'apos' || entity === '#39') {
      return "'";
    }

    if (!entity.startsWith('#')) {
      return match;
    }

    const isHex = entity.startsWith('#x');
    const codePoint = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
    if (!Number.isFinite(codePoint) || codePoint < 0) {
      return match;
    }

    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return match;
    }
  });
};

const pushTextSegment = (segments: ToolSegment[], text: string) => {
  if (text.length === 0) {
    return;
  }

  const previousSegment = segments[segments.length - 1];
  if (previousSegment?.type === 'text') {
    previousSegment.text += text;
    return;
  }

  segments.push({ type: 'text', text });
};

const countRepeat = (text: string, start: number, value: string, end: number) => {
  let index = start;
  while (index < end && text[index] === value) {
    index++;
  }
  return index - start;
};

const findLineStart = (text: string, index: number) => {
  let cursor = index;
  while (cursor > 0 && text[cursor - 1] !== '\n') {
    cursor--;
  }
  return cursor;
};

const getLineContentStartIfFenceCompatible = (text: string, lineStart: number, end: number) => {
  let cursor = lineStart;
  let indent = 0;

  while (cursor < end && text[cursor] === ' ') {
    indent++;
    if (indent > 3) {
      return -1;
    }
    cursor++;
  }

  return cursor;
};

const getLineIndent = (text: string, lineStart: number, index: number) => {
  let indent = 0;
  let cursor = lineStart;
  while (cursor < index) {
    if (text[cursor] === ' ') {
      indent++;
      if (indent > 3) {
        return -1;
      }
      cursor++;
      continue;
    }
    return -1;
  }
  return indent;
};

const isFenceDelimiterLine = (
  text: string,
  lineStart: number,
  marker: string,
  markerCount: number,
  end: number,
) => {
  const delimiterLength = countRepeat(text, lineStart, marker, end);
  if (delimiterLength < markerCount) {
    return false;
  }

  let cursor = lineStart + delimiterLength;
  while (cursor < end && text[cursor] !== '\n') {
    const value = text[cursor];
    if (value !== ' ' && value !== '\t') {
      return false;
    }
    cursor++;
  }
  return true;
};

const findFenceBlockEnd = (
  text: string,
  openStart: number,
  marker: string,
  markerCount: number,
  end: number,
) => {
  let lineStart = text.indexOf('\n', openStart);
  if (lineStart === -1) {
    return end;
  }
  lineStart += 1;

  while (lineStart < end) {
    const contentStart = getLineContentStartIfFenceCompatible(text, lineStart, end);
    if (contentStart !== -1 && isFenceDelimiterLine(text, contentStart, marker, markerCount, end)) {
      const newlineIndex = text.indexOf('\n', contentStart);
      return newlineIndex === -1 ? end : newlineIndex + 1;
    }

    const nextLineStart = text.indexOf('\n', lineStart);
    if (nextLineStart === -1) {
      break;
    }
    lineStart = nextLineStart + 1;
  }

  return end;
};

const findInlineCodeEnd = (text: string, start: number, delimiterCount: number, end: number) => {
  let cursor = start;
  while (cursor < end) {
    if (text[cursor] !== '`') {
      cursor++;
      continue;
    }
    const runLength = countRepeat(text, cursor, '`', end);
    if (runLength >= delimiterCount) {
      return cursor + delimiterCount;
    }
    cursor += runLength;
  }
  return end;
};

const findNextToolTagOutsideCode = (
  text: string,
  start: number,
  end: number,
): ToolTagMatch | null => {
  let cursor = start;

  while (cursor < end) {
    const value = text[cursor];

    if (value === '`' || value === '~') {
      const marker = value;
      const markerCount = countRepeat(text, cursor, marker, end);
      const lineStart = findLineStart(text, cursor);
      const lineIndent = getLineIndent(text, lineStart, cursor);
      const isFenceStart =
        markerCount >= 3 &&
        lineIndent !== -1 &&
        isFenceDelimiterLine(text, cursor, marker, markerCount, end);

      if (isFenceStart) {
        cursor = findFenceBlockEnd(text, cursor, marker, markerCount, end);
        continue;
      }

      if (marker === '`') {
        cursor = findInlineCodeEnd(text, cursor + markerCount, markerCount, end);
        continue;
      }
    }

    if (text.startsWith(TOOL_OPEN_TAG, cursor)) {
      return { index: cursor, type: 'tool' };
    }

    if (text.startsWith(TOOL_GROUP_OPEN_TAG, cursor)) {
      return { index: cursor, type: 'group' };
    }

    cursor++;
  }

  return null;
};

const parseRange = (text: string, start: number, end: number): ToolSegment[] => {
  const segments: ToolSegment[] = [];
  let cursor = start;

  while (cursor < end) {
    const nextMatch = findNextToolTagOutsideCode(text, cursor, end);
    if (!nextMatch) {
      pushTextSegment(segments, text.slice(cursor, end));
      break;
    }

    const nextIndex = nextMatch.index;
    const nextType = nextMatch.type;

    if (nextIndex > cursor) {
      pushTextSegment(segments, text.slice(cursor, nextIndex));
    }

    if (nextType === 'tool') {
      const bodyStart = nextIndex + TOOL_OPEN_TAG.length;
      const closeIndex = text.indexOf(TOOL_CLOSE_TAG, bodyStart);

      if (closeIndex === -1 || closeIndex > end) {
        pushTextSegment(segments, text.slice(nextIndex, end));
        break;
      }

      const raw = text.slice(bodyStart, closeIndex);
      const newlineIndex = raw.indexOf('\n');
      const call = decodeHtmlEntities(newlineIndex === -1 ? raw : raw.slice(0, newlineIndex));
      const result = newlineIndex === -1 ? null : decodeHtmlEntities(raw.slice(newlineIndex + 1));

      segments.push({
        type: 'tool',
        call,
        result,
        raw,
      });

      cursor = closeIndex + TOOL_CLOSE_TAG.length;
      continue;
    }

    const groupBodyStart = nextIndex + TOOL_GROUP_OPEN_TAG.length;
    const groupCloseIndex = text.indexOf(TOOL_GROUP_CLOSE_TAG, groupBodyStart);

    if (groupCloseIndex === -1 || groupCloseIndex > end) {
      pushTextSegment(segments, text.slice(nextIndex, end));
      break;
    }

    const groupSegments = parseRange(text, groupBodyStart, groupCloseIndex);
    for (const segment of groupSegments) {
      if (segment.type === 'text' && segment.text.trim().length === 0) {
        continue;
      }
      if (segment.type === 'text') {
        pushTextSegment(segments, segment.text);
      } else {
        segments.push(segment);
      }
    }

    cursor = groupCloseIndex + TOOL_GROUP_CLOSE_TAG.length;
  }

  return segments;
};

/**
 * Parse assistant text into ordered segments of plain text and tool blocks.
 */
export function parseToolTags(text: string): ToolSegment[] {
  if (text.length === 0) {
    return [{ type: 'text', text: '' }];
  }

  const segments = parseRange(text, 0, text.length);
  if (segments.length === 0) {
    return [{ type: 'text', text }];
  }

  return segments;
}
