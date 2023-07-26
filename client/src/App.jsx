import { RouterProvider } from 'react-router-dom';
import { ScreenshotProvider } from './utils/screenshotContext.jsx';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { ThemeProvider } from './hooks/ThemeContext';
import { useApiErrorBoundary } from './hooks/ApiErrorBoundaryContext';
import { router } from './routes';

const App = () => {
  const { setError } = useApiErrorBoundary();
  let refreshAttempts = 0;
  
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
         console.log('Error', error);
         const originalRequest = error.config;
         if (error?.response?.status === 401 && 
           !(error?.response?.data === 'Refresh token expired or not found for this user') &&
           !(error?.response?.data === 'User not found') &&
           !(error?.response?.data === 'Invalid refresh token') &&
           !(error?.response?.data === 'Refresh token not provided')) {
             originalRequest._retry = true;
             window.dispatchEvent(new CustomEvent('unauthorized'));
         }
      },
    }),
  });

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
    <App />
  </ScreenshotProvider>
);
