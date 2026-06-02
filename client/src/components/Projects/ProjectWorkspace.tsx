import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Folder, Plus, Send } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Spinner } from '@librechat/client';
import type { ConversationListResponse } from 'librechat-data-provider';
import { useConversationsInfiniteQuery, useProjectQuery } from '~/data-provider';
import { useLocalize, useNewConvo } from '~/hooks';
import ProjectChatList from './ProjectChatList';

type ChatSortField = 'updatedAt' | 'createdAt';

export default function ProjectWorkspace() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { projectId = '' } = useParams();
  const { newConversation } = useNewConvo();
  const [sortBy, setSortBy] = useState<ChatSortField>('updatedAt');
  const { data: project, isLoading: isProjectLoading } = useProjectQuery(projectId);
  const activeProjectId = project?._id;

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

  const startProjectChat = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      if (!activeProjectId) {
        return;
      }
      newConversation({ template: { chatProjectId: activeProjectId } });
      navigate(`/c/new?projectId=${encodeURIComponent(activeProjectId)}`, {
        state: { focusChat: true },
      });
    },
    [activeProjectId, navigate, newConversation],
  );

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
    <main className="flex h-full min-h-0 flex-col overflow-auto bg-surface-primary text-text-primary">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
        <button
          type="button"
          className="inline-flex w-fit items-center gap-2 rounded-lg px-2 py-1 text-sm text-text-secondary hover:bg-surface-hover"
          onClick={() => navigate('/projects')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_all_projects')}
        </button>

        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Folder className="h-8 w-8 shrink-0 text-text-secondary" aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="truncate text-3xl font-semibold tracking-normal">{project.name}</h1>
              <p className="text-sm text-text-secondary">
                {localize('com_ui_project_chat_count', { count: project.conversationCount })}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-4 text-sm font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
            onClick={() => startProjectChat()}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {localize('com_ui_new_chat')}
          </button>
        </header>

        <form
          onSubmit={startProjectChat}
          className="rounded-lg border border-border-light p-4 shadow-sm"
        >
          <div className="flex min-h-24 items-start gap-3">
            <Plus className="mt-1 h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
            <input
              className="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-text-tertiary"
              placeholder={localize('com_ui_new_chat_in_project', { name: project.name })}
              readOnly
              onFocus={() => startProjectChat()}
            />
            <button
              type="submit"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
              aria-label={localize('com_ui_new_chat')}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </form>

        <section className="flex min-h-[360px] flex-1 flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-border-light p-1">
              <button
                type="button"
                className="rounded-md bg-surface-secondary px-3 py-1.5 text-sm font-medium"
              >
                {localize('com_ui_chats')}
              </button>
            </div>
            <label className="text-sm text-text-secondary">
              <span className="sr-only">{localize('com_ui_sort_chats_by')}</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as ChatSortField)}
                className="rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-ring-primary"
              >
                <option value="updatedAt">{localize('com_ui_sort_updated')}</option>
                <option value="createdAt">{localize('com_ui_sort_created')}</option>
              </select>
            </label>
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
