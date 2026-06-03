import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { useRecoilValue } from 'recoil';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Folder,
  FolderPlus,
  Folders,
  Pencil,
  Trash2,
} from 'lucide-react';
import { QueryKeys } from 'librechat-data-provider';
import type { TChatProject, TConversation } from 'librechat-data-provider';
import {
  Button,
  Input,
  Spinner,
  OGDialog,
  OGDialogClose,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  TooltipAnchor,
  DropdownPopup,
  NewChatIcon,
  useToastContext,
} from '@librechat/client';
import type { MenuItemProps } from '~/common';
import {
  useProjectsInfiniteQuery,
  useConversationsInfiniteQuery,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
} from '~/data-provider';
import { useLocalize, useLocalStorage, useNewConvo } from '~/hooks';
import ProjectCreateDialog from '~/components/Projects/ProjectCreateDialog';
import { clearMessagesCache, cn } from '~/utils';
import { NotificationSeverity } from '~/common';
import Convo from './Convo';
import store from '~/store';

const INLINE_CHAT_LIMIT = 8;

const iconButtonClassName =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary outline-none transition-colors hover:bg-surface-active-alt hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white';

function ProjectRenameDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: TChatProject;
}) {
  const localize = useLocalize();
  const formId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(project.name);
  const updateProject = useUpdateProjectMutation();
  const { showToast } = useToastContext();

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(project.name);
    const frameId = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frameId);
  }, [open, project.name]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || updateProject.isLoading) {
      return;
    }
    updateProject.mutate(
      { projectId: project._id, name: trimmed },
      {
        onSuccess: () => onOpenChange(false),
        onError: () =>
          showToast({
            message: localize('com_ui_project_rename_error'),
            severity: NotificationSeverity.ERROR,
            showIcon: true,
          }),
      },
    );
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-11/12 max-w-md" showCloseButton={false}>
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_ui_rename_project')}</OGDialogTitle>
        </OGDialogHeader>
        <form id={formId} onSubmit={handleSubmit}>
          <Input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label={localize('com_ui_project_name')}
            className="w-full bg-transparent text-text-primary placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-ring-primary"
          />
        </form>
        <div className="flex justify-end gap-4 pt-4">
          <OGDialogClose asChild>
            <Button aria-label="cancel" variant="outline">
              {localize('com_ui_cancel')}
            </Button>
          </OGDialogClose>
          <Button
            type="submit"
            form={formId}
            variant="submit"
            disabled={!name.trim() || updateProject.isLoading}
          >
            {updateProject.isLoading ? <Spinner className="size-4" /> : localize('com_ui_save')}
          </Button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

function ProjectDeleteDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: TChatProject;
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();
  const deleteProject = useDeleteProjectMutation();
  const { showToast } = useToastContext();

  const confirmDelete = () => {
    deleteProject.mutate(project._id, {
      onSuccess: () => {
        onOpenChange(false);
        if (location.pathname === `/projects/${project._id}`) {
          navigate('/projects');
        }
      },
      onError: () =>
        showToast({
          message: localize('com_ui_project_delete_error'),
          severity: NotificationSeverity.ERROR,
          showIcon: true,
        }),
    });
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-11/12 max-w-md" showCloseButton={false}>
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_ui_delete_project')}</OGDialogTitle>
        </OGDialogHeader>
        <div className="text-sm text-text-secondary">
          {localize('com_ui_delete_project_confirm', { name: project.name })}
        </div>
        <div className="flex justify-end gap-4 pt-4">
          <OGDialogClose asChild>
            <Button aria-label="cancel" variant="outline">
              {localize('com_ui_cancel')}
            </Button>
          </OGDialogClose>
          <Button variant="destructive" onClick={confirmDelete} disabled={deleteProject.isLoading}>
            {deleteProject.isLoading ? <Spinner className="size-4" /> : localize('com_ui_delete')}
          </Button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

const noop = () => {};

function ProjectChatsInline({
  projectId,
  toggleNav,
  onShowAll,
}: {
  projectId: string;
  toggleNav: () => void;
  onShowAll: () => void;
}) {
  const localize = useLocalize();
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
          isGenerating={false}
        />
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={onShowAll}
          className="ml-1 mt-0.5 rounded-md px-2 py-1 text-xs font-medium text-text-secondary outline-none transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        >
          {localize('com_ui_show_all')}
        </button>
      )}
    </div>
  );
}

