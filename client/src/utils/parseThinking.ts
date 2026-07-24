const THINK_CLOSE_TAG = '</think>';

/**
 * Parses thinking/reasoning content embedded in a message text.
 *
 * Supports two formats:
 * - `:::thinking\ncontent\n:::` — directive format used for `reasoning_content` streams
 * - `<think>content</think>` — inline tag format used by models like MiniMax, QwQ
 *
 * During streaming, if `</think>` has not yet arrived, all text after `<think>`
 * is returned as `thinkingContent` with an empty `regularContent`.
 */
export const parseThinkingContent = (text: string) => {
  const directiveMatch = text.match(/:::thinking([\s\S]*?):::/);
  if (directiveMatch) {
    return {
      thinkingContent: directiveMatch[1].trim(),
      regularContent: text.replace(/:::thinking[\s\S]*?:::/, '').trim(),
    };
  }

  if (/^<think>/i.test(text)) {
    const afterOpen = text.slice('<think>'.length);
    const closeIdx = afterOpen.toLowerCase().indexOf(THINK_CLOSE_TAG);
    if (closeIdx === -1) {
      return { thinkingContent: afterOpen, regularContent: '' };
    }
    return {
      thinkingContent: afterOpen.slice(0, closeIdx).trim(),
      regularContent: afterOpen.slice(closeIdx + THINK_CLOSE_TAG.length).trim(),
    };
  }

  return { thinkingContent: '', regularContent: text };
};
