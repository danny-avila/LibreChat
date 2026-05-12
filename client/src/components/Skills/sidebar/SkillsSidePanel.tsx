import { useState, useMemo } from 'react';
import { Plus, Search, Upload, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useListSkillsQuery } from '~/data-provider';
import { useDebounce, useHasAccess, useLocalize } from '~/hooks';
import { CreateSkillDialog, UploadSkillDialog } from '../dialogs';
import SkillListPanel from '../lists/SkillList';
import { cn } from '~/utils';

interface SkillsSidePanelProps {
  className?: string;
}

/**
 * Claude.ai–style skills sidebar panel.
 * Header rangée 1 : titre "Skills" + icône recherche.
 * Header rangée 2 : 2 boutons distincts "Créer un skill" (primaire) +
 *                   "Importer un skill" (outline), pattern aligné sur
 *                   AgentPanel (commit 179e586a0 — Épuration builder).
 * Body : section "Mes Skills" collapsible avec la liste.
 */
export default function SkillsSidePanel({ className }: SkillsSidePanelProps) {
  const localize = useLocalize();
  const { skillId: activeSkillId } = useParams();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 250);

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.CREATE,
  });

  const listQuery = useListSkillsQuery({ search: debouncedSearch || undefined, limit: 50 });
  const skills = useMemo(() => listQuery.data?.skills ?? [], [listQuery.data]);

  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchTerm('');
  };

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col overflow-hidden border-r border-border-light',
        className,
      )}
    >
      {/* Header rangée 1 — titre + bouton recherche (ou input plein largeur) */}
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
              onClick={handleCloseSearch}
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
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              aria-label={localize('com_ui_search')}
            >
              <Search className="size-4" />
            </button>
          </>
        )}
      </div>

      {/* Header rangée 2 — 2 boutons d'action (visible si permission CREATE) */}
      {hasCreateAccess && !searchOpen && (
        <div className="flex w-full gap-2 px-4 pb-2">
          <Button
            type="button"
            variant="submit"
            className="w-full justify-center"
            onClick={() => setCreateOpen(true)}
            aria-label={localize('com_ui_create_skill')}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            {localize('com_ui_create_skill')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center"
            onClick={() => setImportOpen(true)}
            aria-label={localize('com_ui_skill_upload')}
          >
            <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
            {localize('com_ui_skill_upload')}
          </Button>
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

      <CreateSkillDialog isOpen={createOpen} setIsOpen={setCreateOpen} />
      <UploadSkillDialog isOpen={importOpen} setIsOpen={setImportOpen} />
    </div>
  );
}
