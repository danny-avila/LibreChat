import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, FilterInput } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useDebounce, useHasAccess, useLocalize } from '~/hooks';
import { useListSkillsQuery } from '~/data-provider';
import SkillList from '../lists/SkillList';
import { cn } from '~/utils';

interface SkillsSidePanelProps {
  className?: string;
}

/** Debounce keystrokes to avoid firing one network request per character. */
const SEARCH_DEBOUNCE_MS = 250;

export default function SkillsSidePanel({ className }: SkillsSidePanelProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, SEARCH_DEBOUNCE_MS);

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.CREATE,
  });

  const listQuery = useListSkillsQuery({
    search: debouncedSearchTerm || undefined,
    limit: 50,
  });

  const skills = useMemo(() => listQuery.data?.skills ?? [], [listQuery.data]);

  return (
    <div className={cn('flex h-full w-full flex-col', className)}>
      <div className="flex flex-col gap-2 border-b border-border-light px-3 py-3">
        <h2 className="text-base font-semibold text-text-primary">{localize('com_ui_skills')}</h2>
        <div className="flex items-center gap-2">
          <FilterInput
            inputId="skills-filter"
            label={localize('com_ui_skills_filter_placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            containerClassName="flex-1"
          />
          {hasCreateAccess && (
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={localize('com_ui_skills_new')}
              onClick={() => navigate('/skills/new')}
              className="shrink-0"
            >
              <Plus className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <SkillList skills={skills} isLoading={listQuery.isLoading} />
      </div>
    </div>
  );
}
