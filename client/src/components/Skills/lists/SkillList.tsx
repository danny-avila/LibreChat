import { FileText } from 'lucide-react';
import { Skeleton } from '@librechat/client';
import type { TSkill } from 'librechat-data-provider';
import SkillListItem from './SkillListItem';
import { useLocalize } from '~/hooks';

export default function SkillList({
  skills = [],
  isLoading,
}: {
  skills?: TSkill[];
  isLoading: boolean;
}) {
  const localize = useLocalize();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 px-1">
        <Skeleton className="my-2 flex h-[84px] w-full rounded-2xl border-0 px-3 pb-4 pt-3" />
        <Skeleton className="my-2 flex h-[84px] w-full rounded-2xl border-0 px-3 pb-4 pt-3" />
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="my-2 flex flex-col items-center justify-center rounded-lg border border-border-light bg-transparent p-6 text-center">
        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-surface-tertiary">
          <FileText className="size-5 text-text-secondary" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-text-primary">
          {localize('com_ui_no_skills_title')}
        </p>
        <p className="mt-0.5 text-xs text-text-secondary">{localize('com_ui_add_first_skill')}</p>
      </div>
    );
  }

  return (
    <section
      className="flex h-full flex-col overflow-y-auto"
      aria-label={localize('com_ui_skill_list')}
    >
      <div className="overflow-y-auto overflow-x-hidden">
        {skills.map((skill) => (
          <SkillListItem key={skill._id} skill={skill} />
        ))}
      </div>
    </section>
  );
}
