import { lazy, Suspense } from 'react';

const LazyReactQueryDevtools = lazy(() =>
  import('@tanstack/react-query-devtools/production').then(({ ReactQueryDevtools }) => ({
    default: ReactQueryDevtools,
  })),
);

export const shouldEnableQueryDevtools = ({
  isDevelopment = import.meta.env.DEV,
  config = typeof window === 'undefined' ? undefined : window.__LIBRECHAT_CONFIG__,
} = {}) => isDevelopment || config?.enableQueryDevtools === true;

export default function QueryDevtoolsGate({ isDevelopment, config } = {}) {
  if (!shouldEnableQueryDevtools({ isDevelopment, config })) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyReactQueryDevtools initialIsOpen={false} position="top-right" />
    </Suspense>
  );
}
