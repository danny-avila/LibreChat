import { memo } from 'react';
import { EarthIcon, User } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { useNavigate, useParams } from 'react-router-dom';
import type { TSkill } from 'librechat-data-provider';
import { useLocalize, useAuthContext } from '~/hooks';
import { cn } from '~/utils';

function SkillListItem({ skill }: { skill: TSkill }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const params = useParams();
  const { user } = useAuthContext();

  const isShared = skill.author !== user?.id && Boolean(skill.authorName);
  const isPublic = skill.isPublic === true;
  const isActive = params.skillId === skill._id;

  return (
    <div
      className={cn(
        'group/skill relative mb-1 rounded-xl border border-border-light transition-colors hover:border-border-medium',
        isActive && 'border-border-medium bg-surface-hover',
      )}
    >
      <button
        type="button"
        className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
        onClick={() => navigate(`/skills/${skill._id}/edit`)}
        aria-label={skill.name}
      />
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-text-primary">{skill.name}</span>
            {isShared && (
              <TooltipAnchor
                description={localize('com_ui_by_author', { 0: skill.authorName })}
                side="top"
                render={
                  <span
                    tabIndex={0}
                    role="img"
                    aria-label={localize('com_ui_by_author', { 0: skill.authorName })}
                    className="flex shrink-0 items-center"
                  >
                    <User className="size-3.5 text-text-secondary" aria-hidden="true" />
                  </span>
                }
              />
            )}
            {isPublic && (
              <TooltipAnchor
                description={localize('com_ui_sr_public_skill')}
                side="top"
                render={
                  <span
                    tabIndex={0}
                    role="img"
                    aria-label={localize('com_ui_sr_public_skill')}
                    className="flex shrink-0 items-center"
                  >
                    <EarthIcon className="size-3.5 text-green-400" aria-hidden="true" />
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
    </div>
  );
}

export default memo(SkillListItem);
