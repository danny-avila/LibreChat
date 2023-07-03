import { useEffect } from 'react';
import { RouterProvider, useHistory } from 'react-router-dom';
import { ScreenshotProvider } from './utils/screenshotContext.jsx';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { ThemeProvider } from './hooks/ThemeContext';
import { useApiErrorBoundary } from './hooks/ApiErrorBoundaryContext';
import { router } from './routes';
import ReactGA from 'react-ga';

const InnerApp = () => {
  const { setError } = useApiErrorBoundary();
  const history = useHistory();

  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (error?.response?.status === 401) {
          setError(error);
        }
      }
    })
  });

  useEffect(() => {
    if (history) {
      const unlisten = history.listen((location) => {
        ReactGA.pageview(location.pathname + location.search);
      });
      return () => {
        unlisten();
      };
    }
  }, [history]);

  return (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <ThemeProvider>
          <RouterProvider router={router} />
          <ReactQueryDevtools initialIsOpen={false} position="top-right" />
        </ThemeProvider>
      </RecoilRoot>
    </QueryClientProvider>
  );
};

export default () => (
  <ScreenshotProvider>
    <InnerApp />
  </ScreenshotProvider>
);
