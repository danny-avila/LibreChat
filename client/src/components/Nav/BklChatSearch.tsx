import React, { useCallback, useEffect, useMemo, useState } from 'react';
import debounce from 'lodash/debounce';
import { useNavigate } from 'react-router-dom';
import { Loader2, MessageSquare, Search, X } from 'lucide-react';
import {
  Input,
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
} from '@librechat/client';
import type { TMessage } from 'librechat-data-provider';
import { useConversationsInfiniteQuery, useMessagesInfiniteQuery } from '~/data-provider';
import { useAuthContext } from '~/hooks';
import { cn } from '~/utils';

/** 서버(messages.js)가 Meilisearch 하이라이트에 사용하는 마커 (유니코드 사설 영역) */
const HL_PRE = '\ue000';
const HL_POST = '\ue001';
const HL_REGEX = new RegExp(`${HL_PRE}([\\s\\S]*?)${HL_POST}`, 'g');

const LABEL = '채팅 검색';
const EMPTY_MESSAGE = '검색 결과가 없습니다.';
const HINT_MESSAGE = '채팅 제목과 대화 내용을 검색합니다.';

/** 스니펫 내 하이라이트 마커를 <strong> 으로 렌더링 */
export function SnippetText({ snippet }: { snippet: string }) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  HL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HL_REGEX.exec(snippet)) !== null) {
    if (match.index > last) {
      nodes.push(snippet.slice(last, match.index));
    }
    nodes.push(
      <strong key={key++} className="font-semibold text-text-primary">
        {match[1]}
      </strong>,
    );
    last = HL_REGEX.lastIndex;
  }
  if (last < snippet.length) {
    nodes.push(snippet.slice(last));
  }
  return <>{nodes}</>;
}

/** 제목에서 검색어와 일치하는 부분을 <strong> 으로 렌더링 (대소문자 무시) */
export function HighlightedTitle({ title, query }: { title: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) {
    return <>{title}</>;
  }
  const lower = title.toLowerCase();
  const q = trimmed.toLowerCase();
  const nodes: React.ReactNode[] = [];
  let idx = 0;
  let key = 0;
  let pos = lower.indexOf(q, idx);
  while (pos !== -1) {
    if (pos > idx) {
      nodes.push(title.slice(idx, pos));
    }
    nodes.push(<strong key={key++}>{title.slice(pos, pos + q.length)}</strong>);
    idx = pos + q.length;
    pos = lower.indexOf(q, idx);
  }
  nodes.push(title.slice(idx));
  return <>{nodes}</>;
}

type SearchHit = {
  conversationId: string;
  title: string;
  snippet?: string | null;
};

type SearchedMessage = TMessage & { title?: string };

/**
 * BKL: 채팅 검색 — 좌측 네비의 "새 채팅"/"문서 검색"과 같은 층위·같은 스타일의
 * row 로 노출되고, 클릭 시 표준 모달에서 제목(Conversation 인덱스)과
 * 본문(Message 인덱스)을 함께 검색한다. 본문 매칭은 스니펫에 검색어 볼드 처리.
 */
