import { memo } from 'react';
import { ScrollText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { TSkill } from 'librechat-data-provider';
import { cn } from '~/utils';

interface SkillListItemProps {
  skill: TSkill;
  isActive: boolean;
}

/**
 * Claude.ai–style skill list item: icon badge + name.
 * Active item gets highlighted background + bold font.
 */
function SkillListItem({ skill, isActive }: SkillListItemProps) {
  const navigate = useNavigate();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/skills/${skill._id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/skills/${skill._id}`);
        }
      }}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm transition-colors',
        isActive
          ? 'bg-surface-active text-text-primary'
          : 'text-text-primary hover:bg-surface-hover',
      )}
      aria-current={isActive ? 'true' : undefined}
    >
      {/* Icon badge */}
      <span className="flex size-6 shrink-0 items-center justify-center">
        <span className="flex size-6 items-center justify-center rounded-md border border-border-light bg-surface-primary shadow-sm">
          <ScrollText className="size-3.5 text-text-secondary" aria-hidden="true" />
        </span>
      </span>

      {/* Name */}
      <span className="min-w-0 flex-1">
        <span className={cn('truncate', isActive && 'font-semibold')}>{skill.name}</span>
      </span>
    </div>
  );
}

export default memo(SkillListItem);
