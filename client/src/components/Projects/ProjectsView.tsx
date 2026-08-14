import { useDeferredValue, useEffect, useId, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpDown, Check, Folder, FolderPlus, Search } from 'lucide-react';
import { Input, Button, Skeleton, DropdownPopup } from '@librechat/client';
import type { TChatProject } from 'librechat-data-provider';
import type { MenuItemProps, RenderProp } from '~/common';
import { useProjectsInfiniteQuery } from '~/data-provider';
import ProjectCreateDialog from './ProjectCreateDialog';
import ProjectsNavBar from './ProjectsNavBar';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

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

function ProjectCard({
  project,
  index,
  onOpen,
}: {
  project: TChatProject;
  index: number;
  onOpen: (projectId: string) => void;
}) {
  const localize = useLocalize();
  const activity = formatActivity(project);

  return (
    <button
      type="button"
      className={cn(
        'group/project flex min-h-[9.5rem] flex-col rounded-2xl bg-surface-secondary p-4 text-left',
        'transition-[background-color,transform] duration-150 ease-out',
        'hover:bg-surface-hover active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary',
        'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both',
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      onClick={() => onOpen(project._id)}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-tertiary text-text-secondary transition-colors group-hover/project:text-text-primary">
          <Folder className="h-5 w-5" aria-hidden="true" />
        </span>
        <ArrowRight
          className="mt-1 h-4 w-4 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover/project:opacity-100 group-focus-visible/project:opacity-100"
          aria-hidden="true"
        />
      </span>
      <span className="mt-3 truncate text-base font-semibold tracking-tight text-text-primary">
        {project.name}
      </span>
      {project.description ? (
        <span className="mt-1 line-clamp-2 text-pretty text-sm leading-relaxed text-text-secondary">
          {project.description}
        </span>
      ) : null}
      <span className="mt-auto flex items-center gap-2 pt-4 text-xs tabular-nums text-text-secondary">
        <span>
          {project.conversationCount === 1
            ? localize('com_ui_project_chat_count_single')
            : localize('com_ui_project_chat_count', {
                count: project.conversationCount,
              })}
        </span>
        {activity ? (
          <>
            <span aria-hidden="true">·</span>
            <time dateTime={project.lastConversationAt ?? project.updatedAt ?? project.createdAt}>
              {activity}
            </time>
          </>
        ) : null}
      </span>
    </button>
  );
}

function ProjectGridSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="flex min-h-[9.5rem] flex-col rounded-2xl bg-surface-secondary p-4"
        >
          <Skeleton className="h-11 w-11 rounded-xl" />
          <Skeleton className="mt-3 h-5 w-2/3" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-auto h-3 w-24" />
        </div>
      ))}
    </div>
  );
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

  const projectCountLabel =
    projects.length === 1
      ? localize('com_ui_project_count_single')
      : localize('com_ui_project_count', { count: projects.length });

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
      <ProjectsNavBar onCreate={() => setIsCreating(true)} />

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-10 pt-6 md:px-6 md:pt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{localize('com_ui_search_projects')}</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={localize('com_ui_search_projects')}
              className="h-11 rounded-xl bg-surface-secondary pl-10"
            />
          </label>
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
                  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-text-secondary transition-colors',
                  'hover:bg-surface-hover hover:text-text-primary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary',
                  isSortMenuOpen && 'bg-surface-hover text-text-primary',
                )}
              >
                <ArrowUpDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{selectedSortLabel}</span>
              </Ariakit.MenuButton>
            }
            items={sortMenuItems}
          />
        </div>

        <div className="mt-8 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-text-primary">
            {localize('com_ui_your_projects')}
          </h2>
          {!isLoading && projects.length > 0 ? (
            <p className="text-sm tabular-nums text-text-secondary">{projectCountLabel}</p>
          ) : null}
        </div>

        <ProjectCreateDialog
          open={isCreating}
          onOpenChange={handleCreateDialogChange}
          onCreated={(project) => navigate(`/projects/${project._id}`)}
        />

        <div className="mt-4 flex flex-1 flex-col">
          {isLoading && <ProjectGridSkeleton />}
          {!isLoading && projects.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((project, index) => (
                <ProjectCard
                  key={project._id}
                  project={project}
                  index={index}
                  onOpen={(projectId) => navigate(`/projects/${projectId}`)}
                />
              ))}
            </div>
          )}
          {!isLoading && projects.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-surface-secondary px-6 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-tertiary text-text-secondary">
                <FolderPlus className="h-7 w-7" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-balance text-base font-semibold text-text-primary">
                {search ? localize('com_ui_no_matching_projects') : localize('com_ui_no_projects')}
              </h3>
              {!search ? (
                <>
                  <p className="mt-1 max-w-sm text-pretty text-sm text-text-secondary">
                    {localize('com_ui_add_first_project')}
                  </p>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="mt-5 active:scale-[0.96]"
                    onClick={() => setIsCreating(true)}
                  >
                    <FolderPlus className="h-4 w-4" aria-hidden="true" />
                    {localize('com_ui_new_project')}
                  </Button>
                </>
              ) : null}
            </div>
          )}
        </div>

        {hasNextPage && (
          <Button
            type="button"
            variant="outline"
            className="mx-auto mt-8"
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
