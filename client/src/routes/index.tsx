import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import {
  Login,
  Registration,
  RequestPasswordReset,
  ResetPassword,
  VerifyEmail,
  ApiErrorWatcher,
} from '~/components/Auth';
import { AuthContextProvider } from '~/hooks/AuthContext';
import StartupLayout from './Layouts/Startup';
import LoginLayout from './Layouts/Login';
import dashboardRoutes from './Dashboard';
import ShareRoute from './ShareRoute';
import ChatRoute from './ChatRoute';
import Search from './Search';
import Root from './Root';
import { useRouteError } from 'react-router-dom';

const AuthLayout = () => (
  <AuthContextProvider>
    <Outlet />
    <ApiErrorWatcher />
  </AuthContextProvider>
);

function RouteErrorBoundary() {
  const typedError = useRouteError() as {
    message?: string;
    stack?: string;
    status?: number;
    statusText?: string;
    data?: unknown;
  };

  const errorDetails = {
    message: typedError.message ?? 'An unexpected error occurred',
    stack: typedError.stack,
    status: typedError.status,
    statusText: typedError.statusText,
    data: typedError.data,
  };

  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center bg-surface-primary bg-gradient-to-br"
    >
      <div className="bg-surface-primary/60 mx-4 w-full max-w-4xl rounded-2xl border border-border-light p-8 shadow-2xl backdrop-blur-xl">
        <h2 className="mb-6 text-center text-3xl font-medium tracking-tight text-text-primary">
          Oops! Something went wrong
        </h2>

        {/* Error Message */}
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-gray-600 dark:text-gray-200">
          <h3 className="mb-2 font-medium">Error Message:</h3>
          <pre className="whitespace-pre-wrap text-sm font-light leading-relaxed text-text-primary">
            {errorDetails.message}
          </pre>
        </div>

        {/* Status Information */}
        {(typeof errorDetails.status === 'number' ||
          typeof errorDetails.statusText === 'string') && (
          <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-text-primary">
            <h3 className="mb-2 font-medium">Status:</h3>
            <p className="text-text-primary">
              {typeof errorDetails.status === 'number' && `${errorDetails.status} `}
              {typeof errorDetails.statusText === 'string' && errorDetails.statusText}
            </p>
          </div>
        )}

        {/* Stack Trace - Collapsible */}
        {errorDetails.stack && (
          <details className="mb-4 rounded-xl border border-border-light p-4">
            <summary className="mb-2 cursor-pointer text-sm font-medium text-text-primary">
              Stack Trace
            </summary>
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs font-light leading-relaxed text-text-primary">
              {errorDetails.stack}
            </pre>
          </details>
        )}

        {/* Additional Error Data */}
        {errorDetails.data && (
          <details className="mb-4 rounded-xl border border-border-light p-4">
            <summary className="mb-2 cursor-pointer text-sm font-medium text-text-primary">
              Additional Details
            </summary>
            <pre className="whitespace-pre-wrap text-xs font-light leading-relaxed text-text-primary">
              {JSON.stringify(errorDetails.data, null, 2)}
            </pre>
          </details>
        )}

        <div className="mt-6 flex flex-col gap-4">
          <p className="text-sm font-light text-text-secondary">Please try one of the following:</p>
          <ul className="list-inside list-disc text-sm text-text-secondary">
            <li>Refresh the page</li>
            <li>Clear your browser cache</li>
            <li>Check your internet connection</li>
            <li>Contact the Admin if the issue persists</li>
          </ul>
          <div className="mt-4 flex justify-center gap-4">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-surface-submit px-4 py-2 text-white transition-colors hover:bg-surface-submit-hover"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: 'share/:shareId',
    element: <ShareRoute />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/',
    element: <StartupLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: 'register',
        element: <Registration />,
      },
      {
        path: 'forgot-password',
        element: <RequestPasswordReset />,
      },
      {
        path: 'reset-password',
        element: <ResetPassword />,
      },
    ],
  },
  {
    path: 'verify',
    element: <VerifyEmail />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    element: <AuthLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: '/',
        element: <LoginLayout />,
        children: [
          {
            path: 'login',
            element: <Login />,
          },
        ],
      },
      dashboardRoutes,
      {
        path: '/',
        element: <Root />,
        children: [
          {
            index: true,
            element: <Navigate to="/c/new" replace={true} />,
          },
          {
            path: 'c/:conversationId?',
            element: <ChatRoute />,
          },
          {
            path: 'search',
            element: <Search />,
          },
        ],
      },
    ],
  },
]);
