import { useMemo } from 'react';
import { ScrollText } from 'lucide-react';
import { Constants, ContentTypes } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useChatContext } from '~/Providers';
import { useLocalize } from '~/hooks';

/**
 * Transient mid-stream indicator rendered on an assistant message whose
 * parent user message invoked skills manually via `$`. Bridges the gap
 * between submit and the real `skill` tool_call content part landing at
 * finalize (via the backend's `buildSkillPrimeContentParts` unshift).
 *
 * Hides as soon as the assistant message's own content grows a `skill`
 * tool_call — that's the authoritative card, we step aside. Transient by
 * render condition, no Recoil/SSE coupling needed.
 *
 * Why not a proper streaming content part: the LLM's first `ON_MESSAGE_DELTA`
 * lands at content index 0 and would either collide with a pre-seeded skill
 * tool_call (type-mismatch guard blocks the text stream) or sit below it
 * via a sparse-array offset (card ends up at the bottom after compaction).
 * Mirroring the parent user message's `manualSkills` into a sibling render
 * slot above `ContentParts` sidesteps the index math entirely.
 *
 * Parent lookup goes through `useChatContext().getMessages()` rather than a
 * direct `queryClient` read. The underlying React Query cache is keyed by
 * `paramId` (from the URL), which for a new chat is literally `"new"` until
 * the server assigns a real conversation ID — but `message.conversationId`
 * is already the server ID by the time events arrive. Going through the
 * chat context keeps us on the same `paramId` the rest of the UI reads
 * from, so lookups work on new chats too.
 */
export default function InvokingSkillsIndicator({ message }: { message?: TMessage }) {
  const localize = useLocalize();
  const { getMessages } = useChatContext();

  const skills = useMemo(() => {
    if (!message || message.isCreatedByUser) {
      return [];
    }
    const parentId = message.parentMessageId;
    if (!parentId || parentId === Constants.NO_PARENT) {
      return [];
    }
    const messages = getMessages();
    const parent = messages?.find((m) => m.messageId === parentId);
    return parent?.manualSkills ?? [];
  }, [message, getMessages]);

  /**
   * Once the real card (server's unshifted `skill` tool_call content part)
   * reaches the assistant message, step aside. The card renders via the
   * existing `SkillCall` component inside `ContentParts` and carries the
   * authoritative output string.
   */
  const responseHasSkillCard = useMemo(() => {
    if (!message?.content || !Array.isArray(message.content)) {
      return false;
    }
    for (const part of message.content) {
      if (
        part != null &&
        typeof part === 'object' &&
        (part as { type?: string }).type === ContentTypes.TOOL_CALL
      ) {
        const toolCall = (part as { tool_call?: { name?: string } }).tool_call;
        if (toolCall?.name === 'skill') {
          return true;
        }
      }
    }
    return false;
  }, [message?.content]);

  if (skills.length === 0 || responseHasSkillCard) {
    return null;
  }

  return (
    <div className="mb-2 flex flex-wrap gap-1.5 py-0.5" role="list" aria-label="Skills loading">
      {skills.map((name) => (
        <span
          key={name}
          role="listitem"
          className="inline-flex items-center gap-1 rounded-full border border-border-light bg-surface-secondary px-2 py-1 text-xs text-text-secondary"
        >
          <ScrollText className="h-3 w-3 shrink-0 animate-pulse text-cyan-500" aria-hidden="true" />
          <span className="max-w-[12rem] truncate">
            {localize('com_ui_skill_running', { 0: name })}
          </span>
        </span>
      ))}
    </div>
  );
}
