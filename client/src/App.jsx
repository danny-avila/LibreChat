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
import { ToastProvider } from './Providers';
import Toast from './components/ui/Toast';
import { router } from './routes';

// Define the mapping of domains to tracking codes
const domainTrackingCodes = {
  'gptafrica.io': 'G-268NPHEPVM',
  'gptchina.io': 'G-2HYZSSFTSV',
  'gptglobal.io': 'G-FRZD0ZXQHP',
  'gptiran.io': 'G-0NGSJ9SP6Z',
  'gptitaly.io': 'G-40QF6KBX1L',
  'gptrussia.io': 'G-N5L46P3PCX',
  'gptusa.io': 'G-46JS78DD0K',
  'navlisky.io': 'G-xxxxxxxxxx',
};

// Get the current domain
const currentDomain = window.location.hostname;

// Get the tracking code for the current domain (default to 'G-2HYZSSFTSV' if not found)
const trackingCode = domainTrackingCodes[currentDomain] || 'G-2HYZSSFTSV';

// Initialize GA4 with the tracking code
ReactGA.initialize(trackingCode);

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
              <DndProvider backend={HTML5Backend}>
                <RouterProvider router={router}>
                  <PageViewTracker /> {/* Ensure PageViewTracker is included */}
                </RouterProvider>
                <ReactQueryDevtools initialIsOpen={false} position="top-right" />
                <Toast />
                <RadixToast.Viewport className="pointer-events-none fixed inset-0 z-[1000] mx-auto my-2 flex max-w-[560px] flex-col items-stretch justify-start md:pb-5" />
              </DndProvider>
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
