import { RouterProvider } from 'react-router-dom';
import { ScreenshotProvider } from './utils/screenshotContext.jsx';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { ThemeProvider } from './hooks/ThemeContext';
import { useApiErrorBoundary } from './hooks/ApiErrorBoundaryContext';
import { router } from './routes';
import ReactGA from 'react-ga';
import { useLocation } from 'react-router-dom';

ReactGA.initialize('G-2HYZSSFTSV');

const App = () => {
  const { setError } = useApiErrorBoundary();

  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (error?.response?.status === 401) {
          setError(error);
        }
      }
    })
  });

  return (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <ThemeProvider>
          <RouterProvider router={router}>
            <PageViewTracker />
          </RouterProvider>
          <ReactQueryDevtools initialIsOpen={false} position="top-right" />
        </ThemeProvider>
      </RecoilRoot>
    </QueryClientProvider>
  );
};

const PageViewTracker = () => {
  const location = useLocation();

  React.useEffect(() => {
    ReactGA.pageview(location.pathname + location.search);
  }, [location]);

  return null;
};

export default () => (
  <ScreenshotProvider>
    <App />
  </ScreenshotProvider>
);
