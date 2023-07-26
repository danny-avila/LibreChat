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
         const originalRequest = error.config;
         if (error?.response?.status === 401 && !originalRequest._retry) {
           originalRequest._retry = true;
           window.dispatchEvent(new CustomEvent('unauthorized'));
           // return;
         }
         // return;
//        if (error?.response?.status === 401 && !originalRequest._retry) {
          //if (refreshAttempts > 3) {
          //  refreshAttempts += 1;
          //  console.error("Too many refresh attempts. Please log in again.");
          // return;
          //}
          //setError(error);
          //const event = new CustomEvent('unauthorized');
          //window.dispatchEvent(event);
        // }
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
