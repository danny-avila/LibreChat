import type { MessageContentComplex } from '@librechat/agents';

/**
 * Signed native parts must retain their exact ordering through reasoning/tool/steer flushes;
 * everything else folds to the text the providers expect alongside `tool_calls`.
 */
export function collapseAssistantReplayContent(
  parts: MessageContentComplex[],
): string | MessageContentComplex[] {
  if (parts.some((part) => part.native_media != null)) return parts;
  return parts
    .flatMap((part) =>
      part.type === 'text' && 'text' in part && typeof part.text === 'string' ? [part.text] : [],
    )
    .join('\n')
    .trim();
}
