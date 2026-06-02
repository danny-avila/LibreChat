import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import { ArrowUpDown, Check, Folder, Plus, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Input,
  Button,
  Spinner,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  useToastContext,
} from '@librechat/client';
import type { TChatProject } from 'librechat-data-provider';
import { useCreateProjectMutation, useProjectsInfiniteQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { cn } from '~/utils';

type ProjectSort = 'name' | 'createdAt' | 'lastConversationAt';

function formatActivity(project: TChatProject, fallback: string) {
  const value = project.lastConversationAt ?? project.updatedAt ?? project.createdAt;
  return value ? new Date(value).toLocaleString() : fallback;
}

export default function ProjectsView() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<ProjectSort>('lastConversationAt');
  const [isCreating, setIsCreating] = useState(searchParams.get('new') === '1');
  const [name, setName] = useState('');
  const deferredSearch = useDeferredValue(search);
  const createProject = useCreateProjectMutation();
  const { showToast } = useToastContext();

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

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }
    try {
      const project = await createProject.mutateAsync({ name: trimmedName });
      setName('');
      setIsCreating(false);
      navigate(`/projects/${project._id}`);
    } catch {
      showToast({
        message: localize('com_ui_project_create_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    }
  };

  return (
    <main className="flex h-full min-h-0 flex-col overflow-auto bg-presentation text-text-primary">
      <div className="container mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary md:text-3xl">
            {localize('com_ui_projects')}
          </h1>
          <Button type="button" variant="submit" size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {localize('com_ui_new_project')}
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
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
              className="border-border-medium bg-transparent pl-9 text-text-primary placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-ring-primary"
            />
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-10 justify-between border-border-medium bg-transparent px-3 sm:w-56"
                aria-label={localize('com_ui_sort_projects_by')}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ArrowUpDown
                    className="h-4 w-4 shrink-0 text-text-secondary"
                    aria-hidden="true"
                  />
                  <span className="truncate">{selectedSortLabel}</span>
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {sortOptions.map((option) => (
                <DropdownMenuItem key={option.value} onSelect={() => setSortBy(option.value)}>
                  <span>{option.label}</span>
                  {sortBy === option.value && (
                    <Check className="ml-auto h-4 w-4 text-text-primary" aria-hidden="true" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isCreating && (
          <form
            onSubmit={handleCreate}
            className="flex flex-col gap-3 rounded-lg border border-border-light bg-transparent p-3 sm:flex-row"
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={localize('com_ui_project_name')}
              className="min-w-0 flex-1 bg-transparent focus-visible:ring-2 focus-visible:ring-ring-primary"
            />
            <div className="flex gap-2">
              <Button type="submit" variant="submit" disabled={createProject.isLoading}>
                {createProject.isLoading ? localize('com_ui_loading') : localize('com_ui_create')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsCreating(false)}>
                {localize('com_ui_cancel')}
              </Button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="text-text-primary" />
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {projects.map((project) => (
              <button
                key={project._id}
                type="button"
                className={cn(
                  'group/project min-h-32 rounded-xl border border-border-light bg-transparent p-4 text-left transition-colors',
                  'hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                )}
                onClick={() => navigate(`/projects/${project._id}`)}
              >
                <span className="mb-3 flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary transition-colors group-hover/project:bg-surface-hover">
                    <Folder className="h-5 w-5 text-text-secondary" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold">{project.name}</span>
                    <span className="block text-xs text-text-secondary">
                      {localize('com_ui_project_chat_count', {
                        count: project.conversationCount,
                      })}
                    </span>
                  </span>
                </span>
                {project.description && (
                  <span className="mb-3 line-clamp-2 block text-sm leading-relaxed text-text-secondary">
                    {project.description}
                  </span>
                )}
                <span className="block truncate text-xs text-text-secondary">
                  {localize('com_ui_latest_activity')}:{' '}
                  {formatActivity(project, localize('com_ui_no_activity'))}
                </span>
              </button>
            ))}
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
