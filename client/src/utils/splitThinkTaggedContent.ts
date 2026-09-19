export type SplitThinkTaggedContent = {
  thinking: string;
  text: string;
};

const OPEN_TAG = /<think\b[^>]*>/i;
const CLOSE_TAG = /<\/think>/i;

const findTag = (
  content: string,
  pattern: RegExp,
  from: number,
): { index: number; length: number } | null => {
  const match = content.slice(from).match(pattern);
  if (match?.index == null) {
    return null;
  }
  return { index: from + match.index, length: match[0].length };
};

const hasThinkTag = (content: string): boolean =>
  findTag(content, OPEN_TAG, 0) != null || findTag(content, CLOSE_TAG, 0) != null;

/**
 * Splits a string that may wrap reasoning in `<think>...</think>` (case-insensitive).
 *
 * - No tags → thinking empty, text is the original string
 * - Open tag without a close (mid-stream) → everything after the open tag is thinking
 * - Closed tags → thinking is the inner content; text is everything outside/after
 */
export function splitThinkTaggedContent(content: string): SplitThinkTaggedContent {
  if (typeof content !== 'string' || content.length === 0) {
    return { thinking: '', text: '' };
  }

  const thinkingParts: string[] = [];
  let textResult = '';
  let position = 0;

  while (position < content.length) {
    const open = findTag(content, OPEN_TAG, position);
    if (open == null) {
      const close = findTag(content, CLOSE_TAG, position);
      if (close == null) {
        textResult += content.slice(position);
        break;
      }
      thinkingParts.push(content.slice(position, close.index));
      position = close.index + close.length;
      continue;
    }

    textResult += content.slice(position, open.index);
    const innerStart = open.index + open.length;
    const close = findTag(content, CLOSE_TAG, innerStart);
    if (close == null) {
      thinkingParts.push(content.slice(innerStart));
      break;
    }

    thinkingParts.push(content.slice(innerStart, close.index));
    position = close.index + close.length;
  }

  return {
    thinking: thinkingParts.join('\n').trim(),
    text: textResult.trim(),
  };
}

/**
 * THINK content parts are already classified as reasoning. Tags are an optional
 * wrapper; text after a closing tag is the visible response that leaked into
 * the part (MiniMax-style inline `<think>` streaming).
 */
export function splitThinkPartContent(content: string): SplitThinkTaggedContent {
  if (typeof content !== 'string' || content.length === 0) {
    return { thinking: '', text: '' };
  }
  if (!hasThinkTag(content)) {
    return { thinking: content, text: '' };
  }
  return splitThinkTaggedContent(content);
}

/** Thoughts body for a THINK part: inner reasoning only, never post-`</think>` text. */
export function stripThinkTags(reasoning: string): string {
  return splitThinkPartContent(reasoning).thinking;
}
