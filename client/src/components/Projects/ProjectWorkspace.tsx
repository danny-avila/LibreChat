import { useCallback, useId, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { useRecoilValue } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpDown, Check, Plus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { QueryKeys } from 'librechat-data-provider';
import type { ConversationListResponse } from 'librechat-data-provider';
import { Spinner, DropdownPopup } from '@librechat/client';
import type { MenuItemProps, RenderProp } from '~/common';
import { useConversationsInfiniteQuery, useProjectQuery } from '~/data-provider';
import PageHeader from '~/components/ui/PageHeader';
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
  const sortMenuId = useId();
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const { data: project, isLoading: isProjectLoading } = useProjectQuery(projectId);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { newConversation } = useNewConvo();
  const activeProjectId = project?._id;

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
    newConversation({ template: { chatProjectId: activeProjectId } });
  }, [activeProjectId, conversation?.conversationId, newConversation, queryClient]);

  if (isProjectLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-secondary">
        {localize('com_ui_project_not_found')}
      </div>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface-primary text-text-primary">
      <div className="px-6">
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="-ml-1.5 mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_all_projects')}
        </button>
      </div>

      <PageHeader title={project.name} />

      <div className="flex w-full flex-1 flex-col px-6 pb-6">
        {project.description ? (
          <p className="mt-3 line-clamp-2 text-sm text-text-secondary">{project.description}</p>
        ) : null}

        <button
          type="button"
          onClick={startProjectChat}
          className={cn(
            'mt-6 flex w-full items-center gap-3 rounded-[26px] border border-border-medium bg-surface-secondary px-3.5 py-3 text-left shadow-sm transition-colors',
            'hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
          )}
          aria-label={localize('com_ui_new_chat_in_project', { name: project.name })}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-tertiary text-text-primary">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-text-secondary">
            {localize('com_ui_new_chat_in_project', { name: project.name })}
          </span>
        </button>

        <section className="mt-8 flex min-h-0 flex-1 flex-col">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="flex items-baseline gap-2 text-sm font-medium text-text-primary">
              {localize('com_ui_chats')}
              <span className="text-text-secondary">{project.conversationCount}</span>
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
                    'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
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
