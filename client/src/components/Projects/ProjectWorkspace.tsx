import { useCallback, useId, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { useRecoilValue } from 'recoil';
import { ArrowLeft, ArrowUpDown, Check, Folder, Plus, SlidersHorizontal } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ConversationListResponse } from 'librechat-data-provider';
import { Button, Spinner, DropdownPopup } from '@librechat/client';
import type { MenuItemProps, RenderProp } from '~/common';
import {
  useConversationsInfiniteQuery,
  useGetStartupConfig,
  useProjectQuery,
} from '~/data-provider';
import { useAgentsMap, useLocalize } from '~/hooks';
import { cn, getDefaultModelSpec, getModelSpec } from '~/utils';
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
  const { projectId = '' } = useParams();
  const [sortBy, setSortBy] = useState<ChatSortField>('updatedAt');
  const sortMenuId = useId();
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const { data: startupConfig } = useGetStartupConfig();
  const { data: project, isLoading: isProjectLoading } = useProjectQuery(projectId);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const agentsMap = useAgentsMap({ isAuthenticated: true });
  const activeProjectId = project?._id;
  const activeSettingsLabel = useMemo(() => {
    const defaultModelSpec = getDefaultModelSpec(startupConfig);
    const fallbackModelSpec = defaultModelSpec?.default ?? defaultModelSpec?.last;
    const modelSpec =
      getModelSpec({ specName: conversation?.spec, startupConfig }) ?? fallbackModelSpec;
    if (modelSpec?.label) {
      return modelSpec.label;
    }

    if (conversation?.agent_id) {
      return agentsMap?.[conversation.agent_id]?.name ?? conversation.agent_id;
    }

    const endpoint = conversation?.endpointType ?? conversation?.endpoint;
    const model = conversation?.modelLabel ?? conversation?.model ?? conversation?.chatGptLabel;
    return [endpoint, model].filter(Boolean).join(' · ') || localize('com_ui_model');
  }, [
    agentsMap,
    conversation?.agent_id,
    conversation?.chatGptLabel,
    conversation?.endpoint,
    conversation?.endpointType,
    conversation?.model,
    conversation?.modelLabel,
    conversation?.spec,
    localize,
    startupConfig,
  ]);
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
    navigate(`/c/new?projectId=${encodeURIComponent(activeProjectId)}`, {
      state: { focusChat: true },
    });
  }, [activeProjectId, navigate]);

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
    <main className="flex h-full min-h-0 flex-col overflow-auto bg-presentation text-text-primary">
      <div className="container mx-auto flex w-full max-w-5xl flex-1 flex-col gap-7 px-4 py-8 md:px-6 lg:pt-12">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit text-text-secondary"
          onClick={() => navigate('/projects')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_all_projects')}
        </Button>

        <header className="flex flex-col gap-5">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Folder className="h-9 w-9 shrink-0 text-text-secondary" aria-hidden="true" />
              <h1 className="min-w-0 truncate text-3xl font-semibold tracking-normal text-text-primary md:text-4xl">
                {project.name}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-border-light bg-presentation px-3 py-2 text-sm text-text-primary">
                <SlidersHorizontal
                  className="h-4 w-4 shrink-0 text-text-secondary"
                  aria-hidden="true"
                />
                <span className="truncate">{activeSettingsLabel}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className={cn(
              'flex min-h-16 w-full items-center gap-4 rounded-2xl border border-border-light bg-surface-chat px-4 py-3 text-left shadow-sm transition-colors',
              'hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
            )}
            onClick={startProjectChat}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-primary">
              <Plus className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate text-base text-text-secondary">
              {localize('com_ui_new_chat_in_project', { name: project.name })}
            </span>
          </button>
        </header>

        <section className="flex min-h-[360px] flex-1 flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-lg border border-border-light p-1">
              <button
                type="button"
                className="rounded-md bg-surface-secondary px-3 py-1.5 text-sm font-medium text-text-primary"
              >
                {localize('com_ui_chats')}
              </button>
              <span className="pr-2 text-xs text-text-secondary">
                {localize('com_ui_project_chat_count', { count: project.conversationCount })}
              </span>
            </div>
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
                    'inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border-medium bg-transparent px-3 text-sm font-medium text-text-primary ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
                    isSortMenuOpen && 'bg-surface-hover text-text-primary',
                  )}
                >
                  <ArrowUpDown className="h-4 w-4 text-text-secondary" aria-hidden="true" />
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
