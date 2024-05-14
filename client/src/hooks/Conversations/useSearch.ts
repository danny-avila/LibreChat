import { useEffect, useState, useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGetSearchEnabledQuery } from 'librechat-data-provider/react-query';
import { useSearchInfiniteQuery } from '~/data-provider';
import useConversation from './useConversation';
import store from '~/store';

export default function useSearchMessages({ isAuthenticated }: { isAuthenticated: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [pageNumber, setPageNumber] = useState(1);
  const { searchPlaceholderConversation } = useConversation();

  const searchQuery = useRecoilValue(store.searchQuery);
  const setIsSearchEnabled = useSetRecoilState(store.isSearchEnabled);

  const searchEnabledQuery = useGetSearchEnabledQuery({ enabled: isAuthenticated });
  const searchQueryRes = useSearchInfiniteQuery(
    { pageNumber: pageNumber.toString(), searchQuery: searchQuery, isArchived: false },
    { enabled: isAuthenticated && !!searchQuery.length },
  );

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
    () => searchPlaceholderConversation(),
    [searchPlaceholderConversation],
  );

  useEffect(() => {
    //we use isInitialLoading here instead of isLoading because query is disabled by default
    if (searchQueryRes.data) {
      onSearchSuccess();
    }
  }, [searchQueryRes.data, searchQueryRes.isInitialLoading, onSearchSuccess]);

  return {
    pageNumber,
    searchQuery,
    setPageNumber,
    searchQueryRes,
  };
}
