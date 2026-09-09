import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Ellipsis, Folder, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { Button, DropdownPopup, Skeleton, Spinner } from '@librechat/client';
import type { TChatProject } from 'librechat-data-provider';
import type { LocalizeFunction, MenuItemProps } from '~/common';
import type { ProjectSort } from './ProjectsNavBar';
import { useProjectsInfiniteQuery } from '~/data-provider';
import ProjectCreateDialog from './ProjectCreateDialog';
import ProjectDeleteDialog from './ProjectDeleteDialog';
import ProjectsNavBar from './ProjectsNavBar';
import ProjectEditor from './ProjectEditor';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

function getProjectCountLabel(count: number, hasMore: boolean, localize: LocalizeFunction) {
  if (hasMore) {
    return localize('com_ui_project_count_partial', { count });
  }
  if (count === 1) {
    return localize('com_ui_project_count_single');
  }
  return localize('com_ui_project_count', { count });
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
  onOpen,
}: {
  project: TChatProject;
  onOpen: (projectId: string) => void;
}) {
  const localize = useLocalize();
  const menuId = useId();
  const navigationButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const activity = formatActivity(project);
  const menuItems = useMemo<MenuItemProps[]>(
    () => [
      {
        id: `${menuId}-edit`,
        label: localize('com_ui_edit_project'),
        icon: <Pencil className="size-4 text-text-secondary" aria-hidden="true" />,
        onClick: () => setIsEditOpen(true),
      },
      {
        id: `${menuId}-delete`,
        label: localize('com_ui_delete'),
        icon: <Trash2 className="size-4 text-text-secondary" aria-hidden="true" />,
        onClick: () => setIsDeleteOpen(true),
      },
    ],
    [localize, menuId],
  );

  return (
    <article
      className={cn(
        'group/project relative flex min-h-[9.5rem] min-w-0 max-w-full flex-col rounded-2xl border border-border-light bg-surface-secondary',
        'transition-colors duration-150 ease-out hover:bg-surface-hover',
      )}
    >
      {isEditOpen ? (
        <div className="min-w-0 p-4 pr-12">
          <ProjectEditor
            project={project}
            layout="card"
            inputRef={inputRef}
            onDone={() => {
              setIsEditOpen(false);
              requestAnimationFrame(() => navigationButtonRef.current?.focus());
            }}
          />
        </div>
      ) : (
        <button
          ref={navigationButtonRef}
          type="button"
          className="flex min-h-[9.5rem] w-full min-w-0 max-w-full flex-1 flex-col rounded-2xl p-4 pr-12 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary"
          onClick={() => onOpen(project._id)}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-tertiary text-text-secondary transition-colors group-hover/project:text-text-primary">
            <Folder className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="mt-3 line-clamp-2 min-w-0 max-w-full text-base font-semibold tracking-tight text-text-primary [overflow-wrap:anywhere] md:line-clamp-1">
            {project.name}
          </span>
          {project.description ? (
            <span className="mt-1 line-clamp-2 min-w-0 max-w-full text-pretty text-sm leading-relaxed text-text-secondary [overflow-wrap:anywhere]">
              {project.description}
            </span>
          ) : null}
          <span className="mt-auto flex min-w-0 max-w-full items-center gap-2 pt-4 text-xs tabular-nums text-text-secondary">
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
                <time
                  dateTime={project.lastConversationAt ?? project.updatedAt ?? project.createdAt}
                >
                  {activity}
                </time>
              </>
            ) : null}
          </span>
        </button>
      )}
      <div className="absolute right-2 top-2">
        <DropdownPopup
          portal={true}
          focusLoop={true}
          unmountOnHide={true}
          finalFocus={isEditOpen ? inputRef : undefined}
          menuId={menuId}
          isOpen={isMenuOpen}
          setIsOpen={setIsMenuOpen}
          className="z-[125] min-w-44"
          iconClassName="mr-2 text-text-secondary"
          trigger={
            <Ariakit.MenuButton
              aria-label={localize('com_ui_more_options')}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary outline-none transition-colors',
                'hover:bg-surface-tertiary hover:text-text-primary',
                'focus-visible:ring-2 focus-visible:ring-text-primary',
                isMenuOpen && 'bg-surface-tertiary text-text-primary',
              )}
            >
              <Ellipsis className="h-4 w-4" aria-hidden="true" />
            </Ariakit.MenuButton>
          }
          items={menuItems}
        />
      </div>
      <ProjectDeleteDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} project={project} />
    </article>
  );
}

function ProjectGridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3" aria-hidden="true">
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
  const deferredSearch = useDeferredValue(search);
  const scrollRef = useRef<HTMLElement | null>(null);
  const [pageSentinel, setPageSentinel] = useState<HTMLDivElement | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, isLoading } =
    useProjectsInfiniteQuery({
      search: deferredSearch || undefined,
      sortBy,
      sortDirection: sortBy === 'name' ? 'asc' : 'desc',
    });

  const projects = useMemo(() => data?.pages.flatMap((page) => page.projects) ?? [], [data?.pages]);

  /** `projects` only holds the pages fetched so far, so while another page
   *  exists this is a lower bound rather than the total. */
  const projectCountLabel = getProjectCountLabel(projects.length, hasNextPage === true, localize);

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

  const loadMore = useCallback(() => {
    if (hasNextPage === true && !isFetching) {
      /** `cancelRefetch: false` so a scroll burst coalesces into one request
       *  instead of each intersection restarting the page in flight. */
      void fetchNextPage({ cancelRefetch: false });
    }
  }, [fetchNextPage, hasNextPage, isFetching]);

  /** The list scrolls inside `<main>`, so the viewport root would clip the
   *  sentinel and only report it once it is already on screen; observing the
   *  scroll container lets `rootMargin` prefetch a page ahead of the edge. */
  useEffect(() => {
    const root = scrollRef.current;
    if (pageSentinel == null || root == null) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadMore();
        }
      },
      { root, rootMargin: '600px 0px' },
    );
    observer.observe(pageSentinel);
    return () => observer.disconnect();
  }, [loadMore, pageSentinel]);

  return (
    <main
      ref={scrollRef}
      className="flex h-full min-h-0 flex-col overflow-auto bg-presentation text-text-primary"
    >
      <ProjectsNavBar
        onCreate={() => setIsCreating(true)}
        search={search}
        onSearchChange={setSearch}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      <div className="flex w-full flex-1 flex-col px-4 pb-10 pt-6 md:px-6 md:pt-8">
        <div className="flex items-baseline justify-between gap-3">
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project._id}
                  project={project}
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
                    className="mt-5"
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
          <div
            ref={setPageSentinel}
            className="flex h-16 shrink-0 items-center justify-center"
            role="status"
            aria-live="polite"
            aria-label={localize('com_ui_loading')}
          >
            {isFetchingNextPage ? <Spinner className="size-5 text-text-primary" /> : null}
          </div>
        )}
      </div>
    </main>
  );
}
