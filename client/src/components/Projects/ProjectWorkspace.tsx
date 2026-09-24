import { useCallback, useId, useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import * as Ariakit from '@ariakit/react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Constants, QueryKeys } from 'librechat-data-provider';
import { ArrowLeft, ArrowUpDown, Check, Folder, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Spinner, DropdownPopup, TooltipAnchor, useMediaQuery } from '@librechat/client';
import type { ConversationListResponse } from 'librechat-data-provider';
import type { MenuItemProps, RenderProp } from '~/common';
import { useConversationsInfiniteQuery, useProjectQuery } from '~/data-provider';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import ProjectDeleteDialog from './ProjectDeleteDialog';
import ProjectEditDialog from './ProjectEditDialog';
import { useLocalize, useNewConvo } from '~/hooks';
import { cn, clearMessagesCache } from '~/utils';
import ProjectChatList from './ProjectChatList';
import store from '~/store';

type ChatSortField = 'updatedAt' | 'createdAt';

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

export default function ProjectWorkspace() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { projectId = '' } = useParams();
  const [sortBy, setSortBy] = useState<ChatSortField>('updatedAt');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const sortMenuId = useId();
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const { data: project, isLoading: isProjectLoading } = useProjectQuery(projectId);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { newConversation } = useNewConvo();
  const activeProjectId = project?._id;
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  const sortOptions = useMemo(
    () => [
      { value: 'updatedAt' as const, label: localize('com_ui_sort_updated') },
      { value: 'createdAt' as const, label: localize('com_ui_sort_created') },
    ],
    [localize],
  );
  const selectedSortLabel =
    sortOptions.find((option) => option.value === sortBy)?.label ?? localize('com_ui_sort_updated');
  const sortMenuItems = useMemo<MenuItemProps[]>(
    () =>
      sortOptions.map((option) => {
        const isSelected = sortBy === option.value;
        return {
          id: `project-chat-sort-${option.value}`,
          ariaLabel: option.label,
          ariaChecked: isSelected,
          onClick: () => setSortBy(option.value),
          render: renderSortMenuItem(option.label, isSelected),
        };
      }),
    [sortBy, sortOptions],
  );

  const {
    data,
    fetchNextPage,
    isFetchingNextPage,
    isLoading: isConversationsLoading,
  } = useConversationsInfiniteQuery(
    {
      projectId: activeProjectId,
      sortBy,
      sortDirection: 'desc',
    },
    {
      enabled: Boolean(activeProjectId),
      staleTime: 30000,
      cacheTime: 300000,
    },
  );

  const conversations = useMemo(
    () => data?.pages.flatMap((page) => page.conversations) ?? [],
    [data?.pages],
  );

  const hasNextPage = useMemo(() => {
    const pages = data?.pages;
    if (!pages?.length) {
      return false;
    }
    const lastPage: ConversationListResponse = pages[pages.length - 1];
    return lastPage.nextCursor !== null;
  }, [data?.pages]);

  const startProjectChat = useCallback(() => {
    if (!activeProjectId) {
      return;
    }
    clearMessagesCache(queryClient, conversation?.conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    navigate(`/c/${Constants.NEW_CONVO}?projectId=${encodeURIComponent(activeProjectId)}`);
    newConversation({ template: { chatProjectId: activeProjectId } });
  }, [activeProjectId, conversation?.conversationId, navigate, newConversation, queryClient]);

  if (isProjectLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-presentation">
        <Spinner className="text-text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-presentation px-6 text-center">
        <p className="text-sm text-text-secondary">{localize('com_ui_project_not_found')}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => navigate('/projects')}>
          {localize('com_ui_all_projects')}
        </Button>
      </div>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-presentation text-text-primary">
      <header className="sticky top-0 z-10 border-b border-border-light bg-presentation">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 md:h-16 md:px-6">
          {isSmallScreen ? <OpenSidebar className="size-9 shrink-0" /> : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/projects')}
            className="-ml-1.5 text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {localize('com_ui_all_projects')}
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-10 pt-6 md:px-6 md:pt-8">
        <div className="flex items-start gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-secondary text-text-secondary">
            <Folder className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="truncate text-balance text-2xl font-semibold tracking-tight text-text-primary">
              {project.name}
            </h1>
            {project.description ? (
              <p className="mt-1 text-pretty text-sm leading-relaxed text-text-secondary">
                {project.description}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditOpen(true)}
                className="mt-1 text-sm text-text-tertiary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
              >
                {localize('com_ui_add_description')}
              </button>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 pt-1">
            <TooltipAnchor
              description={localize('com_ui_edit_project')}
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-text-secondary hover:text-text-primary"
                  aria-label={localize('com_ui_edit_project')}
                  onClick={() => setIsEditOpen(true)}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Button>
              }
            />
            <TooltipAnchor
              description={localize('com_ui_delete_project_action')}
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-text-secondary hover:text-text-destructive"
                  aria-label={localize('com_ui_delete_project_action')}
                  onClick={() => setIsDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              }
            />
          </div>
        </div>

        <ProjectEditDialog open={isEditOpen} onOpenChange={setIsEditOpen} project={project} />
        <ProjectDeleteDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} project={project} />

        <button
          type="button"
          onClick={startProjectChat}
          className={cn(
            'mt-7 flex w-full items-center gap-3 rounded-2xl border border-border-light bg-surface-secondary px-3.5 py-3 text-left',
            'transition-colors duration-150 hover:bg-surface-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary',
          )}
          aria-label={localize('com_ui_new_chat_in_project', { name: project.name })}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-tertiary text-text-primary">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
            {localize('com_ui_new_chat_in_project', { name: project.name })}
          </span>
        </button>

        <section className="mt-8 flex min-h-0 flex-1 flex-col">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-baseline gap-2 text-sm font-medium text-text-primary">
              {localize('com_ui_chats')}
              <span className="tabular-nums text-text-secondary">{project.conversationCount}</span>
            </h2>
            <DropdownPopup
              portal={true}
              focusLoop={true}
              unmountOnHide={true}
              menuId={sortMenuId}
              isOpen={isSortMenuOpen}
              setIsOpen={setIsSortMenuOpen}
              className="z-[125] min-w-44"
              trigger={
                <Ariakit.MenuButton
                  aria-label={localize('com_ui_sort_chats_by')}
                  className={cn(
                    'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary',
                    isSortMenuOpen && 'bg-surface-hover text-text-primary',
                  )}
                >
                  <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                  {selectedSortLabel}
                </Ariakit.MenuButton>
              }
              items={sortMenuItems}
            />
          </div>
          <ProjectChatList
            conversations={conversations}
            isLoading={isConversationsLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            sortBy={sortBy}
            emptyLabel={localize('com_ui_no_project_chats')}
            loadMore={() => fetchNextPage()}
          />
        </section>
      </div>
    </main>
  );
}
