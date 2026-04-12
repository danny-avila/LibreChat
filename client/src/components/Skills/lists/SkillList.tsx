import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Skeleton } from '@librechat/client';
import type { TSkill } from 'librechat-data-provider';
import SkillListItem from './SkillListItem';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface SkillListProps {
  skills: TSkill[];
  isLoading: boolean;
  activeSkillId?: string;
}

/**
 * Claude.ai–style skill list with a collapsible "Personal skills" section.
 */
export default function SkillList({ skills, isLoading, activeSkillId }: SkillListProps) {
  const localize = useLocalize();
  const [sectionOpen, setSectionOpen] = useState(true);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 px-2 pt-2">
        <Skeleton className="h-8 w-full rounded-lg" />
        <Skeleton className="h-8 w-full rounded-lg" />
        <Skeleton className="h-8 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-px">
      {/* Section header */}
      <div className="flex items-center justify-between px-2 pb-2">
        <button
          type="button"
          onClick={() => setSectionOpen((prev) => !prev)}
          className="flex cursor-pointer items-center gap-1.5"
          aria-expanded={sectionOpen}
        >
          <ChevronRight
            className={cn(
              'size-3 shrink-0 text-text-tertiary transition-transform duration-200',
              sectionOpen && 'rotate-90',
            )}
            aria-hidden="true"
          />
          <span className="text-xs text-text-tertiary">{localize('com_ui_skills')}</span>
        </button>
      </div>

      {/* Skill items */}
      {sectionOpen && (
        <div className="flex flex-col gap-px">
          {skills.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-text-tertiary">
              {localize('com_ui_skills_empty')}
            </p>
          ) : (
            skills.map((skill) => (
              <SkillListItem key={skill._id} skill={skill} isActive={skill._id === activeSkillId} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
