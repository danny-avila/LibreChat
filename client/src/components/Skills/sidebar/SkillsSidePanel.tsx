import { useState, useMemo } from 'react';
import { Search, Plus } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useListSkillsQuery } from '~/data-provider';
import { useDebounce, useHasAccess, useLocalize } from '~/hooks';
import { CreateSkillDialog } from '../dialogs';
import SkillListPanel from '../lists/SkillList';
import { cn } from '~/utils';

interface SkillsSidePanelProps {
  className?: string;
}

/**
 * Claude.ai–style skills sidebar panel.
 * Header: "Skills" + search + add.
 * Body: collapsible "Personal skills" section with skill list.
 */
export default function SkillsSidePanel({ className }: SkillsSidePanelProps) {
  const localize = useLocalize();
  const { skillId: activeSkillId } = useParams();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
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
      {/* Header */}
      <div className="flex min-h-[3.5rem] items-center justify-between px-6 py-3">
        <h2 className="truncate text-lg font-bold text-text-primary">
          {localize('com_ui_skills')}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchOpen((prev) => !prev)}
            className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label={localize('com_ui_search')}
          >
            <Search className="size-4" />
          </button>
          {hasCreateAccess && (
            <button
              type="button"
              onClick={() => setCreateDialogOpen(true)}
              className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              aria-label={localize('com_ui_create_skill')}
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search input (collapsible) */}
      {searchOpen && (
        <div className="px-4 pb-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={localize('com_ui_search_skills')}
            aria-label={localize('com_ui_search_skills')}
            className="h-8 w-full rounded-md border border-border-light bg-transparent px-3 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring-primary"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </div>
      )}

      {/* Skill list */}
      <div className="flex-1 overflow-y-auto px-4">
        <SkillListPanel
          skills={skills as unknown as import('librechat-data-provider').TSkill[]}
          isLoading={listQuery.isLoading}
          activeSkillId={activeSkillId}
        />
      </div>

      {/* Create dialog */}
      <CreateSkillDialog isOpen={createDialogOpen} setIsOpen={setCreateDialogOpen} />
    </div>
  );
}
