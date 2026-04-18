import { ScrollText } from 'lucide-react';
import { useLocalize } from '~/hooks';

/**
 * Transient "Running X" chips rendered on an assistant message during the
 * window between submit and the real `skill` tool_call content part landing
 * at finalize (via the backend's `buildSkillPrimeContentParts` unshift).
 *
 * Presentational component. All visibility logic — user-vs-assistant, whether
 * a skill card has arrived, whether any skills were queued — belongs to the
 * caller, so this stays a simple map over `skills`. No full-message object
 * gets passed in (that would bust `React.memo` comparisons upstream in
 * `ContentParts`); only the scalar array the UI actually renders from.
 *
 * `createdHandler` in `useEventHandlers` seeds the source of `skills`
 * (copied from `submission.manualSkills` onto the initial response), and
 * the field rides through subsequent SSE mutations via spread preservation.
 */
export default function InvokingSkillsIndicator({ skills }: { skills?: string[] }) {
  const localize = useLocalize();

  if (!skills || skills.length === 0) {
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
