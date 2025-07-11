import { useAtom, useAtomValue } from 'jotai';
import { useMemo, useRef, useEffect, useCallback } from 'react';
import { usePromptGroupsInfiniteQuery } from '~/data-provider';
import debounce from 'lodash/debounce';
import store from '~/store';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';

export default function usePromptGroupsNav() {
  const queryClient = useQueryClient();
  const category = useAtomValue(store.promptsCategory);
  const [name, setName] = useAtom(store.promptsName);
  const [pageSize, setPageSize] = useAtom(store.promptsPageSize);
  const [pageNumber, setPageNumber] = useAtom(store.promptsPageNumber);

  const maxPageNumberReached = useRef(1);

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
    maxPageNumberReached.current = 1;
    setPageNumber(1);
    queryClient.resetQueries([QueryKeys.promptGroups, name, category, pageSize]);
  }, [pageSize, name, category, setPageNumber, queryClient]);

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

  const debouncedSetName = debounce((nextValue: string) => {
    setName(nextValue);
  }, 850);

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
