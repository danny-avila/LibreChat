import { memo } from 'react';
import { EarthIcon, User } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { useNavigate, useParams } from 'react-router-dom';
import type { TSkillSummary } from 'librechat-data-provider';
import { useLocalize, useAuthContext } from '~/hooks';
import { cn } from '~/utils';

interface SkillListItemProps {
  skill: TSkillSummary;
}

function SkillListItem({ skill }: SkillListItemProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { skillId } = useParams();
  const { user } = useAuthContext();

  const isShared = skill.author !== user?.id && Boolean(skill.authorName);
  const isPublic = skill.isPublic === true;
  const isActive = skillId === skill._id;

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