function ProjectItem({
  project,
  toggleNav,
  defaultExpanded,
}: {
  project: TChatProject;
  toggleNav: () => void;
  defaultExpanded: boolean;
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const menuId = useId();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const openProject = useCallback(() => {
    navigate(`/projects/${project._id}`);
    toggleNav();
  }, [navigate, project._id, toggleNav]);

  const startChat = useCallback(() => {
    clearMessagesCache(queryClient, conversation?.conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    newConversation({ template: { chatProjectId: project._id } });
    toggleNav();
  }, [conversation?.conversationId, newConversation, project._id, queryClient, toggleNav]);

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
        label: localize('com_ui_rename'),
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
      <div className="group/project-row relative flex h-9 items-center rounded-lg text-sm text-text-primary transition-colors hover:bg-surface-active-alt">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-label={project.name}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1.5 pl-1.5 pr-14 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        >
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-text-secondary transition-transform duration-200',
              expanded && 'rotate-90',
            )}
            aria-hidden="true"
          />
          <Folder className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <span className="truncate">{project.name}</span>
        </button>
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-surface-active-alt opacity-0 transition-opacity group-focus-within/project-row:opacity-100 group-hover/project-row:opacity-100 has-[[data-state=open]]:opacity-100">
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
      {expanded && (
        <ProjectChatsInline projectId={project._id} toggleNav={toggleNav} onShowAll={openProject} />
      )}
      <ProjectRenameDialog open={isRenameOpen} onOpenChange={setIsRenameOpen} project={project} />
      <ProjectDeleteDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} project={project} />
    </li>
  );
}

interface ProjectsSectionProps {
  toggleNav: () => void;
  isAuthenticated: boolean;
}

const ProjectsSection = ({ toggleNav, isAuthenticated }: ProjectsSectionProps) => {
  const localize = useLocalize();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useLocalStorage('projectsSectionExpanded', true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const activeProjectId = conversation?.chatProjectId ?? null;

  const { data, isLoading } = useProjectsInfiniteQuery(
    { sortBy: 'lastConversationAt', sortDirection: 'desc', limit: 25 },
    { enabled: isAuthenticated, staleTime: 30000, cacheTime: 300000 },
  );

  const projects = useMemo(() => data?.pages.flatMap((page) => page.projects) ?? [], [data?.pages]);
  const hasMore = (data?.pages[data.pages.length - 1]?.nextCursor ?? null) != null;

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
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-secondary outline-none transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        >
          <FolderPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{localize('com_ui_new_project')}</span>
        </button>
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
          />
        ))}
        {hasMore && (
          <li className="list-none">
            <button
              type="button"
              onClick={openProjects}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-text-secondary outline-none transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
            >
              {localize('com_ui_all_projects')}
            </button>
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
      <div className="flex h-8 w-full items-center gap-0.5 pr-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="group flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1 py-2 text-xs font-bold text-text-secondary outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
          type="button"
          aria-expanded={isExpanded}
        >
          <span className="select-none truncate">{localize('com_ui_projects')}</span>
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 transition-transform duration-200',
              isExpanded ? '' : '-rotate-90',
            )}
            aria-hidden="true"
          />
        </button>
        <TooltipAnchor
          description={localize('com_ui_all_projects')}
          render={
            <button
              type="button"
              aria-label={localize('com_ui_all_projects')}
              className={iconButtonClassName}
              onClick={openProjects}
            >
              <Folders className="h-4 w-4" aria-hidden="true" />
            </button>
          }
        />
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

      {isExpanded && <div className="max-h-[42vh] overflow-y-auto">{renderProjectsBody()}</div>}

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
