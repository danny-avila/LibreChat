import userEvent from '@testing-library/user-event';
import { act, render, screen, waitFor } from '@testing-library/react';
import ClerkLogin from '../ClerkLogin';

const mockGetToken = jest.fn();
const mockLoginWithClerk = jest.fn();
const mockSignOut = jest.fn();
const mockGetClerkAuthErrorCode = jest.fn();
const mockSignInButton = jest.fn(
  ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div data-testid="clerk-sign-in" data-props={JSON.stringify(props)}>
      {children}
    </div>
  ),
);

let mockClerkAuth: {
  isLoaded: boolean;
  isSignedIn: boolean;
  sessionId: string | null;
  getToken: typeof mockGetToken;
};
let mockLibreChatAuth: {
  isAuthenticated: boolean;
  loginWithClerk: typeof mockLoginWithClerk;
};

jest.mock('@clerk/react', () => ({
  SignInButton: (props: { children: React.ReactNode; [key: string]: unknown }) =>
    mockSignInButton(props),
  useAuth: () => mockClerkAuth,
  useClerk: () => ({ signOut: mockSignOut }),
}));

jest.mock('~/data-provider', () => ({
  getClerkAuthErrorCode: (error: unknown) => mockGetClerkAuthErrorCode(error),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => mockLibreChatAuth,
}));

const translations: Record<string, string> = {
  com_auth_clerk_sign_in: 'Continue with Clerk',
  com_auth_clerk_loading: 'Loading sign in',
  com_auth_clerk_exchanging: 'Completing sign in',
  com_auth_clerk_error: 'Clerk sign in could not be completed.',
  com_auth_clerk_token_error: 'Clerk did not provide a sign-in token.',
  com_auth_clerk_sign_out_error: 'Could not switch Clerk accounts.',
  com_auth_clerk_retry: 'Retry',
  com_auth_clerk_use_another_account: 'Use another account',
};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => translations[key] ?? key,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function setSignedIn(sessionId = 'session-1') {
  mockClerkAuth = {
    isLoaded: true,
    isSignedIn: true,
    sessionId,
    getToken: mockGetToken,
  };
}

