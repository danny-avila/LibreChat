import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { usePromptGroupsInfiniteQuery } from '~/data-provider';
import store from '~/store';

export default function usePromptGroupsNav(hasAccess = true) {
  const [pageSize] = useRecoilState(store.promptsPageSize);
  const [category] = useRecoilState(store.promptsCategory);
  const [name, setName] = useRecoilState(store.promptsName);

  // Track current page index and cursor history
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const cursorHistoryRef = useRef<Array<string | null>>([null]); // Start with null for first page

  const prevFiltersRef = useRef({ name, category });

  const groupsQuery = usePromptGroupsInfiniteQuery(
    {
      name,
      pageSize,
      category,
    },
    {
      enabled: hasAccess,
    },
  );

  // Get the current page data
  const currentPageData = useMemo(() => {
    if (!hasAccess || !groupsQuery.data?.pages || groupsQuery.data.pages.length === 0) {
      return null;
    }
    // Ensure we don't go out of bounds
    const pageIndex = Math.min(currentPageIndex, groupsQuery.data.pages.length - 1);
    return groupsQuery.data.pages[pageIndex];
  }, [hasAccess, groupsQuery.data?.pages, currentPageIndex]);

  // Get prompt groups for current page
  const promptGroups = useMemo(() => {
    return currentPageData?.promptGroups || [];
  }, [currentPageData]);

  // Calculate pagination state
  const hasNextPage = useMemo(() => {
    if (!currentPageData) return false;

    // If we're not on the last loaded page, we have a next page
    if (currentPageIndex < (groupsQuery.data?.pages?.length || 0) - 1) {
      return true;
    }

    // If we're on the last loaded page, check if there are more from backend
    return currentPageData.has_more || false;
  }, [currentPageData, currentPageIndex, groupsQuery.data?.pages?.length]);

  const hasPreviousPage = currentPageIndex > 0;
  const currentPage = currentPageIndex + 1;
  const totalPages = hasNextPage ? currentPage + 1 : currentPage;

  // Navigate to next page
  const nextPage = useCallback(async () => {
    if (!hasAccess || !hasNextPage) return;

    const nextPageIndex = currentPageIndex + 1;

    // Check if we need to load more data
    if (nextPageIndex >= (groupsQuery.data?.pages?.length || 0)) {
      // We need to fetch the next page
      const result = await groupsQuery.fetchNextPage();
      if (result.isSuccess && result.data?.pages) {
        // Update cursor history with the cursor for the next page
        const lastPage = result.data.pages[result.data.pages.length - 2]; // Get the page before the newly fetched one
        if (lastPage?.after && !cursorHistoryRef.current.includes(lastPage.after)) {
          cursorHistoryRef.current.push(lastPage.after);
        }
      }
    }

    setCurrentPageIndex(nextPageIndex);
  }, [hasAccess, currentPageIndex, hasNextPage, groupsQuery]);

  // Navigate to previous page
  const prevPage = useCallback(() => {
    if (!hasAccess || !hasPreviousPage) return;
    setCurrentPageIndex(currentPageIndex - 1);
  }, [hasAccess, currentPageIndex, hasPreviousPage]);

  // Reset when filters change
  useEffect(() => {
    if (!hasAccess) return;

    const filtersChanged =
      prevFiltersRef.current.name !== name || prevFiltersRef.current.category !== category;

    if (filtersChanged) {
      setCurrentPageIndex(0);
      cursorHistoryRef.current = [null];
      prevFiltersRef.current = { name, category };
    }
  }, [hasAccess, name, category]);

  return {
    promptGroups: hasAccess ? promptGroups : [],
    groupsQuery,
    currentPage,
    totalPages,
    hasNextPage: hasAccess && hasNextPage,
    hasPreviousPage: hasAccess && hasPreviousPage,
    nextPage,
    prevPage,
    isFetching: hasAccess ? groupsQuery.isFetching : false,
    name,
    setName,
  };
}
