import { useEffect } from 'react';
import { RouterProvider, useLocation } from 'react-router-dom';
import ReactGA from 'react-ga4';
import { RecoilRoot } from 'recoil';
import { DndProvider } from 'react-dnd';
import * as RadixToast from '@radix-ui/react-toast';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { ScreenshotProvider, ThemeProvider, useApiErrorBoundary } from './hooks';
import { ToastProvider, AssistantsProvider } from './Providers';
import Toast from './components/ui/Toast';
import { router } from './routes';

// Initialize GA4
ReactGA.initialize('G-2HYZSSFTSV');
ReactGA.initialize('AW-11258294301');

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
          <RadixToast.Provider>
            <ToastProvider>
              <AssistantsProvider>
                <DndProvider backend={HTML5Backend}>
                  <RouterProvider router={router}>
                    <PageViewTracker /> {/* Ensure PageViewTracker is included */}
                  </RouterProvider>
                  <ReactQueryDevtools initialIsOpen={false} position="top-right" />
                  <Toast />
                  <RadixToast.Viewport className="pointer-events-none fixed inset-0 z-[60] mx-auto my-2 flex max-w-[560px] flex-col items-stretch justify-start md:pb-5" />
                </DndProvider>
              </AssistantsProvider>
            </ToastProvider>
          </RadixToast.Provider>
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
