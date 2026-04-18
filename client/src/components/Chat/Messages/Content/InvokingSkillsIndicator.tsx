import { ScrollText } from 'lucide-react';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

/**
 * Transient "Running X" chips rendered on an assistant message during the
 * window between submit and the real `skill` tool_call content part landing
 * at finalize (via the backend's `buildSkillPrimeContentParts` unshift).
 *
 * Reads a single field off the message prop — `message.manualSkills` —
 * which `createdHandler` seeds onto the assistant placeholder from
 * `submission.manualSkills` when the stream starts. No hooks that
 * subscribe to state, so the component only re-renders when its own
 * `message` prop changes (unlike the previous `useRecoilValue`
 * variant, which would re-render every message's indicator whenever
 * the submission atom shifted).
 *
 * Lifecycle: seeded → rides through `ON_RUN_STEP` / `updateContent`
 * message spreads → finalHandler replaces the message with the
 * server's `responseMessage`, which doesn't carry the frontend-only
 * field, and by then the authoritative `skill` tool_call is in
 * `content` anyway. Indicator hides the moment the real card lands
 * (checked by scanning `message.content`).
 *
 * Why not a proper streaming content part: the LLM's first
 * `ON_MESSAGE_DELTA` lands at content index 0 and would either
 * collide with a pre-seeded skill tool_call (type-mismatch guard
 * blocks the text stream) or sit below it via a sparse-array offset
 * (card ends up at the bottom after compaction). A sibling render
 * slot above `ContentParts` sidesteps the index math entirely.
 */
export default function InvokingSkillsIndicator({ message }: { message?: TMessage }) {
  const localize = useLocalize();

  if (!message || message.isCreatedByUser) {
    return null;
  }
  const skills = message.manualSkills;
  if (!skills || skills.length === 0) {
    return null;
  }

  /**
   * Once the assistant content grows a `skill` tool_call, the real card
   * rendering in `ContentParts` takes over and the placeholder is
   * redundant. Plain iteration, no `useMemo` — skipping one `includes`
   * per render is cheaper than tracking a dep array.
   */
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (
        part != null &&
        typeof part === 'object' &&
        (part as { type?: string }).type === ContentTypes.TOOL_CALL
      ) {
        const toolCall = (part as { tool_call?: { name?: string } }).tool_call;
        if (toolCall?.name === 'skill') {
          return null;
        }
      }
    }
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
