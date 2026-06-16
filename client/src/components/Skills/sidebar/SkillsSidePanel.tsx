import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useListSkillsQuery } from '~/data-provider';
import { useDebounce, useHasAccess, useLocalize } from '~/hooks';
import { CreateSkillMenu } from '../buttons';
import SkillListPanel from '../lists/SkillList';
import { cn } from '~/utils';

interface SkillsSidePanelProps {
  className?: string;
  hideHeader?: boolean;
}

/**
 * Claude.ai–style skills sidebar panel.
 * Header: "Skills" title + search icon + create menu (+ dropdown).
 * Body: "My Skills" collapsible section with skill list.
 */
export default function SkillsSidePanel({ className, hideHeader = false }: SkillsSidePanelProps) {
  const localize = useLocalize();
  const { skillId: activeSkillId } = useParams();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const handleOpenSearch = () => setSearchOpen(true);
  const handleCloseSearchInternal = () => { setSearchOpen(false); setSearchTerm(''); };

  const debouncedSearch = useDebounce(searchTerm, 250);

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.CREATE,
  });

  const listQuery = useListSkillsQuery({ search: debouncedSearch || undefined, limit: 50 });
  const skills = useMemo(() => listQuery.data?.skills ?? [], [listQuery.data]);

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col overflow-hidden border-r border-border-light',
        className,
      )}
    >
      {/* Header — title+icons or inline search input (hidden when controlled externally) */}
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-2">
          {searchOpen ? (
            <>
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-secondary" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={localize('com_ui_search')}
                  aria-label={localize('com_ui_search_skills')}
                  className="h-8 w-full rounded-md border border-border-light bg-transparent pl-8 pr-3 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring-primary"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={handleCloseSearchInternal}
                className="ml-2 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                aria-label={localize('com_ui_close')}
              >
                <X className="size-4" />
              </button>
            </>
          ) : (
            <>
              <h2 className="truncate text-lg font-bold text-text-primary">
                {localize('com_ui_skills')}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleOpenSearch}
                  className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                  aria-label={localize('com_ui_search')}
                >
                  <Search className="size-4" />
                </button>
                {hasCreateAccess && <CreateSkillMenu />}
              </div>
            </>
          )}
        </div>
      )}

      {/* Always-visible search input when used in full-page layout */}
      {hideHeader && (
        <div className="flex-shrink-0 px-6 pb-6 pt-6">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-secondary" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={localize('com_ui_search')}
              aria-label={localize('com_ui_search_skills')}
              className="h-8 w-full rounded-md border border-border-light bg-transparent pl-8 pr-3 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring-primary"
            />
          </div>
        </div>
      )}

      {/* Skill list */}
      <div className={cn('flex-1 overflow-y-auto', hideHeader ? 'px-6 pb-6' : 'px-4')}>
        <SkillListPanel
          skills={skills as unknown as import('librechat-data-provider').TSkill[]}
          isLoading={listQuery.isLoading}
          activeSkillId={activeSkillId}
        />
      </div>
    </div>
  );
}
