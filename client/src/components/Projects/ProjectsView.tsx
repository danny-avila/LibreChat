import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import { ArrowUpDown, Folder, Plus, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner, useToastContext } from '@librechat/client';
import type { TChatProject } from 'librechat-data-provider';
import { useCreateProjectMutation, useProjectsInfiniteQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { NotificationSeverity } from '~/common';

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
    <main className="flex h-full min-h-0 flex-col overflow-auto bg-surface-primary text-text-primary">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-normal">{localize('com_ui_projects')}</h1>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-4 text-sm font-medium text-white transition-colors hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {localize('com_ui_new_project')}
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{localize('com_ui_search_projects')}</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={localize('com_ui_search_projects')}
              className="h-10 w-full rounded-lg border border-border-light bg-surface-primary pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring-primary"
            />
          </label>
          <label className="relative sm:w-56">
            <span className="sr-only">{localize('com_ui_sort_projects_by')}</span>
            <ArrowUpDown
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as ProjectSort)}
              className="h-10 w-full rounded-lg border border-border-light bg-surface-primary pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring-primary"
            >
              <option value="lastConversationAt">{localize('com_ui_latest_activity')}</option>
              <option value="createdAt">{localize('com_ui_sort_created')}</option>
              <option value="name">{localize('com_ui_name')}</option>
            </select>
          </label>
        </div>

        {isCreating && (
          <form
            onSubmit={handleCreate}
            className="flex flex-col gap-3 rounded-lg border border-border-light p-4 sm:flex-row"
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={localize('com_ui_project_name')}
              className="h-10 min-w-0 flex-1 rounded-lg border border-border-light bg-surface-primary px-3 text-sm outline-none focus:ring-2 focus:ring-ring-primary"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="h-10 rounded-lg bg-black px-4 text-sm font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
                disabled={createProject.isLoading}
              >
                {createProject.isLoading ? localize('com_ui_loading') : localize('com_ui_create')}
              </button>
              <button
                type="button"
                className="h-10 rounded-lg border border-border-light px-4 text-sm text-text-primary hover:bg-surface-hover"
                onClick={() => setIsCreating(false)}
              >
                {localize('com_ui_cancel')}
              </button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="text-text-primary" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <button
                key={project._id}
                type="button"
                className="min-h-36 rounded-lg border border-border-light p-5 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
                onClick={() => navigate(`/projects/${project._id}`)}
              >
                <span className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
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
                  <span className="mb-4 line-clamp-2 block text-sm text-text-secondary">
                    {project.description}
                  </span>
                )}
                <span className="text-xs text-text-secondary">
                  {localize('com_ui_latest_activity')}:{' '}
                  {formatActivity(project, localize('com_ui_no_activity'))}
                </span>
              </button>
            ))}
          </div>
        )}

        {!isLoading && projects.length === 0 && (
          <div className="rounded-lg border border-border-light py-16 text-center text-sm text-text-secondary">
            {localize('com_ui_no_projects')}
          </div>
        )}

        {hasNextPage && (
          <button
            type="button"
            className="mx-auto h-10 rounded-lg border border-border-light px-4 text-sm hover:bg-surface-hover"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? localize('com_ui_loading') : localize('com_ui_load_more')}
          </button>
        )}
      </div>
    </main>
  );
}
