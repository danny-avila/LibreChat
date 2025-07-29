import { useEffect } from 'react';
import { RecoilRoot } from 'recoil';
import { DndProvider } from 'react-dnd';
import { RouterProvider } from 'react-router-dom';
import * as RadixToast from '@radix-ui/react-toast';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { ScreenshotProvider, ThemeProvider, useApiErrorBoundary } from './hooks';
import { ToastProvider } from './Providers';
import Toast from './components/ui/Toast';
import { LiveAnnouncer } from '~/a11y';
import { router } from './routes';
import { useIframeComm } from './hooks/useIframeComm';

const App = () => {
  const { setError } = useApiErrorBoundary();

  // Use iframe communication hook
  const { sendToParent, inIframe } = useIframeComm({
    onAuthToken: ({ token, reload }) => {
      if (token) {
        console.log('Received auth token from parent');
        localStorage.setItem('librechat_token', token);
        if (reload) {
          window.location.reload();
        }
      }
    },
    onThemeChange: ({ theme }) => {
      if (theme) {
        console.log('Theme change requested:', theme);
        // Apply theme change logic here
        // You can integrate this with your theme context
      }
    },
    onNavigate: ({ path }) => {
      if (path) {
        console.log('Navigation requested to:', path);
        router.navigate(path);
      }
    },
    onUserData: ({ user }) => {
      if (user) {
        console.log('Received user data from parent:', user);
        // Dispatch to user store/context if needed
      }
    }
  });

  // Send ready signal when app is loaded
  useEffect(() => {
    if (inIframe) {
      setTimeout(() => {
        sendToParent('IFRAME_READY', {
          timestamp: Date.now(),
          origin: window.location.origin,
          path: window.location.pathname,
          version: '1.0.0',
          features: ['auth', 'navigation', 'themes', 'resize']
        });
      }, 1000); // Delay to ensure everything is loaded
    }
  }, [inIframe, sendToParent]);

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
        <LiveAnnouncer>
          <ThemeProvider>
            <RadixToast.Provider>
              <ToastProvider>
                <DndProvider backend={HTML5Backend}>
                  <RouterProvider router={router} />
                  <ReactQueryDevtools initialIsOpen={false} position="top-right" />
                  <Toast />
                  <RadixToast.Viewport className="pointer-events-none fixed inset-0 z-[1000] mx-auto my-2 flex max-w-[560px] flex-col items-stretch justify-start md:pb-5" />
                </DndProvider>
              </ToastProvider>
            </RadixToast.Provider>
          </ThemeProvider>
        </LiveAnnouncer>
      </RecoilRoot>
    </QueryClientProvider>
  );
};

export default () => (
  <ScreenshotProvider>
    <App />
    <iframe
      src="/assets/silence.mp3"
      allow="autoplay"
      id="audio"
      title="audio-silence"
      style={{
        display: 'none',
      }}
    />
  </ScreenshotProvider>
);
