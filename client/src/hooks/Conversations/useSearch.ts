import { useEffect, useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useNavigate, useLocation } from 'react-router-dom';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import type { SearchConversationListResponse } from 'librechat-data-provider';
import { useSearchInfiniteQuery, useGetSearchEnabledQuery } from '~/data-provider';
import useNewConvo from '~/hooks/useNewConvo';
import store from '~/store';

export default function useSearchMessages({ isAuthenticated }: { isAuthenticated: boolean }) {
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

  const searchEnabledQuery = useGetSearchEnabledQuery({ enabled: isAuthenticated });
  const searchQueryRes = useSearchInfiniteQuery(
    { nextCursor: null, search: searchQuery, pageSize: 20 },
    { enabled: isAuthenticated && !!searchQuery.length },
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

  return {
    searchQuery,
    searchQueryRes,
  };
}
