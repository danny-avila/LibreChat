import { useHistory, RouterProvider } from 'react-router-dom';
import { ScreenshotProvider } from './utils/screenshotContext.jsx';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { ThemeProvider } from './hooks/ThemeContext';
import { useApiErrorBoundary } from './hooks/ApiErrorBoundaryContext';
import { router } from './routes';
import { useRef } from 'react';
const maxRefreshAttempts = 3; 

const App = () => {
  const { setError } = useApiErrorBoundary();
  const refreshAttempts = useRef(0); 
  const history = useHistory();
  
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
         console.log('Error', error);
         if (error?.response?.status === 401){
           if (refreshAttempts.current < maxRefreshAttempts) {
             refreshAttempts.current += 1;
             window.dispatchEvent(new CustomEvent('unauthorized'));
           } else {
             history.push('/login');
           }
         }
         // const originalRequest = error.config;
         // If /api/auth/refresh sends the 401 then do not try to refresh
        // if (error?.response?.status === 401 && !(error?.request?._url === '/api/auth/refresh') && !(originalRequest._retry)) {
       // if (error?.response?.status === 401){
           //const refreshAttempts = context.refreshAttempts ?? 0;
           // if (refreshAttempts < maxRefreshAttempts) {
         //    originalRequest._retry = true;
         //    window.dispatchEvent(new CustomEvent('unauthorized'));
           // } else {
           //  navigate('/login', { replace: true });
           //}
        // }
//         if (error?.response?.status === 401 && 
//           !(error?.response?.data === 'Refresh token expired or not found for this user') &&
//           !(error?.response?.data === 'User not found') &&
//           !(error?.response?.data === 'Invalid refresh token') &&
//           !(error?.response?.data === 'Refresh token not provided')) {
//             //originalRequest._retry = true;
//             window.dispatchEvent(new CustomEvent('unauthorized'));
//         }
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
