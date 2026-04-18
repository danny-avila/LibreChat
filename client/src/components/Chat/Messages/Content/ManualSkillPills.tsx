import { useMemo } from 'react';
import { ScrollText } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { ContentTypes, QueryKeys } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import store from '~/store';

/**
 * Small pill row rendered on a submitted user message showing which skills
 * the user invoked manually via the `$` popover. Transient UI that bridges
 * the gap between submission and the first server-streamed skill cards on
 * the sibling assistant response.
 *
 * Hide condition: once the assistant response for this user message
 * contains a `tool_call` content part with `name: 'skill'`, the real cards
 * are rendering in the assistant bubble and the pills are redundant. We
 * don't need to explicitly clear the atom — the render-side predicate is
 * sufficient, and `useClearStates` resets the family on convo switch.
 */
export default function ManualSkillPills({ message }: { message?: TMessage }) {
  const skills = useRecoilValue(store.attachedSkillsByMessageId(message?.messageId ?? ''));
  const queryClient = useQueryClient();

  const hasLiveSkillCard = useMemo(() => {
    if (!message?.messageId || !message.conversationId) {
      return false;
    }
    const messages = queryClient.getQueryData<TMessage[]>([
      QueryKeys.messages,
      message.conversationId,
    ]);
    if (!messages) {
      return false;
    }
    /**
     * The assistant response sits as the child of this user message.
     * Scan the conversation for a non-user message whose parent is us and
     * whose content has a skill tool_call — that's the backend's live
     * card arriving. One pass, no recursion.
     */
    for (const m of messages) {
      if (m.isCreatedByUser || m.parentMessageId !== message.messageId) {
        continue;
      }
      if (!Array.isArray(m.content)) {
        continue;
      }
      for (const part of m.content) {
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
    }
    return false;
    /** Re-evaluate on every render — the pills component mounts under the
     * message bubble which re-renders as the stream progresses, so a
     * subscription isn't needed here. */
  }, [message?.messageId, message?.conversationId, queryClient]);

  if (!message?.isCreatedByUser || skills.length === 0 || hasLiveSkillCard) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="list" aria-label="Manually invoked skills">
      {skills.map((name) => (
        <span
          key={name}
          role="listitem"
          className="inline-flex items-center gap-1 rounded-full border border-border-light bg-surface-secondary px-2 py-0.5 text-xs text-text-secondary"
        >
          <ScrollText className="h-3 w-3 text-cyan-500" aria-hidden="true" />
          <span className="max-w-[12rem] truncate">{name}</span>
        </span>
      ))}
    </div>
  );
}
