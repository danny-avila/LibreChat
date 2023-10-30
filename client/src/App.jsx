import { useEffect } from 'react';
import { RouterProvider, useLocation } from 'react-router-dom';
import ReactGA from 'react-ga4'; // Corrected import
import { RecoilRoot } from 'recoil';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { ScreenshotProvider, ThemeProvider, useApiErrorBoundary } from './hooks';
import { router } from './routes';

// Initialize GA4
ReactGA.initialize('G-2HYZSSFTSV');

const PageViewTracker = () => {
  const location = useLocation();

  useEffect(() => {
    ReactGA.send('pageview', {
      page_path: location.pathname,
    });
  }, [location]);

  return null;
};

const App = () => {
  const { setError } = useApiErrorBoundary();

  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (error?.response?.status === 401) {
          setError(error);
        }
      },
    }),
  });

  return (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <ThemeProvider>
          <RouterProvider router={router}>
            <PageViewTracker /> {/* Include the component here */}
          </RouterProvider>
          <ReactQueryDevtools initialIsOpen={false} position="top-right" />
        </ThemeProvider>
      </RecoilRoot>
    </QueryClientProvider>
  );
};

export default () => (
  <ScreenshotProvider>
    <App />
  </ScreenshotProvider>
);
