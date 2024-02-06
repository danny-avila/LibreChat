'use client';
import * as React from 'react';
import { hydrate } from '@tanstack/query-core';
import { useQueryClient } from './QueryClientProvider.mjs';

function useHydrate(state, options = {}) {
  const queryClient = useQueryClient({
    context: options.context
  });
  const optionsRef = React.useRef(options);
  optionsRef.current = options; // Running hydrate again with the same queries is safe,
  // it wont overwrite or initialize existing queries,
  // relying on useMemo here is only a performance optimization.
  // hydrate can and should be run *during* render here for SSR to work properly

  React.useMemo(() => {
    if (state) {
      hydrate(queryClient, state, optionsRef.current);
    }
  }, [queryClient, state]);
}
const Hydrate = ({
  children,
  options,
  state
}) => {
  useHydrate(state, options);
  return children;
};

export { Hydrate, useHydrate };
//# sourceMappingURL=Hydrate.mjs.map
