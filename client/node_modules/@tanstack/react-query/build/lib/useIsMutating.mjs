'use client';
import * as React from 'react';
import { parseMutationFilterArgs, notifyManager } from '@tanstack/query-core';
import { useSyncExternalStore } from './useSyncExternalStore.mjs';
import { useQueryClient } from './QueryClientProvider.mjs';

function useIsMutating(arg1, arg2, arg3) {
  const [filters, options = {}] = parseMutationFilterArgs(arg1, arg2, arg3);
  const queryClient = useQueryClient({
    context: options.context
  });
  const mutationCache = queryClient.getMutationCache();
  return useSyncExternalStore(React.useCallback(onStoreChange => mutationCache.subscribe(notifyManager.batchCalls(onStoreChange)), [mutationCache]), () => queryClient.isMutating(filters), () => queryClient.isMutating(filters));
}

export { useIsMutating };
//# sourceMappingURL=useIsMutating.mjs.map
