import { useMemo, useRef, useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { usePromptGroupsInfiniteQuery } from '~/data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import debounce from 'lodash/debounce';
import store from '~/store';

export default function usePromptGroupsNav() {
  const queryClient = useQueryClient();
  const category = useRecoilValue(store.promptsCategory);
  const [name, setName] = useRecoilState(store.promptsName);
  const [pageSize, setPageSize] = useRecoilState(store.promptsPageSize);
  const [pageNumber, setPageNumber] = useRecoilState(store.promptsPageNumber);

  const maxPageNumberReached = useRef(1);
  const prevFiltersRef = useRef({ name, category, pageSize });

  useEffect(() => {
    if (pageNumber > 1 && pageNumber > maxPageNumberReached.current) {
      maxPageNumberReached.current = pageNumber;
    }
  }, [pageNumber]);

  const groupsQuery = usePromptGroupsInfiniteQuery({
    name,
    pageSize,
    category,
    pageNumber: pageNumber + '',
  });

  useEffect(() => {
    const filtersChanged =
      prevFiltersRef.current.name !== name ||
      prevFiltersRef.current.category !== category ||
      prevFiltersRef.current.pageSize !== pageSize;

    if (!filtersChanged) {
      return;
    }
    maxPageNumberReached.current = 1;
    setPageNumber(1);

    // Only reset queries if we're not already on page 1
    // This prevents double queries when filters change
    if (pageNumber !== 1) {
      queryClient.invalidateQueries([QueryKeys.promptGroups, name, category, pageSize]);
    }

    prevFiltersRef.current = { name, category, pageSize };
  }, [pageSize, name, category, setPageNumber, pageNumber, queryClient]);

  const promptGroups = useMemo(() => {
    return groupsQuery.data?.pages[pageNumber - 1 + '']?.promptGroups || [];
  }, [groupsQuery.data, pageNumber]);

  const nextPage = () => {
    setPageNumber((prev) => prev + 1);
    groupsQuery.hasNextPage && groupsQuery.fetchNextPage();
  };

  const prevPage = () => {
    setPageNumber((prev) => prev - 1);
    groupsQuery.hasPreviousPage && groupsQuery.fetchPreviousPage();
  };

  const isFetching = groupsQuery.isFetchingNextPage;
  const hasNextPage = !!groupsQuery.hasNextPage || maxPageNumberReached.current > pageNumber;
  const hasPreviousPage = !!groupsQuery.hasPreviousPage || pageNumber > 1;

  const debouncedSetName = useMemo(
    () =>
      debounce((nextValue: string) => {
        setName(nextValue);
      }, 850),
    [setName],
  );

  return {
    name,
    setName: debouncedSetName,
    nextPage,
    prevPage,
    isFetching,
    pageSize,
    setPageSize,
    hasNextPage,
    groupsQuery,
    promptGroups,
    hasPreviousPage,
  };
}
