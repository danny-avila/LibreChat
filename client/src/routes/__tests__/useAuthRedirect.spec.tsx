/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import useAuthRedirect from '../useAuthRedirect';
import { useAuthContext } from '~/hooks';

// Polyfill Request for React Router in test environment
if (typeof Request === 'undefined') {
  global.Request = class Request {
    constructor(
      public url: string,
      public init?: RequestInit,
    ) {}
  } as any;
}

jest.mock('~/hooks', () => ({
  useAuthContext: jest.fn(),
}));

/**
 * TestComponent that uses the useAuthRedirect hook and exposes its return value
 */
function TestComponent() {
  const result = useAuthRedirect();
  // Expose result for assertions
  (window as any).__testResult = result;
  return <div data-testid="test-component">Test Component</div>;
}

/**
 * Creates a test router with optional basename to verify navigation works correctly
 * with subdirectory deployments (e.g., /librechat)
 */
const createTestRouter = (basename = '/') => {
  // When using basename, initialEntries must include the basename
  const initialEntry = basename === '/' ? '/' : `${basename}/`;

  return createMemoryRouter(
    [
      {
        path: '/',
        element: <TestComponent />,
      },
      {
        path: '/login',
        element: <div data-testid="login-page">Login Page</div>,
      },
    ],
    {
      basename,
      initialEntries: [initialEntry],
    },
  );
};

describe('useAuthRedirect', () => {
  beforeEach(() => {
    (window as any).__testResult = undefined;
  });

  afterEach(() => {
    jest.clearAllMocks();
    (window as any).__testResult = undefined;
  });

  it('should not redirect when user is authenticated', async () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: { id: '123', email: 'test@example.com' },
      isAuthenticated: true,
    });

    const router = createTestRouter();
    const { getByTestId } = render(<RouterProvider router={router} />);

    expect(router.state.location.pathname).toBe('/');
    expect(getByTestId('test-component')).toBeInTheDocument();

    // Wait for the timeout (300ms) plus a buffer
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Should still be on home page, not redirected
    expect(router.state.location.pathname).toBe('/');
    expect(getByTestId('test-component')).toBeInTheDocument();
  });

  it('should redirect to /login when user is not authenticated', async () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: null,
      isAuthenticated: false,
    });

    const router = createTestRouter();
    const { getByTestId, queryByTestId } = render(<RouterProvider router={router} />);

    expect(router.state.location.pathname).toBe('/');
    expect(getByTestId('test-component')).toBeInTheDocument();

    // Wait for the redirect to happen (300ms timeout + navigation)
    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe('/login');
        expect(getByTestId('login-page')).toBeInTheDocument();
        expect(queryByTestId('test-component')).not.toBeInTheDocument();
      },
      { timeout: 1000 },
    );

    // Verify navigation used replace (history has only 1 entry)
    // This prevents users from hitting back to return to protected pages
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('should respect router basename when redirecting (subdirectory deployment)', async () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: null,
      isAuthenticated: false,
    });

    // Test with basename="/librechat" (simulates subdirectory deployment)
    const router = createTestRouter('/librechat');
    const { getByTestId } = render(<RouterProvider router={router} />);

    // Full pathname includes basename
    expect(router.state.location.pathname).toBe('/librechat/');

    // Wait for the redirect - router handles basename internally
    await waitFor(
      () => {
        // Router state pathname includes the full path with basename
        expect(router.state.location.pathname).toBe('/librechat/login');
        expect(getByTestId('login-page')).toBeInTheDocument();
      },
      { timeout: 1000 },
    );

    // The key point: navigate('/login', { replace: true }) works correctly with basename
    // The router automatically prepends the basename to create the full URL
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('should use React Router navigate (not window.location) for SPA experience', async () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: null,
      isAuthenticated: false,
    });

    const router = createTestRouter('/librechat');
    const { getByTestId } = render(<RouterProvider router={router} />);

    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe('/librechat/login');
        expect(getByTestId('login-page')).toBeInTheDocument();
      },
      { timeout: 1000 },
    );

    // The fact that navigation worked within the router proves we're using
    // navigate() and not window.location.href (which would cause a full reload
    // and break the test entirely). This maintains the SPA experience.
    expect(router.state.location.pathname).toBe('/librechat/login');
  });

  it('should clear timeout on unmount', async () => {
    (useAuthContext as jest.Mock).mockReturnValue({
      user: null,
      isAuthenticated: false,
    });

    const router = createTestRouter();
    const { unmount } = render(<RouterProvider router={router} />);

    // Unmount immediately before timeout fires
    unmount();

    // Wait past the timeout period
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Should still be at home, not redirected (timeout was cleared)
    expect(router.state.location.pathname).toBe('/');
  });

  it('should return user and isAuthenticated values', async () => {
    const mockUser = { id: '123', email: 'test@example.com' };
    (useAuthContext as jest.Mock).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
    });

    const router = createTestRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      const testResult = (window as any).__testResult;
      expect(testResult).toBeDefined();
      expect(testResult.user).toEqual(mockUser);
      expect(testResult.isAuthenticated).toBe(true);
    });
  });
});
