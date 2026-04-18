import { ScrollText } from 'lucide-react';
import type { TMessage } from 'librechat-data-provider';

/**
 * Compact pill row rendered on a submitted user message, one chip per skill
 * the user invoked via the `$` popover. Renders directly from the message's
 * `manualSkills` field — backend persists the field, so pills survive page
 * reloads and show in conversation history. Distinct from the live skill
 * tool-call cards that land on the sibling assistant message at finalize:
 * pills live on the user side and stay forever, cards live on the assistant
 * side once the response completes.
 */
export default function ManualSkillPills({ message }: { message?: TMessage }) {
  if (!message?.isCreatedByUser) {
    return null;
  }
  const skills = message.manualSkills;
  if (!skills || skills.length === 0) {
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
