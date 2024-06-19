import { useRecoilState } from 'recoil';
import { useMemo, useRef, useEffect, useCallback } from 'react';
import { usePromptGroupsInfiniteQuery } from '~/data-provider';
import debounce from 'lodash/debounce';
import store from '~/store';

export default function usePromptGroupsNav() {
  const [name, setName] = useRecoilState(store.promptsName);
  const [pageSize, setPageSize] = useRecoilState(store.promptsPageSize);
  const [pageNumber, setPageNumber] = useRecoilState(store.promptsPageNumber);

  const maxPageNumberReached = useRef(1);

  useEffect(() => {
    if (pageNumber > 1 && pageNumber > maxPageNumberReached.current) {
      maxPageNumberReached.current = pageNumber;
    }
  }, [pageNumber]);

  const groupsQuery = usePromptGroupsInfiniteQuery({
    pageSize,
    pageNumber: pageNumber + '',
    name,
  });

  useEffect(() => {
    console.log('Current name:', name);
  }, [name]);

  useEffect(() => {
    maxPageNumberReached.current = 1;
    setPageNumber(1);
  }, [pageSize, setPageNumber]);

  const promptGroups = useMemo(() => {
    return groupsQuery?.data?.pages?.[pageNumber - 1 + '']?.promptGroups || [];
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

  const debouncedSetName = useCallback(
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
