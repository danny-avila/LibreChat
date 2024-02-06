'use client';
import * as React from 'react';
import { parseMutationArgs, MutationObserver, notifyManager } from '@tanstack/query-core';
import { useSyncExternalStore } from './useSyncExternalStore.esm.js';
import { useQueryClient } from './QueryClientProvider.esm.js';
import { shouldThrowError } from './utils.esm.js';

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
//# sourceMappingURL=useMutation.esm.js.map
