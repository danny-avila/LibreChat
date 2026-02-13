/**
 * Parser for MindRoom's inline `<tool>` and `<tool-group>` tags in assistant messages.
 *
 * The backend emits tool calls as `<tool>call\nresult</tool>` blocks inline in
 * streamed assistant content. This parser splits text into ordered segments of
 * plain text and tool blocks so Text.tsx can render tool segments with the
 * existing ToolCall component.
 *
 * Parsing rules:
 * - `<tool>call</tool>`           → pending (result = null)
 * - `<tool>call\nresult</tool>`   → completed (result = "result")
 * - `<tool>call\n</tool>`         → completed with empty result (result = "")
 * - `<tool-group>` wrapper        → flattened into individual tool segments
 * - Missing `</tool>` closing tag → treated as plain text (streaming fragment)
 * - HTML entities in content are decoded (`&lt;` → `<`, etc.)
 */

export type ToolSegment =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; call: string; result: string | null; raw: string };

const TOOL_TAG_OPEN = '<tool>';
const TOOL_TAG_CLOSE = '</tool>';
const TOOL_GROUP_OPEN = '<tool-group>';
const TOOL_GROUP_CLOSE = '</tool-group>';

/**
 * Decode common HTML entities that the backend applies to inner content.
 */
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

/**
 * Extract the tool name from a call string.
 * Takes the text before the first `(` as the function name,
 * falling back to "tool" if no parenthesis is found.
 */
function extractToolName(call: string): string {
  const parenIndex = call.indexOf('(');
  if (parenIndex <= 0) {
    return 'tool';
  }
  const name = call.slice(0, parenIndex).trim();
  return name || 'tool';
}

/**
 * Parse a single `<tool>` body into a ToolSegment.
 */
function parseToolBody(body: string, raw: string): ToolSegment {
  const decoded = decodeHTMLEntities(body);
  const newlineIndex = decoded.indexOf('\n');

  if (newlineIndex === -1) {
    // No newline → pending (still executing)
    const call = decoded.trim();
    return { type: 'tool', name: extractToolName(call), call, result: null, raw };
  }

  // Newline present → completed
  const call = decoded.slice(0, newlineIndex).trim();
  const result = decoded.slice(newlineIndex + 1);
  return { type: 'tool', name: extractToolName(call), call, result, raw };
}

/**
 * Parse all `<tool>` blocks from a text string, returning ordered segments.
 * This handles both standalone `<tool>` blocks and `<tool>` blocks inside
 * `<tool-group>` wrappers.
 *
 * Linear-time, non-throwing. Unclosed tags are treated as plain text.
 */
export function parseToolTags(text: string): ToolSegment[] {
  if (!text) {
    return [{ type: 'text', text: '' }];
  }

  // Quick check: if no tool tags at all, return text as-is
  if (!text.includes(TOOL_TAG_OPEN)) {
    return [{ type: 'text', text }];
  }

  const segments: ToolSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    // Look for the next <tool> or <tool-group> tag
    const toolIdx = text.indexOf(TOOL_TAG_OPEN, cursor);
    const groupIdx = text.indexOf(TOOL_GROUP_OPEN, cursor);

    // Determine which comes first
    let nextIdx = -1;
    let isGroup = false;

    if (toolIdx === -1 && groupIdx === -1) {
      // No more tags — rest is plain text
      segments.push({ type: 'text', text: text.slice(cursor) });
      break;
    } else if (toolIdx === -1) {
      nextIdx = groupIdx;
      isGroup = true;
    } else if (groupIdx === -1) {
      nextIdx = toolIdx;
      isGroup = false;
    } else {
      // Both found — take whichever comes first
      if (groupIdx < toolIdx) {
        nextIdx = groupIdx;
        isGroup = true;
      } else {
        nextIdx = toolIdx;
        isGroup = false;
      }
    }

    // Add any text before the tag
    if (nextIdx > cursor) {
      segments.push({ type: 'text', text: text.slice(cursor, nextIdx) });
    }

    if (isGroup) {
      // Handle <tool-group>...</tool-group>
      const groupCloseIdx = text.indexOf(TOOL_GROUP_CLOSE, nextIdx + TOOL_GROUP_OPEN.length);
      if (groupCloseIdx === -1) {
        // Unclosed group tag — treat as plain text
        segments.push({ type: 'text', text: text.slice(nextIdx) });
        break;
      }

      const groupContent = text.slice(nextIdx + TOOL_GROUP_OPEN.length, groupCloseIdx);
      const groupRaw = text.slice(nextIdx, groupCloseIdx + TOOL_GROUP_CLOSE.length);

      // Parse individual <tool> blocks within the group
      let groupCursor = 0;
      while (groupCursor < groupContent.length) {
        const innerToolIdx = groupContent.indexOf(TOOL_TAG_OPEN, groupCursor);
        if (innerToolIdx === -1) {
          break;
        }

        const innerCloseIdx = groupContent.indexOf(
          TOOL_TAG_CLOSE,
          innerToolIdx + TOOL_TAG_OPEN.length,
        );
        if (innerCloseIdx === -1) {
          break;
        }

        const body = groupContent.slice(innerToolIdx + TOOL_TAG_OPEN.length, innerCloseIdx);
        const innerRaw = groupContent.slice(innerToolIdx, innerCloseIdx + TOOL_TAG_CLOSE.length);
        segments.push(parseToolBody(body, innerRaw));
        groupCursor = innerCloseIdx + TOOL_TAG_CLOSE.length;
      }

      // If no tools were found in group, push group as raw text
      if (groupCursor === 0) {
        segments.push({ type: 'text', text: groupRaw });
      }

      cursor = groupCloseIdx + TOOL_GROUP_CLOSE.length;
    } else {
      // Handle standalone <tool>...</tool>
      const closeIdx = text.indexOf(TOOL_TAG_CLOSE, nextIdx + TOOL_TAG_OPEN.length);
      if (closeIdx === -1) {
        // Unclosed tag — treat rest as plain text (streaming fragment)
        segments.push({ type: 'text', text: text.slice(nextIdx) });
        break;
      }

      const body = text.slice(nextIdx + TOOL_TAG_OPEN.length, closeIdx);
      const raw = text.slice(nextIdx, closeIdx + TOOL_TAG_CLOSE.length);
      segments.push(parseToolBody(body, raw));
      cursor = closeIdx + TOOL_TAG_CLOSE.length;
    }
  }

  return segments;
}