describe('ClerkLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClerkAuth = {
      isLoaded: false,
      isSignedIn: false,
      sessionId: null,
      getToken: mockGetToken,
    };
    mockLibreChatAuth = {
      isAuthenticated: false,
      loginWithClerk: mockLoginWithClerk,
    };
    mockGetClerkAuthErrorCode.mockReturnValue(undefined);
  });

  it('waits for Clerk to load before showing a sign-in action', () => {
    render(<ClerkLogin />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading sign in');
    expect(screen.queryByRole('button', { name: 'Continue with Clerk' })).not.toBeInTheDocument();
  });

  it('shows an accessible modal sign-in control with only base-aware login return URLs', () => {
    mockClerkAuth = {
      ...mockClerkAuth,
      isLoaded: true,
    };

    render(<ClerkLogin />);

    expect(screen.getByRole('button', { name: 'Continue with Clerk' })).toBeEnabled();
    expect(mockSignInButton).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: 'modal',
        withSignUp: true,
        forceRedirectUrl: '/login',
        fallbackRedirectUrl: '/login',
        signUpForceRedirectUrl: '/login',
        signUpFallbackRedirectUrl: '/login',
      }),
    );
  });

  it('performs one automatic token exchange for a signed-in session', async () => {
    setSignedIn();
    mockGetToken.mockResolvedValue('clerk-token');
    mockLoginWithClerk.mockResolvedValue({ token: 'local-token', user: { id: 'user-1' } });
    const view = render(<ClerkLogin />);

    await waitFor(() => expect(mockLoginWithClerk).toHaveBeenCalledWith('clerk-token'));
    view.rerender(<ClerkLogin />);

    await act(async () => undefined);
    expect(mockGetToken).toHaveBeenCalledTimes(1);
    expect(mockLoginWithClerk).toHaveBeenCalledTimes(1);
  });

  it('does not exchange when LibreChat is already authenticated', () => {
    setSignedIn();
    mockLibreChatAuth.isAuthenticated = true;

    render(<ClerkLogin />);

    expect(mockGetToken).not.toHaveBeenCalled();
    expect(mockLoginWithClerk).not.toHaveBeenCalled();
  });

  it('retries one replay with an uncached token and never loops', async () => {
    setSignedIn();
    const replayError = new Error('replayed');
    const secondError = new Error('still replayed');
    mockGetToken.mockResolvedValueOnce('cached-token').mockResolvedValueOnce('fresh-token');
    mockLoginWithClerk.mockRejectedValueOnce(replayError).mockRejectedValueOnce(secondError);
    mockGetClerkAuthErrorCode.mockImplementation((error: unknown) =>
      error === replayError || error === secondError ? 'CLERK_TOKEN_REPLAYED' : undefined,
    );

    render(<ClerkLogin />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Clerk sign in could not be completed.',
    );
    expect(mockGetToken).toHaveBeenNthCalledWith(1);
    expect(mockGetToken).toHaveBeenNthCalledWith(2, { skipCache: true });
    expect(mockGetToken).toHaveBeenCalledTimes(2);
    expect(mockLoginWithClerk).toHaveBeenNthCalledWith(1, 'cached-token');
    expect(mockLoginWithClerk).toHaveBeenNthCalledWith(2, 'fresh-token');
    expect(screen.getByRole('button', { name: 'Use another account' })).toBeEnabled();
  });

  it('does not retry a malformed backend error until the user explicitly retries', async () => {
    const user = userEvent.setup();
    setSignedIn();
    mockGetToken.mockResolvedValueOnce('token-1').mockResolvedValueOnce('token-2');
    mockLoginWithClerk.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      token: 'local-token',
      user: { id: 'user-1' },
    });

    render(<ClerkLogin />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveFocus();
    expect(mockGetToken).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(mockLoginWithClerk).toHaveBeenCalledWith('token-2'));
    expect(mockGetToken).toHaveBeenCalledTimes(2);
  });

  it('requires a non-null Clerk token and leaves recovery explicit', async () => {
    setSignedIn();
    mockGetToken.mockResolvedValue(null);

    render(<ClerkLogin />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Clerk did not provide a sign-in token.',
    );
    expect(mockLoginWithClerk).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('ignores a stale token when the Clerk session changes', async () => {
    setSignedIn('session-1');
    const firstToken = deferred<string | null>();
    const secondToken = deferred<string | null>();
    mockGetToken.mockReturnValueOnce(firstToken.promise).mockReturnValueOnce(secondToken.promise);
    mockLoginWithClerk.mockResolvedValue({ token: 'local-token', user: { id: 'user-1' } });
    const view = render(<ClerkLogin />);

    setSignedIn('session-2');
    view.rerender(<ClerkLogin />);

    await act(async () => firstToken.resolve('stale-token'));
    expect(mockLoginWithClerk).not.toHaveBeenCalledWith('stale-token');

    await act(async () => secondToken.resolve('current-token'));
    await waitFor(() => expect(mockLoginWithClerk).toHaveBeenCalledWith('current-token'));
  });

  it('ignores token completion after unmount', async () => {
    setSignedIn();
    const token = deferred<string | null>();
    mockGetToken.mockReturnValue(token.promise);
    const view = render(<ClerkLogin />);

    view.unmount();
    await act(async () => token.resolve('stale-token'));

    expect(mockLoginWithClerk).not.toHaveBeenCalled();
  });

  it('offers active-session account switching for forbidden identities without a redirect', async () => {
    const user = userEvent.setup();
    setSignedIn('session-forbidden');
    const forbidden = new Error('forbidden');
    mockGetToken.mockResolvedValue('token');
    mockLoginWithClerk.mockRejectedValue(forbidden);
    mockGetClerkAuthErrorCode.mockImplementation((error: unknown) =>
      error === forbidden ? 'CLERK_LOGIN_FORBIDDEN' : undefined,
    );
    const signOut = deferred<void>();
    mockSignOut.mockReturnValue(signOut.promise);

    render(<ClerkLogin />);

    const accountSwitch = await screen.findByRole('button', { name: 'Use another account' });
    await user.click(accountSwitch);
    await user.click(accountSwitch);

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith({ sessionId: 'session-forbidden' });

    await act(async () => signOut.reject(new Error('sign out failed')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not switch Clerk accounts.');
    expect(screen.getByRole('button', { name: 'Use another account' })).toBeEnabled();
  });
});
