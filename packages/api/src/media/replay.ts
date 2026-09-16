import type { MessageContentComplex } from '@librechat/agents';

/** Signed native parts and media must retain their exact ordering through reasoning/tool/steer flushes. */
export function collapseAssistantReplayContent(
  parts: MessageContentComplex[],
): string | MessageContentComplex[] {
  if (parts.some((part) => part.type !== 'text' || part.native_media != null)) return parts;
  return parts
    .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();
}
