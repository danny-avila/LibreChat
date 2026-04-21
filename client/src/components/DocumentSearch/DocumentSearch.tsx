import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { TooltipAnchor, Button, NewChatIcon, useMediaQuery } from '@librechat/client';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { ContextType } from '~/common';
import { useDocumentTitle, useLocalize } from '~/hooks';
import { useChatContext } from '~/Providers';
import { OpenSidebar } from '~/components/Chat/Menus';
import { useDocumentKeywordSearch } from '~/data-provider/DocumentSearch';
import type { DocumentHit } from '~/data-provider/DocumentSearch';
import { cn, clearMessagesCache } from '~/utils';
import SearchBar from './SearchBar';
import ResultCard from './ResultCard';
import DetailPanel from './DetailPanel';

const DEFAULT_TOP_K = 20;
const DEFAULT_CHUNKS_PER_DOC = 3;

const DocumentSearch: React.FC = () => {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { conversation, newConversation } = useChatContext();
  const { navVisible, setNavVisible } = useOutletContext<ContextType>();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  const queryFromUrl = searchParams.get('q') || '';
  const [query, setQuery] = useState(queryFromUrl);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  useDocumentTitle(`${localize('com_nav_document_search')} | LibreChat`);

  const search = useDocumentKeywordSearch();

  const runSearch = useCallback(
    (q: string) => {
      setQuery(q);
      setSelectedDocId(null);
      const next = new URLSearchParams(searchParams);
      if (q) {
        next.set('q', q);
      } else {
        next.delete('q');
      }
      setSearchParams(next);
      if (q) {
        search.mutate({
          query: q,
          top_k: DEFAULT_TOP_K,
          chunks_per_doc: DEFAULT_CHUNKS_PER_DOC,
        });
      } else {
        search.reset();
      }
    },
    [search, searchParams, setSearchParams],
  );

  useEffect(() => {
    if (queryFromUrl && !search.data && !search.isPending && !search.isError) {
      runSearch(queryFromUrl);
    }
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const documents = search.data?.documents ?? [];
  const selectedHit: DocumentHit | null = useMemo(() => {
    if (!selectedDocId) return documents[0] ?? null;
    return documents.find((d) => d.doc_id === selectedDocId || d.file_name === selectedDocId) ?? null;
  }, [documents, selectedDocId]);

  const handleNewChat = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      window.open('/c/new', '_blank');
      return;
    }
    clearMessagesCache(queryClient, conversation?.conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    newConversation();
  };

  return (
    <div className="relative flex w-full grow overflow-hidden bg-presentation">
      <main className="flex h-full w-full flex-col overflow-hidden" role="main">
        {!isSmallScreen && (
          <div className="sticky top-0 z-20 flex items-center justify-between bg-surface-secondary p-2 font-semibold text-text-primary md:h-14">
            <div className="mx-1 flex items-center gap-2">
              {!navVisible ? (
                <>
                  <OpenSidebar setNavVisible={setNavVisible} />
                  <TooltipAnchor
                    description={localize('com_ui_new_chat')}
                    render={
                      <Button
                        size="icon"
                        variant="outline"
                        data-testid="document-search-new-chat-button"
                        aria-label={localize('com_ui_new_chat')}
                        className="rounded-xl border border-border-light bg-surface-secondary p-2 hover:bg-surface-active-alt max-md:hidden"
                        onClick={handleNewChat}
                      >
                        <NewChatIcon />
                      </Button>
                    }
                  />
                </>
              ) : (
                <div className="h-10 w-10" />
              )}
            </div>
          </div>
        )}

        {/* Hero / header */}
        <div className="border-b border-border-light bg-presentation px-6 py-6">
          <div className="mx-auto max-w-4xl">
            <h1 className="mb-2 text-2xl font-bold tracking-tight text-text-primary">
              {localize('com_nav_document_search')}
            </h1>
            <p className="mb-4 text-sm text-text-secondary">
              {localize('com_document_search_subtitle')}
            </p>
            <SearchBar
              value={query}
              onSubmit={runSearch}
              isLoading={search.isPending}
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left: results */}
          <div
            className={cn(
              'flex min-h-0 w-full flex-col overflow-y-auto border-r border-border-light px-4 py-4',
              'md:w-[42%] md:max-w-[520px]',
            )}
          >
            {search.isPending && (
              <div className="py-10 text-center text-sm text-text-secondary">
                {localize('com_document_search_searching')}
              </div>
            )}
            {search.isError && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                {search.error?.message ?? localize('com_document_search_error')}
              </div>
            )}
            {!search.isPending && search.data && documents.length === 0 && (
              <div className="py-10 text-center text-sm text-text-secondary">
                {localize('com_document_search_empty')}
              </div>
            )}
            {!search.isPending && !search.data && (
              <div className="py-10 text-center text-sm text-text-secondary">
                {localize('com_document_search_hint')}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {documents.map((hit) => {
                const key = hit.doc_id || hit.file_name;
                const selected = selectedHit?.doc_id === hit.doc_id && !!hit.doc_id
                  ? true
                  : selectedHit?.file_name === hit.file_name;
                return (
                  <ResultCard
                    key={key}
                    hit={hit}
                    query={query}
                    isSelected={!!selected}
                    onClick={() => setSelectedDocId(hit.doc_id || hit.file_name)}
                  />
                );
              })}
            </div>
          </div>

          {/* Right: detail */}
          <div className="hidden min-h-0 flex-1 bg-surface-secondary md:flex">
            <DetailPanel hit={selectedHit} query={query} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default DocumentSearch;
