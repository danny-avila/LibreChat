import { memo } from 'react';
import { User, EarthIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TooltipAnchor } from '@librechat/client';
import type { TSkillSummary } from 'librechat-data-provider';
import { useLocalize, useAuthContext } from '~/hooks';
import { cn } from '~/utils';

// Memoed because `SkillList` renders one of these per skill in the sidebar.
// The `skill` prop is stable (React Query cache entry), `isActive` is the
// only prop that flips on navigation, so memo ensures only the previously-
// active and newly-active items re-render on route change — not all N items.

interface SkillListItemProps {
  skill: TSkillSummary;
  /**
   * Whether this item represents the currently-routed skill. Computed in the
   * parent list so the item can stay a memo'd pure component — reading
   * `useParams` here instead would force every item to re-render on every
   * navigation, defeating the memo.
   */
  isActive: boolean;
}

function SkillListItem({ skill, isActive }: SkillListItemProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { user } = useAuthContext();

  const isShared = skill.author !== user?.id && Boolean(skill.authorName);
  const isPublic = skill.isPublic === true;

  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(`/skills/${skill._id}`)}
        className={cn(
          'group/item w-full rounded-xl border border-border-light text-left transition-colors hover:border-border-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
          isActive && 'border-border-medium bg-surface-hover',
        )}
        aria-current={isActive ? 'page' : undefined}
      >
        <div className="flex items-start gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-text-primary">{skill.name}</span>
              {isShared && (
                <TooltipAnchor
                  description={skill.authorName}
                  side="top"
                  render={
                    <span className="flex shrink-0 items-center" aria-hidden="true">
                      <User className="size-3.5 text-text-secondary" />
                    </span>
                  }
                />
              )}
              {isPublic && (
                <TooltipAnchor
                  description={localize('com_ui_skill_sr_public')}
                  side="top"
                  render={
                    <span className="flex shrink-0 items-center" aria-hidden="true">
                      <EarthIcon className="size-3.5 text-green-500" />
                    </span>
                  }
                />
              )}
            </div>
            {skill.description && (
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-text-secondary">
                {skill.description}
              </p>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

export default memo(SkillListItem);
