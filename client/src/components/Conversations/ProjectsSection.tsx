import { memo, useCallback, useId, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilCallback, useRecoilValue } from 'recoil';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Folder,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Spinner,
  TooltipAnchor,
  DropdownPopup,
  NewChatIcon,
  buttonVariants,
} from '@librechat/client';
import type { TChatProject, TConversation } from 'librechat-data-provider';
import type { MenuItemProps } from '~/common';
import {
  useProjectsInfiniteQuery,
  useActiveJobs,
  useConversationsInfiniteQuery,
} from '~/data-provider';
import ProjectCreateDialog from '~/components/Projects/ProjectCreateDialog';
import ProjectDeleteDialog from '~/components/Projects/ProjectDeleteDialog';
import ProjectEditDialog from '~/components/Projects/ProjectEditDialog';
import { useLocalize, useLocalStorage, useNewConvo } from '~/hooks';
import { Collapse } from '~/components/ui';
import { clearMessagesCache, cn } from '~/utils';
import Convo from './Convo';
import store from '~/store';

const INLINE_CHAT_LIMIT = 8;

/** `cn` is what resolves the base utilities this variant overrides. */
const iconButtonClassName = cn(
  buttonVariants({ variant: 'section-action', size: 'icon-xs' }),
  'shrink-0',
);

const noop = () => {};

type ProjectChatsInlineProps = {
  projectId: string;
  toggleNav: () => void;
  onShowAll: () => void;
};

const ProjectChatsInline = memo(function ProjectChatsInline({
  projectId,
  toggleNav,
  onShowAll,
}: ProjectChatsInlineProps) {
  const localize = useLocalize();
  const { data: activeJobsData } = useActiveJobs();
  const activeJobIds = useMemo(
    () => new Set(activeJobsData?.activeJobIds ?? []),
    [activeJobsData?.activeJobIds],
  );
  const { data, isLoading } = useConversationsInfiniteQuery(
    { projectId, sortBy: 'updatedAt', sortDirection: 'desc' },
    { staleTime: 30000, cacheTime: 300000 },
  );

  const conversations = useMemo<TConversation[]>(
    () =>
      (data?.pages.flatMap((page) => page.conversations) ?? []).filter(Boolean) as TConversation[],
    [data?.pages],
  );
  const hasMore =
    conversations.length > INLINE_CHAT_LIMIT ||
    (data?.pages[data.pages.length - 1]?.nextCursor ?? null) != null;
  const visible = conversations.slice(0, INLINE_CHAT_LIMIT);

  if (isLoading && conversations.length === 0) {
    return (
      <div className="flex justify-start py-1.5 pl-2">
        <Spinner className="h-4 w-4 text-text-secondary" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="py-1.5 pl-2 text-xs text-text-secondary">
        {localize('com_ui_no_project_chats')}
      </div>
    );
  }

  return (
    <div data-testid={`project-chats-${projectId}`}>
      {visible.map((convo) => (
        <Convo
          key={convo.conversationId}
          conversation={convo}
          retainView={noop}
          toggleNav={toggleNav}
          isGenerating={activeJobIds.has(convo.conversationId ?? '')}
        />
      ))}
      {hasMore && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onShowAll}
          className="ml-1 mt-0.5 h-auto rounded-md px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-transparent hover:text-text-primary"
        >
          {localize('com_ui_show_all')}
        </Button>
      )}
    </div>
  );
});

ProjectChatsInline.displayName = 'ProjectChatsInline';

type ProjectItemProps = {
  project: TChatProject;
  toggleNav: () => void;
  defaultExpanded: boolean;
  isActive: boolean;
};