export default function BklChatSearch() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const setDebounced = useMemo(() => debounce(setDebouncedQuery, 350), []);
  useEffect(() => () => setDebounced.cancel(), [setDebounced]);

  const searchActive = open && debouncedQuery.trim().length > 0;

  const { data: convoData, isFetching: isConvoFetching } = useConversationsInfiniteQuery(
    { search: debouncedQuery.trim() || undefined },
    { enabled: isAuthenticated && searchActive, staleTime: 30000 },
  );

  const { data: messageData, isFetching: isMessageFetching } = useMessagesInfiniteQuery(
    { search: debouncedQuery.trim() || undefined },
    { enabled: isAuthenticated && searchActive, staleTime: 30000 },
  );

  /** 제목 매칭 우선, 이어서 본문 매칭. 대화당 한 행으로 합치고 스니펫이 있으면 표시. */
  const results = useMemo<SearchHit[]>(() => {
    if (!searchActive) {
      return [];
    }
    const map = new Map<string, SearchHit>();
    const titleMatches = convoData?.pages.flatMap((page) => page.conversations) ?? [];
    for (const convo of titleMatches) {
      if (convo?.conversationId) {
        map.set(convo.conversationId, {
          conversationId: convo.conversationId,
          title: convo.title ?? '',
        });
      }
    }
    const messages = (messageData?.pages.flatMap((page) => page.messages) ??
      []) as SearchedMessage[];
    for (const message of messages) {
      const conversationId = message.conversationId;
      if (!conversationId) {
        continue;
      }
      const snippet = message.searchSnippet || (message.text ?? '').slice(0, 120) || null;
      const existing = map.get(conversationId);
      if (existing) {
        if (!existing.snippet && snippet) {
          existing.snippet = snippet;
        }
      } else {
        map.set(conversationId, {
          conversationId,
          title: message.title ?? '',
          snippet,
        });
      }
    }
    return [...map.values()];
  }, [searchActive, convoData, messageData]);

  const isSearching =
    searchActive && (isConvoFetching || isMessageFetching || query.trim() !== debouncedQuery.trim());

  const handleOpenChange = useCallback(
    (value: boolean) => {
      setOpen(value);
      if (!value) {
        setQuery('');
        setDebounced.cancel();
        setDebouncedQuery('');
      }
    },
    [setDebounced],
  );

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setQuery(value);
      setDebounced(value);
    },
    [setDebounced],
  );

  const handleClear = useCallback(() => {
    setQuery('');
    setDebounced.cancel();
    setDebouncedQuery('');
  }, [setDebounced]);

  const goToConversation = useCallback(
    (conversationId: string) => {
      handleOpenChange(false);
      navigate(`/c/${conversationId}`);
    },
    [handleOpenChange, navigate],
  );

  const openDialog = useCallback(() => setOpen(true), []);

  return (
    <>
      {/* 트리거 — FavoritesList 의 "새 채팅"/"문서 검색" row 와 동일한 마크업/스타일 */}
      <div
        role="button"
        tabIndex={0}
        aria-label={LABEL}
        className="group relative flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-text-primary outline-none hover:bg-surface-active-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        onClick={openDialog}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openDialog();
          }
        }}
        data-testid="nav-chat-search-button"
      >
        <div className="flex flex-1 items-center truncate pr-6">
          <div className="mr-2 h-5 w-5">
            <Search className="h-5 w-5 text-text-primary" />
          </div>
          <span className="truncate">{LABEL}</span>
        </div>
      </div>
      <OGDialog open={open} onOpenChange={handleOpenChange}>
        <OGDialogContent className="w-11/12 max-w-2xl bg-background text-text-primary shadow-2xl">
          <OGDialogHeader>
            <OGDialogTitle>{LABEL}</OGDialogTitle>
          </OGDialogHeader>
          <div className="flex flex-col gap-3">
            {/* 검색 입력 — 문서 검색(SearchBar.tsx)과 동일한 인풋 스타일 */}
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary">
                {isSearching ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-5 w-5" aria-hidden="true" />
                )}
              </span>
              <Input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                type="text"
                value={query}
                onChange={onChange}
                placeholder={LABEL}
                aria-label={LABEL}
                autoComplete="off"
                spellCheck={false}
                dir="auto"
                className="h-12 rounded-xl border-border-medium bg-transparent pl-12 pr-12 text-base text-text-primary shadow-sm transition-[border-color,box-shadow] duration-200 placeholder:text-text-secondary focus:border-border-heavy focus:shadow-md focus:ring-0"
              />
              {query && (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Clear"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="max-h-[50vh] min-h-[180px] overflow-y-auto">
              {!searchActive && (
                <div className="flex h-full min-h-[180px] items-center justify-center px-4 text-sm text-text-secondary">
                  {HINT_MESSAGE}
                </div>
              )}
              {searchActive && isSearching && results.length === 0 && (
                <div className="flex h-full min-h-[180px] items-center justify-center px-4 text-sm text-text-secondary">
                  검색 중...
                </div>
              )}
              {searchActive && !isSearching && results.length === 0 && (
                <div className="flex h-full min-h-[180px] items-center justify-center px-4 text-sm text-text-secondary">
                  {EMPTY_MESSAGE}
                </div>
              )}
              {results.map((hit) => (
                <button
                  key={hit.conversationId}
                  type="button"
                  onClick={() => goToConversation(hit.conversationId)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                    'hover:bg-surface-active-alt focus-visible:bg-surface-active-alt focus-visible:outline-none',
                  )}
                >
                  <MessageSquare
                    className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-primary">
                      <HighlightedTitle title={hit.title || '(제목 없음)'} query={debouncedQuery} />
                    </span>
                    {hit.snippet ? (
                      <span className="mt-0.5 block truncate text-xs text-text-secondary">
                        <SnippetText snippet={hit.snippet} />
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
