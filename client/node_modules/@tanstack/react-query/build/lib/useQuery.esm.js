'use client';
import { parseQueryArgs, QueryObserver } from '@tanstack/query-core';
import { useBaseQuery } from './useBaseQuery.esm.js';

function useQuery(arg1, arg2, arg3) {
  const parsedOptions = parseQueryArgs(arg1, arg2, arg3);
  return useBaseQuery(parsedOptions, QueryObserver);
}

export { useQuery };
//# sourceMappingURL=useQuery.esm.js.map
