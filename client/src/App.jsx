import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import Root from './routes/Root';
import Chat from './routes/Chat';
import Search from './routes/Search';
import { ScreenshotProvider } from './utils/screenshotContext.jsx';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import Login from './components/Auth/Login';
import Registration from './components/Auth/Registration';
import { AuthContextProvider } from './hooks/AuthContext';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { ThemeProvider } from './hooks/ThemeContext';
import { useApiErrorBoundary } from './hooks/ApiErrorBoundaryContext';
import ApiErrorWatcher from './components/Auth/ApiErrorWatcher';

const AuthLayout = () => (
  <AuthContextProvider>
    <Outlet />
    <ApiErrorWatcher />
  </AuthContextProvider>
);
const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      {
        path: 'login',
        element: <Login />
      },
      {
        path: 'register',
        element: <Registration />
      },
      {
        path: '/',
        element: <Root />,
        children: [
          {
            index: true,
            element: (
              <Navigate
                to="/chat/new"
                replace={true}
              />
            )
          },
          {
            path: 'chat/:conversationId?',
            element: <Chat />
          },
          {
            path: 'search/:query?',
            element: <Search />
          }
        ]
      }
    ]
  }
]);

const App = () => {
  const { setError } = useApiErrorBoundary();

  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: error => {
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
          <RouterProvider router={router} />
          <ReactQueryDevtools initialIsOpen={false} />
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