const ProjectItem = memo(
  function ProjectItem({ project, toggleNav, defaultExpanded, isActive }: ProjectItemProps) {
    const localize = useLocalize();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { newConversation } = useNewConvo();
    const getCurrentConversationId = useRecoilCallback(
      ({ snapshot }) =>
        async () => {
          const conversation = await snapshot.getPromise(store.conversationByIndex(0));
          return conversation?.conversationId;
        },
      [],
    );
    const menuId = useId();
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);

    const openProject = useCallback(() => {
      navigate(`/projects/${project._id}`);
      toggleNav();
    }, [navigate, project._id, toggleNav]);

    const startChat = useCallback(async () => {
      const conversationId = await getCurrentConversationId();
      clearMessagesCache(queryClient, conversationId);
      queryClient.invalidateQueries([QueryKeys.messages]);
      newConversation({ template: { chatProjectId: project._id } });
      toggleNav();
    }, [getCurrentConversationId, newConversation, project._id, queryClient, toggleNav]);

    const menuItems = useMemo<MenuItemProps[]>(
      () => [
        {
          id: `${menuId}-open`,
          label: localize('com_ui_open_project'),
          icon: <Folder className="size-4 text-text-secondary" aria-hidden="true" />,
          onClick: openProject,
        },
        {
          id: `${menuId}-rename`,
          label: localize('com_ui_edit_project'),
          icon: <Pencil className="size-4 text-text-secondary" aria-hidden="true" />,
          onClick: () => setIsRenameOpen(true),
        },
        {
          id: `${menuId}-delete`,
          label: localize('com_ui_delete'),
          icon: <Trash2 className="size-4 text-text-secondary" aria-hidden="true" />,
          onClick: () => setIsDeleteOpen(true),
        },
      ],
      [localize, menuId, openProject],
    );

    return (
      <li className="list-none">
        <div
          className={cn(
            'group/project-row relative flex h-9 items-center rounded-lg text-sm text-text-primary transition-colors hover:bg-surface-hover',
            isActive && 'bg-surface-active-alt',
          )}
        >
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-label={project.name}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-16 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary"
          >
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform duration-200',
                expanded && 'rotate-90',
              )}
              aria-hidden="true"
            />
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-tertiary text-text-secondary">
              <Folder className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 truncate">{project.name}</span>
            {project.conversationCount > 0 ? (
              <span className="ml-auto text-xs tabular-nums text-text-tertiary group-focus-within/project-row:opacity-0 group-hover/project-row:opacity-0">
                {project.conversationCount}
              </span>
            ) : null}
          </button>
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-lg bg-surface-hover opacity-0 transition-opacity group-focus-within/project-row:opacity-100 group-hover/project-row:opacity-100 has-[[data-state=open]]:opacity-100">
            <TooltipAnchor
              description={localize('com_ui_new_chat_in_project', { name: project.name })}
              render={
                <button
                  type="button"
                  aria-label={localize('com_ui_new_chat_in_project', { name: project.name })}
                  className={iconButtonClassName}
                  onClick={startChat}
                >
                  <NewChatIcon className="h-4 w-4" />
                </button>
              }
            />
            <DropdownPopup
              portal={true}
              focusLoop={true}
              unmountOnHide={true}
              menuId={menuId}
              isOpen={isMenuOpen}
              setIsOpen={setIsMenuOpen}
              className="z-[125] min-w-44"
              iconClassName="mr-2 text-text-secondary"
              trigger={
                <Ariakit.MenuButton
                  aria-label={localize('com_ui_more_options')}
                  className={cn(
                    iconButtonClassName,
                    isMenuOpen && 'bg-surface-active-alt text-text-primary',
                  )}
                >
                  <Ellipsis className="h-4 w-4" aria-hidden="true" />
                </Ariakit.MenuButton>
              }
              items={menuItems}
            />
          </div>
        </div>
        <Collapse open={expanded} className="pl-2">
          <ProjectChatsInline
            projectId={project._id}
            toggleNav={toggleNav}
            onShowAll={openProject}
          />
        </Collapse>
        <ProjectEditDialog open={isRenameOpen} onOpenChange={setIsRenameOpen} project={project} />
        <ProjectDeleteDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} project={project} />
      </li>
    );
  },
  (prevProps, nextProps) =>
    prevProps.project._id === nextProps.project._id &&
    prevProps.project.name === nextProps.project.name &&
    prevProps.project.description === nextProps.project.description &&
    prevProps.project.conversationCount === nextProps.project.conversationCount &&
    prevProps.project.updatedAt === nextProps.project.updatedAt &&
    prevProps.defaultExpanded === nextProps.defaultExpanded &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.toggleNav === nextProps.toggleNav,
);

ProjectItem.displayName = 'ProjectItem';

interface ProjectsSectionProps {
  toggleNav: () => void;
  isAuthenticated: boolean;
}

