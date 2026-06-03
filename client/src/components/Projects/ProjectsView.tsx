import { useDeferredValue, useEffect, useId, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { ArrowUpDown, Check, Folder, Plus, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { TChatProject } from 'librechat-data-provider';
import { Input, Button, Spinner, DropdownPopup } from '@librechat/client';
import type { MenuItemProps, RenderProp } from '~/common';
import { useProjectsInfiniteQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import ProjectCreateDialog from './ProjectCreateDialog';

type ProjectSort = 'name' | 'createdAt' | 'lastConversationAt';

function renderSortMenuItem(label: string, isSelected: boolean): RenderProp {
  return function SortMenuItem({ className, ...props }) {
    return (
      <div {...props} className={cn(className, 'justify-between gap-5')}>
        <span className="truncate">{label}</span>
        {isSelected ? (
          <Check className="h-4 w-4 shrink-0 text-text-primary" aria-hidden="true" />
        ) : (
          <span className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
      </div>
    );
  };
}

function formatActivity(project: TChatProject) {
  const value = project.lastConversationAt ?? project.updatedAt ?? project.createdAt;
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProjectsView() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<ProjectSort>('lastConversationAt');
  const [isCreating, setIsCreating] = useState(searchParams.get('new') === '1');
  const sortMenuId = useId();
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const { data, fetchNextPage, isFetchingNextPage, isLoading } = useProjectsInfiniteQuery({
    search: deferredSearch || undefined,
    sortBy,
    sortDirection: sortBy === 'name' ? 'asc' : 'desc',
  });

  const projects = useMemo(() => data?.pages.flatMap((page) => page.projects) ?? [], [data?.pages]);
  const hasNextPage = data?.pages[data.pages.length - 1]?.nextCursor != null;
  const sortOptions = useMemo(
    () => [
      { value: 'lastConversationAt' as const, label: localize('com_ui_latest_activity') },
      { value: 'createdAt' as const, label: localize('com_ui_sort_created') },
      { value: 'name' as const, label: localize('com_ui_name') },
    ],
    [localize],
  );
  const selectedSortLabel =
    sortOptions.find((option) => option.value === sortBy)?.label ??
    localize('com_ui_latest_activity');
  const sortMenuItems = useMemo<MenuItemProps[]>(
    () =>
      sortOptions.map((option) => {
        const isSelected = sortBy === option.value;
        return {
          id: `project-sort-${option.value}`,
          ariaLabel: option.label,
          ariaChecked: isSelected,
          onClick: () => setSortBy(option.value),
          render: renderSortMenuItem(option.label, isSelected),
        };
      }),
    [sortBy, sortOptions],
  );

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setIsCreating(true);
    }
  }, [searchParams]);

  const handleCreateDialogChange = (open: boolean) => {
    setIsCreating(open);
    if (!open && searchParams.get('new') === '1') {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('new');
      setSearchParams(nextParams, { replace: true });
    }
  };

  return (
    <main className="flex h-full min-h-0 flex-col overflow-auto bg-surface-primary text-text-primary">
      <div className="container mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 md:px-6 lg:pt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary md:text-3xl">
            {localize('com_ui_projects')}
          </h1>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-text-secondary sm:inline">
              {localize('com_ui_sort_by')}
            </span>
            <DropdownPopup
              portal={true}
              focusLoop={true}
              unmountOnHide={true}
              menuId={sortMenuId}
              isOpen={isSortMenuOpen}
              setIsOpen={setIsSortMenuOpen}
              className="z-[125] min-w-56"
              trigger={
                <Ariakit.MenuButton
                  aria-label={localize('com_ui_sort_projects_by')}
                  className={cn(
                    'inline-flex h-10 items-center justify-between gap-2 whitespace-nowrap rounded-lg border border-border-medium bg-surface-secondary px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary disabled:pointer-events-none disabled:opacity-50 sm:w-44',
                    isSortMenuOpen && 'bg-surface-hover text-text-primary',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ArrowUpDown
                      className="h-4 w-4 shrink-0 text-text-secondary"
                      aria-hidden="true"
                    />
                    <span className="truncate">{selectedSortLabel}</span>
                  </span>
                </Ariakit.MenuButton>
              }
              items={sortMenuItems}
            />
            <Button type="button" variant="submit" size="sm" onClick={() => setIsCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {localize('com_ui_new_project')}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{localize('com_ui_search_projects')}</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={localize('com_ui_search_projects')}
              className="border-border-medium bg-surface-secondary pl-9 text-text-primary placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-ring-primary"
            />
          </label>
          <div className="flex items-center">
            <span className="rounded-full bg-surface-active-alt px-4 py-2 text-sm font-medium text-text-primary">
              {localize('com_ui_your_projects')}
            </span>
          </div>
        </div>

        <ProjectCreateDialog
          open={isCreating}
          onOpenChange={handleCreateDialogChange}
          onCreated={(project) => navigate(`/projects/${project._id}`)}
        />

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="text-text-primary" />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 md:gap-4">
            {projects.map((project) => {
              const activity = formatActivity(project);
              return (
                <button
                  key={project._id}
                  type="button"
                  className={cn(
                    'group/project flex min-h-[8.5rem] flex-col rounded-xl border border-border-medium bg-surface-secondary p-4 text-left transition-colors',
                    'hover:border-border-heavy hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                  )}
                  onClick={() => navigate(`/projects/${project._id}`)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Folder className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                    <span className="truncate text-base font-semibold text-text-primary">
                      {project.name}
                    </span>
                  </span>
                  {project.description ? (
                    <span className="mt-2 line-clamp-2 text-sm leading-relaxed text-text-secondary">
                      {project.description}
                    </span>
                  ) : null}
                  <span className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-text-secondary">
                    <span>
                      {project.conversationCount === 1
                        ? localize('com_ui_project_chat_count_single')
                        : localize('com_ui_project_chat_count', {
                            count: project.conversationCount,
                          })}
                    </span>
                    {activity ? <span className="shrink-0 truncate">{activity}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!isLoading && projects.length === 0 && (
          <div className="rounded-lg border border-border-medium bg-transparent py-16 text-center text-sm text-text-secondary">
            {localize('com_ui_no_projects')}
          </div>
        )}

        {hasNextPage && (
          <Button
            type="button"
            variant="outline"
            className="mx-auto"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? localize('com_ui_loading') : localize('com_ui_load_more')}
          </Button>
        )}
      </div>
    </main>
  );
}
