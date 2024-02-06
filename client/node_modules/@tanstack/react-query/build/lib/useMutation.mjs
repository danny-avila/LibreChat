'use client';
import * as React from 'react';
import { parseMutationArgs, MutationObserver, notifyManager } from '@tanstack/query-core';
import { useSyncExternalStore } from './useSyncExternalStore.mjs';
import { useQueryClient } from './QueryClientProvider.mjs';
import { shouldThrowError } from './utils.mjs';

function useMutation(arg1, arg2, arg3) {
  const options = parseMutationArgs(arg1, arg2, arg3);
  const queryClient = useQueryClient({
    context: options.context
  });
  const [observer] = React.useState(() => new MutationObserver(queryClient, options));
  React.useEffect(() => {
    observer.setOptions(options);
  }, [observer, options]);
  const result = useSyncExternalStore(React.useCallback(onStoreChange => observer.subscribe(notifyManager.batchCalls(onStoreChange)), [observer]), () => observer.getCurrentResult(), () => observer.getCurrentResult());
  const mutate = React.useCallback((variables, mutateOptions) => {
    observer.mutate(variables, mutateOptions).catch(noop);
  }, [observer]);

  if (result.error && shouldThrowError(observer.options.useErrorBoundary, [result.error])) {
    throw result.error;
  }

  return { ...result,
    mutate,
    mutateAsync: result.mutate
  };
} // eslint-disable-next-line @typescript-eslint/no-empty-function

function noop() {}

export { useMutation };
//# sourceMappingURL=useMutation.mjs.map
