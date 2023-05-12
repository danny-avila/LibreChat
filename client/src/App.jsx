import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import Root from './routes/Root';
import Chat from './routes/Chat';
import Search from './routes/Search';
import { ScreenshotProvider } from './utils/screenshotContext.jsx';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Login, Registration, RequestPasswordReset, ResetPassword } from './components/Auth';
import { AuthContextProvider } from './hooks/AuthContext';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { ThemeProvider } from './hooks/ThemeContext';
import { useApiErrorBoundary } from './hooks/ApiErrorBoundaryContext';
import ApiErrorWatcher from './components/Auth/ApiErrorWatcher';
// import { THEMES } from 'themes.js';

const AuthLayout = () => (
  <AuthContextProvider>
    <Outlet />
    <ApiErrorWatcher />
  </AuthContextProvider>
);
const router = createBrowserRouter([
  {
    path: 'register',
    element: <Registration />
  },
  {
    path: 'forgot-password',
    element: <RequestPasswordReset />
  },
  {
    path: 'reset-password',
    element: <ResetPassword />
  },
  {
    element: <AuthLayout />,
    children: [
      {
        path: 'login',
        element: <Login />
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
		<div>
			{/* {THEMES.map(theme => (
  			<div className={theme.value}></div>
			))} */}
	    <QueryClientProvider client={queryClient}>
	      <RecoilRoot>
	        <ThemeProvider>
	          <RouterProvider router={router} />
	          <ReactQueryDevtools initialIsOpen={false} />
	        </ThemeProvider>
	      </RecoilRoot>
	    </QueryClientProvider>
		</div>
  );
};

export default () => (
  <ScreenshotProvider>
    <App />
  </ScreenshotProvider>
);
