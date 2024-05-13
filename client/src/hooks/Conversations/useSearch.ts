import { useEffect, useState, useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useGetSearchEnabledQuery } from 'librechat-data-provider/react-query';
import type { ConversationListResponse } from 'librechat-data-provider';
import { useSearchInfiniteQuery } from '~/data-provider';
import useConversation from './useConversation';
import store from '~/store';

export default function useSearchMessages({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [pageNumber, setPageNumber] = useState(1);
  const { searchPlaceholderConversation } = useConversation();

  const searchQuery = useRecoilValue(store.searchQuery);
  const setIsSearchEnabled = useSetRecoilState(store.isSearchEnabled);
  const setSearchResultMessages = useSetRecoilState(store.searchResultMessages);

  const searchEnabledQuery = useGetSearchEnabledQuery({ enabled: isAuthenticated });
  const searchQueryRes = useSearchInfiniteQuery(
    { pageNumber: pageNumber.toString(), searchQuery: searchQuery, isArchived: false },
    { enabled: isAuthenticated && !!searchQuery.length },
  );

  useEffect(() => {
    if (searchEnabledQuery.data) {
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
    ({ data }: { data: ConversationListResponse }) => {
      const res = data;
      searchPlaceholderConversation();
      setSearchResultMessages(res.messages);
    },
    [searchPlaceholderConversation, setSearchResultMessages],
  );

  useEffect(() => {
    //we use isInitialLoading here instead of isLoading because query is disabled by default
    if (searchQueryRes.data) {
      onSearchSuccess({ data: searchQueryRes.data.pages[0] });
    }
  }, [searchQueryRes.data, searchQueryRes.isInitialLoading, onSearchSuccess]);

  return {
    pageNumber,
    searchQuery,
    setPageNumber,
    searchQueryRes,
  };
}