const ProjectsSection = ({ toggleNav, isAuthenticated }: ProjectsSectionProps) => {
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();
  const [storedExpanded, setStoredExpanded] = useLocalStorage('projectsSectionExpanded', true);
  const [hasToggledSection, setHasToggledSection] = useLocalStorage(
    'projectsSectionToggled',
    false,
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const activeProjectId = conversation?.chatProjectId ?? null;

  const { data, isLoading } = useProjectsInfiniteQuery(
    { sortBy: 'lastConversationAt', sortDirection: 'desc', limit: 25 },
    { enabled: isAuthenticated, staleTime: 30000, cacheTime: 300000 },
  );

  const projects = useMemo(() => data?.pages.flatMap((page) => page.projects) ?? [], [data?.pages]);
  const hasMore = (data?.pages[data.pages.length - 1]?.nextCursor ?? null) != null;
  const isProjectsHome = location.pathname === '/projects';

  /**
   * Collapse the section by default for users with no projects who have never
   * toggled it, to keep the sidebar compact. An explicit toggle, or a collapse
   * set before this default existed (stored === false), is always respected.
   */
  const respectStoredExpanded = hasToggledSection || storedExpanded === false;
  const isExpanded = respectStoredExpanded ? storedExpanded : isLoading || projects.length > 0;

  const openProjects = useCallback(() => {
    navigate('/projects');
    toggleNav();
  }, [navigate, toggleNav]);

  const renderProjectsBody = () => {
    if (isLoading && projects.length === 0) {
      return (
        <div className="flex justify-start py-2 pl-2">
          <Spinner className="h-4 w-4 text-text-secondary" />
        </div>
      );
    }

    if (projects.length === 0) {
      return (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setIsCreateOpen(true)}
          className="flex h-9 w-full justify-start gap-2 rounded-lg px-2 text-sm font-normal text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-tertiary">
            <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="truncate">{localize('com_ui_new_project')}</span>
        </Button>
      );
    }

    return (
      <ul className="m-0 list-none p-0">
        {projects.map((project) => (
          <ProjectItem
            key={project._id}
            project={project}
            toggleNav={toggleNav}
            defaultExpanded={project._id === activeProjectId}
            isActive={
              project._id === activeProjectId || location.pathname === `/projects/${project._id}`
            }
          />
        ))}
        {hasMore && (
          <li className="list-none">
            <Button
              type="button"
              variant="ghost"
              onClick={openProjects}
              className="flex h-8 w-full justify-start rounded-lg px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              {localize('com_ui_all_projects')}
            </Button>
          </li>
        )}
      </ul>
    );
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex flex-col px-3 text-sm">
      <div
        className={cn(
          'flex h-9 w-full items-center gap-0.5 rounded-lg pr-0.5',
          isProjectsHome && 'bg-surface-active-alt',
        )}
      >
        <button
          onClick={() => {
            setStoredExpanded(!isExpanded);
            setHasToggledSection(true);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary outline-none transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary"
          type="button"
          aria-expanded={isExpanded}
          aria-label={localize('com_ui_projects')}
        >
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
              isExpanded ? '' : '-rotate-90',
            )}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={openProjects}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1.5 text-left text-sm font-medium text-text-primary outline-none hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary"
        >
          <span className="select-none truncate">{localize('com_ui_projects')}</span>
          {projects.length > 0 ? (
            <span className="text-xs font-normal tabular-nums text-text-tertiary">
              {projects.length}
            </span>
          ) : null}
        </button>
        <TooltipAnchor
          description={localize('com_ui_new_project')}
          render={
            <button
              type="button"
              aria-label={localize('com_ui_new_project')}
              className={iconButtonClassName}
              onClick={() => setIsCreateOpen(true)}
            >
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
            </button>
          }
        />
      </div>

      <Collapse open={isExpanded}>
        <div className="scrollbar-gutter-stable max-h-[42vh] overflow-y-auto pt-0.5">
          {renderProjectsBody()}
        </div>
      </Collapse>

      <ProjectCreateDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={(project) => {
          navigate(`/projects/${project._id}`);
          toggleNav();
        }}
      />
    </div>
  );
};

ProjectsSection.displayName = 'ProjectsSection';

export default memo(ProjectsSection);
