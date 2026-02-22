import { useMemo, useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { matchSorter } from 'match-sorter';
import { SystemRoles, PermissionTypes, Permissions } from 'librechat-data-provider';
import {
  Button,
  Switch,
  Spinner,
  FilterInput,
  TooltipAnchor,
  OGDialogTrigger,
  useToastContext,
} from '@librechat/client';
import type { TUserMemory } from 'librechat-data-provider';
import {
  useUpdateMemoryPreferencesMutation,
  useMemoriesQuery,
  useGetUserQuery,
} from '~/data-provider';
import { useLocalize, useAuthContext, useHasAccess } from '~/hooks';
import MemoryCreateDialog from './MemoryCreateDialog';
import MemoryUsageBadge from './MemoryUsageBadge';
import MemoryScopeTabs from './MemoryScopeTabs';
import AdminSettings from './AdminSettings';
import MemoryList from './MemoryList';

const pageSize = 10;

function LegacyMemoryList() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { data: userData } = useGetUserQuery();
  const { data: memData, isLoading } = useMemoriesQuery();
  const { showToast } = useToastContext();
  const [pageIndex, setPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [referenceSavedMemories, setReferenceSavedMemories] = useState(true);

  const updateMemoryPreferencesMutation = useUpdateMemoryPreferencesMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_preferences_updated'), status: 'success' });
    },
    onError: () => {
      showToast({ message: localize('com_ui_error_updating_preferences'), status: 'error' });
      setReferenceSavedMemories((prev) => !prev);
    },
  });

  useEffect(() => {
    if (userData?.personalization?.memories !== undefined) {
      setReferenceSavedMemories(userData.personalization.memories);
    }
  }, [userData?.personalization?.memories]);

  const handleMemoryToggle = (checked: boolean) => {
    setReferenceSavedMemories(checked);
    updateMemoryPreferencesMutation.mutate({ memories: checked });
  };

  const hasUpdateAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.UPDATE,
  });

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.CREATE,
  });

  const hasOptOutAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.OPT_OUT,
  });

  const memories: TUserMemory[] = useMemo(() => memData?.memories ?? [], [memData]);

  const filteredMemories = useMemo(() => {
    return matchSorter(memories, searchQuery, { keys: ['key', 'value'] });
  }, [memories, searchQuery]);

  const currentRows = useMemo(() => {
    return filteredMemories.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [filteredMemories, pageIndex]);

  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <Spinner />
      </div>
    );
  }

  const totalPages = Math.ceil(filteredMemories.length / pageSize);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FilterInput
          inputId="memory-search"
          label={localize('com_ui_memories_filter')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          containerClassName="flex-1"
        />
        {hasCreateAccess && (
          <MemoryCreateDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <OGDialogTrigger asChild>
              <TooltipAnchor
                description={localize('com_ui_create_memory')}
                side="bottom"
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 bg-transparent"
                    aria-label={localize('com_ui_create_memory')}
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </Button>
                }
              />
            </OGDialogTrigger>
          </MemoryCreateDialog>
        )}
      </div>

      {(memData?.tokenLimit != null || hasOptOutAccess) && (
        <div className="flex items-center justify-between">
          {memData?.tokenLimit != null && (
            <MemoryUsageBadge
              percentage={memData.usagePercentage ?? 0}
              tokenLimit={memData.tokenLimit}
              totalTokens={memData.totalTokens}
            />
          )}
          {hasOptOutAccess && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-text-secondary">{localize('com_ui_use_memory')}</span>
              <Switch
                checked={referenceSavedMemories}
                onCheckedChange={handleMemoryToggle}
                aria-label={localize('com_ui_use_memory')}
                disabled={updateMemoryPreferencesMutation.isLoading}
              />
            </div>
          )}
        </div>
      )}

      <MemoryList
        memories={currentRows}
        hasUpdateAccess={hasUpdateAccess}
        isFiltered={searchQuery.length > 0}
      />

      {(user?.role === SystemRoles.ADMIN || filteredMemories.length > pageSize) && (
        <div className="flex items-center justify-between gap-2">
          {user?.role === SystemRoles.ADMIN ? <AdminSettings /> : <div />}
          {filteredMemories.length > pageSize && (
            <div className="flex items-center gap-2" role="navigation" aria-label="Pagination">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPageIndex((prev) => Math.max(prev - 1, 0))}
                disabled={pageIndex === 0}
                aria-label={localize('com_ui_prev')}
              >
                {localize('com_ui_prev')}
              </Button>
              <div className="whitespace-nowrap text-sm" aria-live="polite">
                {pageIndex + 1} / {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPageIndex((prev) => (prev + 1 < totalPages ? prev + 1 : prev))}
                disabled={pageIndex + 1 >= totalPages}
                aria-label={localize('com_ui_next')}
              >
                {localize('com_ui_next')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MemoryPanel() {
  const localize = useLocalize();

  const hasReadAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.READ,
  });

  if (!hasReadAccess) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <div className="text-center">
          <p className="text-sm text-text-secondary">{localize('com_ui_no_read_access')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col p-1">
      <MemoryScopeTabs legacyPanel={<LegacyMemoryList />} />
    </div>
  );
}
