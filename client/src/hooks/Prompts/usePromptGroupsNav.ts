import { useState, useMemo, useRef, useEffect } from 'react';
import { usePromptGroupsInfiniteQuery } from '~/data-provider';

export default function usePromptGroupsNav({ initialPageSize = 10, initialPageNumber = 1 } = {}) {
  const [name, setName] = useState('');
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [pageNumber, setPageNumber] = useState(initialPageNumber);

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

  // useEffect(() => {
  //   console.log('Current Page Size:', groupsQuery.data?.pages?.[0]?.pageSize);
  // }, [groupsQuery.data?.pages]);

  useEffect(() => {
    maxPageNumberReached.current = 1;
    setPageNumber(1);
  }, [pageSize]);

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

  return {
    name,
    setName,
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
