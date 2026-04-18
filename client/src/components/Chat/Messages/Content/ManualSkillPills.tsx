import { ScrollText } from 'lucide-react';

/**
 * Compact pill row rendered on a submitted user message, one chip per skill
 * the user invoked via the `$` popover. Presentational component — takes
 * only the scalar `skills` array, no full message object (keeps
 * `React.memo` comparisons on parent wrappers shallow and cheap).
 *
 * Backend persists the source field (`message.manualSkills`), so callers
 * reading from the message pass `skills={message.manualSkills}` and pills
 * survive page reloads / history renders.
 */
export default function ManualSkillPills({ skills }: { skills?: string[] }) {
  if (!skills || skills.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5 py-0.5" role="list" aria-label="Manually invoked skills">
      {skills.map((name) => (
        <span
          key={name}
          role="listitem"
          className="inline-flex items-center gap-1 rounded-full border border-border-light bg-surface-secondary px-2 py-1 text-xs text-text-secondary"
        >
          <ScrollText className="h-3 w-3 text-cyan-500" aria-hidden="true" />
          <span className="max-w-[12rem] truncate">{name}</span>
        </span>
      ))}
    </div>
  );
}
