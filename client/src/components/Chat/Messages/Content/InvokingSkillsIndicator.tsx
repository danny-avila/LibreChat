import { useMemo } from 'react';
import { ScrollText } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useChatContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import store from '~/store';

/**
 * Transient mid-stream indicator rendered on an assistant message whose
 * parent user message invoked skills manually via `$`. Bridges the gap
 * between submit and the real `skill` tool_call content part landing at
 * finalize (via the backend's `buildSkillPrimeContentParts` unshift).
 *
 * Data source is the in-flight submission (per-chat-index Recoil atom),
 * not the messages array. Messages flip IDs mid-stream — the user message
 * keeps its client-side intermediate UUID, then finalize swaps in the
 * server ID — and the conversation also gets a fresh server ID on brand
 * new chats, which means any `getMessages()` / `queryClient` lookup by
 * key races the server. The submission object is stable from
 * `setSubmission(...)` to `setSubmission(null)` and already carries the
 * skill list plus the authoritative user-message ID, so keying the
 * indicator off of it sidesteps the whole ID-drift problem.
 *
 * Hide condition: once the assistant content grows a `skill` tool_call,
 * the real card took over and the indicator steps aside. Also hides
 * outside the in-flight window (submission null, or parent mismatch)
 * so history renders don't flash placeholder chips.
 *
 * Why not a proper streaming content part: the LLM's first `ON_MESSAGE_DELTA`
 * lands at content index 0 and would either collide with a pre-seeded skill
 * tool_call (type-mismatch guard blocks the text stream) or sit below it
 * via a sparse-array offset (card ends up at the bottom after compaction).
 * Mirroring the submission's `manualSkills` into a sibling render slot
 * above `ContentParts` sidesteps the index math entirely.
 */
export default function InvokingSkillsIndicator({ message }: { message?: TMessage }) {
  const localize = useLocalize();
  const { index } = useChatContext();
  const submission = useRecoilValue(store.submissionByIndex(index));

  const skills = useMemo(() => {
    if (!message || message.isCreatedByUser || !submission) {
      return [];
    }
    const manualSkills = submission.manualSkills;
    if (!manualSkills || manualSkills.length === 0) {
      return [];
    }
    /**
     * Only surface on the assistant message for THIS submission's turn.
     * `submission.userMessage.messageId` is the client-side intermediate
     * UUID — same ID the backend echoes back in the `created` event and
     * the same ID on `message.parentMessageId` during the stream.
     */
    if (message.parentMessageId !== submission.userMessage?.messageId) {
      return [];
    }
    return manualSkills;
  }, [message, submission]);

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
