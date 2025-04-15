import { useEffect, useCallback, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useNavigate, useLocation } from 'react-router-dom';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import type { SearchConversationListResponse } from 'librechat-data-provider';
import { useSearchInfiniteQuery, useGetSearchEnabledQuery } from '~/data-provider';
import useNewConvo from '~/hooks/useNewConvo';
import store from '~/store';

export interface UseSearchMessagesResult {
  searchQuery: string;
  searchQueryRes: UseInfiniteQueryResult<SearchConversationListResponse, unknown> | undefined;
}

export default function useSearchMessages({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}): UseSearchMessagesResult {
  const navigate = useNavigate();
  const location = useLocation();
  const { switchToConversation } = useNewConvo();
  const searchPlaceholderConversation = useCallback(() => {
    switchToConversation({
      conversationId: 'search',
      title: 'Search',
      endpoint: null,
      createdAt: '',
      updatedAt: '',
    });
  }, [switchToConversation]);

  const searchQuery = useRecoilValue(store.searchQuery);
  const setIsSearchEnabled = useSetRecoilState(store.isSearchEnabled);

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 350); // 350ms debounce
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const searchEnabledQuery = useGetSearchEnabledQuery({ enabled: isAuthenticated });
  const searchQueryRes = useSearchInfiniteQuery(
    { nextCursor: null, search: debouncedSearchQuery, pageSize: 20 },
    { enabled: isAuthenticated && !!debouncedSearchQuery },
  ) as UseInfiniteQueryResult<SearchConversationListResponse, unknown> | undefined;

  useEffect(() => {
    if (searchQuery && searchQuery.length > 0) {
      navigate('/search', { replace: true });
      return;
    }

    if (location.pathname && location.pathname.includes('/c/')) {
      return;
    }
    navigate('/c/new', { replace: true });
    /* Disabled eslint rule because we don't want to run this effect when location changes */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, searchQuery]);

  useEffect(() => {
    if (searchEnabledQuery.data === true) {
      setIsSearchEnabled(searchEnabledQuery.data);
    } else if (searchEnabledQuery.isError) {
      console.error('Failed to get search enabled', searchEnabledQuery.error);
    }
  }, [
    searchEnabledQuery.data,
    searchEnabledQuery.error,
    searchEnabledQuery.isError,
    setIsSearchEnabled,
  ]);

  const onSearchSuccess = useCallback(
    () => searchPlaceholderConversation(),
    [searchPlaceholderConversation],
  );

  useEffect(() => {
    // we use isInitialLoading here instead of isLoading because query is disabled by default
    if (searchQueryRes?.data) {
      onSearchSuccess();
    }
  }, [searchQueryRes?.data, searchQueryRes?.isInitialLoading, onSearchSuccess]);

  const setIsSearchTyping = useSetRecoilState(store.isSearchTyping);

  useEffect(() => {
    if (!searchQueryRes?.isLoading && !searchQueryRes?.isFetching) {
      setIsSearchTyping(false);
    }
  }, [searchQueryRes?.isLoading, searchQueryRes?.isFetching, setIsSearchTyping]);

  return {
    searchQuery,
    searchQueryRes,
  };
}
