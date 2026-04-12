import { useState, useCallback, useMemo } from 'react';
import { Button, Sidebar, TooltipAnchor } from '@librechat/client';
import { useListSkillsQuery } from '~/data-provider';
import FilterSkills from './FilterSkills';
import { useLocalize } from '~/hooks';
import { SkillList } from '../lists';
import { cn } from '~/utils';

export default function SkillsSidePanel({
  className = '',
  closePanelRef,
  onClose,
}: {
  className?: string;
  closePanelRef?: React.RefObject<HTMLButtonElement>;
  onClose?: () => void;
}) {
  const localize = useLocalize();
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  const skillsQuery = useListSkillsQuery(searchTerm ? { search: searchTerm } : {}, {
    enabled: true,
  });
  const filteredSkills = useMemo(() => {
    // Backend list response is `{ skills: TSkillSummary[]; ... }` (renamed
    // from `.data` in the CRUD PR). Coerce to `TSkill[]` to match the
    // downstream `SkillList` prop shape — extra fields are ignored there.
    const skills = (skillsQuery.data?.skills ??
      []) as unknown as import('librechat-data-provider').TSkill[];
    if (!searchTerm) {
      return skills;
    }
    const term = searchTerm.toLowerCase();
    return skills.filter((s) => s.name.toLowerCase().includes(term));
  }, [skillsQuery.data?.skills, searchTerm]);

  const isLoading = skillsQuery.isLoading;

  return (
    <div id="skills-panel" className={cn('flex h-full w-full flex-col', className)}>
      {onClose && (
        <div className="flex items-center justify-end px-2 py-[2px] md:py-2">
          <TooltipAnchor
            description={localize('com_nav_close_sidebar')}
            render={
              <Button
                ref={closePanelRef}
                size="icon"
                variant="outline"
                data-testid="close-skills-panel-button"
                aria-label={localize('com_nav_close_sidebar')}
                aria-expanded={true}
                className="rounded-full border-none bg-transparent p-2 hover:bg-surface-hover md:rounded-xl"
                onClick={onClose}
              >
                <Sidebar />
              </Button>
            }
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden">
        <FilterSkills searchTerm={searchTerm} onSearchChange={handleSearchChange} />
        <div className="relative flex h-full flex-col overflow-y-auto">
          <SkillList skills={filteredSkills} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
