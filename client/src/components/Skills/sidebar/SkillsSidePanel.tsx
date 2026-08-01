import { useState, useMemo } from 'react';
import { Spinner } from '@librechat/client';
import { useParams } from 'react-router-dom';
import type { TSkillListResponse } from 'librechat-data-provider';
import { useLocalize, useDebounce, useNavScrolling } from '~/hooks';
import SkillListSkeleton from '../lists/SkillListSkeleton';
import { useSkillsInfiniteQuery } from '~/data-provider';
import SkillListPanel from '../lists/SkillList';
import { PanelContent } from '~/components/ui';
import FilterSkills from './FilterSkills';
import { cn } from '~/utils';

interface SkillsSidePanelProps {
  className?: string;
}

/**
 * Skills sidebar panel.
 * Header: filter input + create menu, matching the other side panels.
 */

export default function SkillsSidePanel({ className }: SkillsSidePanelProps) {
  const localize = useLocalize();
  const { skillId: activeSkillId } = useParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [showLoading, setShowLoading] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 250);

  const listQuery = useSkillsInfiniteQuery({ search: debouncedSearch || undefined, limit: 20 });

  const pages = useMemo(() => listQuery.data?.pages ?? [], [listQuery.data]);
  const skills = useMemo(() => pages.flatMap((page) => page.skills), [pages]);

  const lastPage = pages[pages.length - 1];
  const nextCursor = lastPage?.has_more === true ? lastPage.after : null;

  const { containerRef } = useNavScrolling<TSkillListResponse>({
    setShowLoading,
    nextCursor,
    isFetchingNext: listQuery.isFetchingNextPage,
    fetchNextPage: listQuery.fetchNextPage,
  });

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
        ref={containerRef}
        isLoading={listQuery.isLoading}
        skeleton={<SkillListSkeleton />}
        className="px-4"
      >
        <SkillListPanel skills={skills} activeSkillId={activeSkillId} />
        {/* Appending the next page, so the loaded rows stay put */}
        {(listQuery.isFetchingNextPage || showLoading) && (
          <div className="flex shrink-0 justify-center py-2">
            <Spinner className="size-4" aria-label={localize('com_ui_loading')} />
          </div>
        )}
      </PanelContent>
    </div>
  );
}
