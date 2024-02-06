'use client';
import { parseQueryArgs, InfiniteQueryObserver } from '@tanstack/query-core';
import { useBaseQuery } from './useBaseQuery.esm.js';

function useInfiniteQuery(arg1, arg2, arg3) {
  const options = parseQueryArgs(arg1, arg2, arg3);
  return useBaseQuery(options, InfiniteQueryObserver);
}

export { useInfiniteQuery };
//# sourceMappingURL=useInfiniteQuery.esm.js.map
