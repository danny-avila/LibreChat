import React, { useCallback, useEffect, useMemo, useState } from 'react';
import debounce from 'lodash/debounce';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Search, X } from 'lucide-react';
import { OGDialog, OGDialogContent, OGDialogTitle, Spinner } from '@librechat/client';
import type { TMessage } from 'librechat-data-provider';
import { useConversationsInfiniteQuery, useMessagesInfiniteQuery } from '~/data-provider';
import { useAuthContext } from '~/hooks';
import { cn } from '~/utils';

/** 서버(messages.js)가 Meilisearch 하이라이트에 사용하는 마커 (유니코드 사설 영역) */
const HL_PRE = '\ue000';
const HL_POST = '\ue001';
const HL_REGEX = new RegExp(`${HL_PRE}([\\s\\S]*?)${HL_POST}`, 'g');

const PLACEHOLDER = '채팅 검색';
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
 * BKL: ChatGPT 스타일 채팅 검색 다이얼로그.
 * 제목(Conversation 인덱스)과 본문(Message 인덱스)을 함께 검색하고,
 * 본문 매칭은 매칭 지점 주변 스니펫에 검색어를 볼드 처리해 보여준다.
 */
export default function BklChatSearch({ isSmallScreen }: { isSmallScreen?: boolean }) {
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

  const goToConversation = useCallback(
    (conversationId: string) => {
      handleOpenChange(false);
      navigate(`/c/${conversationId}`);
    },
    [handleOpenChange, navigate],
  );

  /** Cmd/Ctrl+K 단축키 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={PLACEHOLDER}
        className="group my-1 flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-primary transition-colors duration-200 hover:bg-surface-active-alt"
      >
        <Search className="h-4 w-4 text-text-secondary group-hover:text-text-primary" />
        <span className="flex-1 text-left">{PLACEHOLDER}</span>
        {!isSmallScreen && (
          <kbd className="rounded border border-border-light px-1.5 py-0.5 text-[10px] text-text-secondary">
            ⌘K
          </kbd>
        )}
      </button>
      <OGDialog open={open} onOpenChange={handleOpenChange}>
        <OGDialogContent
          title={PLACEHOLDER}
          showCloseButton={false}
          className="flex max-h-[70vh] w-11/12 max-w-2xl flex-col gap-0 overflow-hidden bg-surface-primary p-0"
        >
          <OGDialogTitle className="sr-only">{PLACEHOLDER}</OGDialogTitle>
          <div className="flex shrink-0 items-center gap-3 border-b border-border-light px-4 py-3">
            <Search className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              type="text"
              value={query}
              onChange={onChange}
              placeholder={PLACEHOLDER}
              aria-label={PLACEHOLDER}
              autoComplete="off"
              dir="auto"
              className="flex-1 border-none bg-transparent text-base text-text-primary outline-none placeholder:text-text-secondary"
            />
            <button
              type="button"
              aria-label="닫기"
              onClick={() => handleOpenChange(false)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-[200px] flex-1 overflow-y-auto py-2">
            {!searchActive && (
              <div className="flex h-full min-h-[180px] items-center justify-center px-4 text-sm text-text-secondary">
                {HINT_MESSAGE}
              </div>
            )}
            {searchActive && isSearching && results.length === 0 && (
              <div className="flex h-full min-h-[180px] items-center justify-center">
                <Spinner className="text-text-primary" />
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
                  'flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors',
                  'hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none',
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
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
