import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import SkillListSkeleton from '../lists/SkillListSkeleton';
import { useListSkillsQuery } from '~/data-provider';
import SkillListPanel from '../lists/SkillList';
import { PanelContent } from '~/components/ui';
import FilterSkills from './FilterSkills';
import { useDebounce } from '~/hooks';
import { cn } from '~/utils';

interface SkillsSidePanelProps {
  className?: string;
}

/**
 * Skills sidebar panel.
 * Header: filter input + create menu, matching the other side panels.
 */

export default function SkillsSidePanel({ className }: SkillsSidePanelProps) {
  const { skillId: activeSkillId } = useParams();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 250);

  const listQuery = useListSkillsQuery({ search: debouncedSearch || undefined, limit: 50 });
  const skills = useMemo(() => listQuery.data?.skills ?? [], [listQuery.data]);

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col overflow-hidden border-r border-border-light',
        className,
      )}
    >
      <FilterSkills
        className="shrink-0 px-4 pb-2 pt-3"
        searchTerm={searchTerm}
        onSearchChange={(e) => setSearchTerm(e.target.value)}
      />

      {/* Only the list scrolls */}
      <PanelContent
        isLoading={listQuery.isLoading}
        skeleton={<SkillListSkeleton />}
        className="px-4"
      >
        <SkillListPanel
          skills={skills as unknown as import('librechat-data-provider').TSkill[]}
          activeSkillId={activeSkillId}
        />
      </PanelContent>
    </div>
  );
}
