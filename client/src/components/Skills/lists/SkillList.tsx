import { FileText } from 'lucide-react';
import { Skeleton } from '@librechat/client';
import type { TSkillSummary } from 'librechat-data-provider';
import SkillListItem from './SkillListItem';
import { useLocalize } from '~/hooks';

interface SkillListProps {
  skills: TSkillSummary[];
  isLoading: boolean;
}

export default function SkillList({ skills, isLoading }: SkillListProps) {
  const localize = useLocalize();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 px-1">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="m-2 flex flex-col items-center justify-center rounded-lg border border-border-light bg-transparent p-6 text-center">
        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-surface-tertiary">
          <FileText className="size-5 text-text-secondary" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-text-primary">{localize('com_ui_skills_empty')}</p>
        <p className="mt-0.5 text-xs text-text-secondary">{localize('com_ui_skills_add_first')}</p>
      </div>
    );
  }

  return (
    <ul className="flex h-full flex-col gap-1" aria-label={localize('com_ui_skills')}>
      {skills.map((skill) => (
        <SkillListItem key={skill._id} skill={skill} />
      ))}
    </ul>
  );
}
