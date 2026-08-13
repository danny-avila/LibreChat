/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { RecoilRoot } from 'recoil';
import { MemoryRouter } from 'react-router-dom';
import { render, act, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TAuthConfig } from '~/common';
import { AuthContextProvider, ClerkSessionProvider, useAuthContext } from '../AuthContext';
import { SESSION_KEY } from '~/utils';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockApiBaseUrl = jest.fn(() => '');

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  setTokenHeader: jest.fn(),
  apiBaseUrl: () => mockApiBaseUrl(),
}));

let mockCapturedLoginOptions: {
  onSuccess: (...args: unknown[]) => void;
  onError: (...args: unknown[]) => void;
};

const mockRefreshMutate = jest.fn();
const mockLogoutMutateAsync = jest.fn();
const mockClerkMutateAsync = jest.fn();

jest.mock('~/data-provider', () => ({
  useLoginUserMutation: jest.fn(
    (options: {
      onSuccess: (...args: unknown[]) => void;
      onError: (...args: unknown[]) => void;
    }) => {
      mockCapturedLoginOptions = options;
      return { mutate: jest.fn() };
    },
  ),
  useClerkLoginMutation: jest.fn(() => ({ mutateAsync: mockClerkMutateAsync })),
  useLogoutUserMutation: jest.fn(() => ({ mutateAsync: mockLogoutMutateAsync })),
  useRefreshTokenMutation: jest.fn(() => ({ mutate: mockRefreshMutate })),
  useGetUserQuery: jest.fn(() => ({
    data: undefined,
    isError: false,
    error: null,
  })),
  useGetRole: jest.fn(() => ({ data: null })),
  useListRoles: jest.fn(() => ({ data: undefined })),
}));

const authConfig: TAuthConfig = { loginRedirect: '/login', test: true };

let latestAuthContext: ReturnType<typeof useAuthContext>;

function TestConsumer() {
  const ctx = useAuthContext();
  const [, forceRender] = React.useState(0);
  latestAuthContext = ctx;
  return (
    <>
      <div
        data-testid="consumer"
        data-authenticated={ctx.isAuthenticated}
        data-error={ctx.error}
        data-roles={JSON.stringify(ctx.roles ?? {})}
      />
      <button data-testid="rerender" onClick={() => forceRender((value) => value + 1)} />
    </>
  );
}

type ClerkSessionValue = {
  sessionId: string | null;
  signOut: (options: { sessionId: string }) => Promise<void>;
};

function renderProviderWithConfig(config: TAuthConfig, clerkSession?: ClerkSessionValue) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <MemoryRouter>
          <ClerkSessionProvider value={clerkSession}>
            <AuthContextProvider authConfig={config}>
              <TestConsumer />
            </AuthContextProvider>
          </ClerkSessionProvider>
        </MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );
}

function renderProvider(clerkSession?: ClerkSessionValue) {
  return renderProviderWithConfig(authConfig, clerkSession);
}

/** Renders without test:true so silentRefresh actually runs */
function renderProviderLive(clerkSession?: ClerkSessionValue) {
  return renderProviderWithConfig({ loginRedirect: '/login' }, clerkSession);
}

function DynamicClerkSessionHarness({ signOut }: { signOut: ClerkSessionValue['signOut'] }) {
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  return (
    <ClerkSessionProvider value={{ sessionId, signOut }}>
      <AuthContextProvider authConfig={authConfig}>
        <TestConsumer />
        <button
          type="button"
          data-testid="activate-clerk"
          onClick={() => setSessionId('session-1')}
        />
      </AuthContextProvider>
    </ClerkSessionProvider>
  );
}

function renderProviderWithDynamicClerkSession(signOut: ClerkSessionValue['signOut']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <MemoryRouter>
          <DynamicClerkSessionHarness signOut={signOut} />
        </MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('AuthContextProvider — login onError redirect handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/login');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('preserves a valid redirect_to param across login failure', () => {
    window.history.replaceState({}, '', '/login?redirect_to=%2Fc%2Fabc123');

    renderProvider();

    act(() => {
      mockCapturedLoginOptions.onError({ message: 'Invalid credentials' });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login?redirect_to=%2Fc%2Fabc123', {
      replace: true,
    });
  });

  it('drops redirect_to when it contains an absolute URL (open-redirect prevention)', () => {
    window.history.replaceState({}, '', '/login?redirect_to=https%3A%2F%2Fevil.com');

    renderProvider();

    act(() => {
      mockCapturedLoginOptions.onError({ message: 'Invalid credentials' });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('drops redirect_to when it points to /login (recursive redirect prevention)', () => {
    window.history.replaceState({}, '', '/login?redirect_to=%2Flogin');

    renderProvider();

    act(() => {
      mockCapturedLoginOptions.onError({ message: 'Invalid credentials' });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('navigates to plain /login when no redirect_to param exists', () => {
    renderProvider();

    act(() => {
      mockCapturedLoginOptions.onError({ message: 'Server error' });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('preserves redirect_to with query params and hash', () => {
    const target = '/c/abc123?model=gpt-4#section';
    window.history.replaceState({}, '', `/login?redirect_to=${encodeURIComponent(target)}`);

    renderProvider();

    act(() => {
      mockCapturedLoginOptions.onError({ message: 'Invalid credentials' });
    });

    const navigatedUrl = mockNavigate.mock.calls[0][0] as string;
    const params = new URLSearchParams(navigatedUrl.split('?')[1]);
    expect(decodeURIComponent(params.get('redirect_to')!)).toBe(target);
  });
});

describe('AuthContextProvider — Clerk login handoff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogoutMutateAsync.mockResolvedValue({ message: 'Logout successful' });
  });

  it('exposes a callback-stable Promise login and applies the shared success path', async () => {
    jest.useFakeTimers();
    mockClerkMutateAsync.mockResolvedValue({
      token: 'librechat-token',
      user: { id: 'user-1', role: 'USER' },
    });
    const { getByTestId } = renderProvider();
    const firstLoginWithClerk = latestAuthContext.loginWithClerk;

    fireEvent.click(getByTestId('rerender'));
    expect(latestAuthContext.loginWithClerk).toBe(firstLoginWithClerk);

    await act(async () => {
      await latestAuthContext.loginWithClerk('clerk-session-token');
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockClerkMutateAsync).toHaveBeenCalledWith({ clerkToken: 'clerk-session-token' });
    expect(getByTestId('consumer')).toHaveAttribute('data-authenticated', 'true');
    expect(mockNavigate).toHaveBeenCalledWith('/c/new', { replace: true });
    jest.useRealTimers();
  });

  it('reuses the existing local two-factor navigation contract', async () => {
    mockClerkMutateAsync.mockResolvedValue({
      twoFAPending: true,
      tempToken: 'tenant-bound-temp-token',
    });
    const { getByTestId } = renderProvider();

    await act(async () => {
      await latestAuthContext.loginWithClerk('clerk-session-token');
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login/2fa?tempToken=tenant-bound-temp-token', {
      replace: true,
    });
    expect(getByTestId('consumer')).toHaveAttribute('data-authenticated', 'false');
  });

  it('preserves the rejected mutation for the Clerk bridge to classify', async () => {
    const replayError = { response: { data: { code: 'CLERK_TOKEN_REPLAYED' } } };
    mockClerkMutateAsync.mockRejectedValue(replayError);
    renderProvider();

    await expect(latestAuthContext.loginWithClerk('replayed-token')).rejects.toBe(replayError);
  });
});

describe('AuthContextProvider — settled local and Clerk logout', () => {
  const mockSetTokenHeader = jest.requireMock('librechat-data-provider').setTokenHeader;

  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/c/some-chat');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('uses the active Clerk session when it arrives after AuthContext mounts', async () => {
    const clerkSignOut = jest.fn().mockResolvedValue(undefined);
    mockLogoutMutateAsync.mockResolvedValue({ message: 'Logout successful' });
    const { getByTestId } = renderProviderWithDynamicClerkSession(clerkSignOut);

    fireEvent.click(getByTestId('activate-clerk'));
    await act(async () => {
      await latestAuthContext.logout();
    });

    expect(clerkSignOut).toHaveBeenCalledWith({ sessionId: 'session-1' });
  });

  it('calls window.location.replace only after local and active Clerk sign-out settle', async () => {
    const replaceSpy = jest.spyOn(window.location, 'replace').mockImplementation(() => {});
    const clerkSignOut = jest.fn().mockResolvedValue(undefined);
    mockLogoutMutateAsync.mockResolvedValue({
      message: 'Logout successful',
      redirect: 'https://idp.example.com/logout?id_token_hint=abc',
    });

    renderProvider({ sessionId: 'clerk-session-1', signOut: clerkSignOut });
    await act(async () => {
      await latestAuthContext.logout();
    });

    expect(clerkSignOut).toHaveBeenCalledWith({ sessionId: 'clerk-session-1' });
    expect(replaceSpy).toHaveBeenCalledWith('https://idp.example.com/logout?id_token_hint=abc');
    expect(mockSetTokenHeader).toHaveBeenCalledWith(undefined);
  });

  it('does not navigate until both logout operations have settled', async () => {
    const local = deferred<{ message: string }>();
    const clerk = deferred<void>();
    const clerkSignOut = jest.fn(() => clerk.promise);
    mockLogoutMutateAsync.mockReturnValue(local.promise);

    renderProvider({ sessionId: 'clerk-session-1', signOut: clerkSignOut });
    let logoutPromise!: Promise<void>;
    act(() => {
      logoutPromise = latestAuthContext.logout();
    });

    local.resolve({ message: 'Logout successful' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockNavigate).not.toHaveBeenCalled();

    clerk.resolve(undefined);
    await act(async () => {
      await logoutPromise;
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('clears local auth, reports a safe error, and suppresses refresh after either logout fails', async () => {
    jest.useFakeTimers();
    const clerkSignOut = jest.fn().mockRejectedValue(new Error('secret Clerk failure detail'));
    mockLogoutMutateAsync.mockResolvedValue({ message: 'Logout successful' });
    const { getByTestId } = renderProviderLive({
      sessionId: 'clerk-session-1',
      signOut: clerkSignOut,
    });
    mockRefreshMutate.mockClear();

    await act(async () => {
      await latestAuthContext.logout();
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(mockSetTokenHeader).toHaveBeenCalledWith(undefined);
    expect(getByTestId('consumer')).toHaveAttribute('data-authenticated', 'false');
    expect(getByTestId('consumer')).toHaveAttribute(
      'data-error',
      'Authentication failed. Please check your login method and try again.',
    );
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    expect(mockRefreshMutate).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('AuthContextProvider — silentRefresh post-login redirect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('preserves a safe redirect_to when anonymous refresh returns no token', () => {
    window.history.replaceState({}, '', '/login?redirect_to=%2Fc%2Fnew%3Fclerk%3Dclosure');

    renderProviderLive();

    expect(mockRefreshMutate).toHaveBeenCalledTimes(1);
    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({});
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login?redirect_to=%2Fc%2Fnew%3Fclerk%3Dclosure');
  });

  it('navigates to stored sessionStorage redirect after successful token refresh', () => {
    jest.useFakeTimers();
    sessionStorage.setItem(SESSION_KEY, '/c/new?endpoint=bedrock&model=claude-sonnet-4-6');

    renderProviderLive();

    expect(mockRefreshMutate).toHaveBeenCalledTimes(1);
    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'USER' }, token: 'new-token' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/c/new?endpoint=bedrock&model=claude-sonnet-4-6', {
      replace: true,
    });
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    jest.useRealTimers();
  });

  it('navigates to current URL when no stored redirect exists', () => {
    jest.useFakeTimers();
    window.history.replaceState({}, '', '/c/new');

    renderProviderLive();

    expect(mockRefreshMutate).toHaveBeenCalledTimes(1);
    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'USER' }, token: 'new-token' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/c/new', { replace: true });
    jest.useRealTimers();
  });

  it('does not re-trigger silentRefresh after successful redirect', () => {
    jest.useFakeTimers();
    sessionStorage.setItem(SESSION_KEY, '/c/abc?endpoint=bedrock');

    renderProviderLive();

    expect(mockRefreshMutate).toHaveBeenCalledTimes(1);
    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];
    mockRefreshMutate.mockClear();

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'USER' }, token: 'new-token' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/c/abc?endpoint=bedrock', { replace: true });
    expect(mockRefreshMutate).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('falls back to current URL for unsafe stored redirect', () => {
    jest.useFakeTimers();
    window.history.replaceState({}, '', '/c/new');
    sessionStorage.setItem(SESSION_KEY, 'https://evil.com/steal');

    renderProviderLive();

    expect(mockRefreshMutate).toHaveBeenCalledTimes(1);
    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'USER' }, token: 'new-token' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/c/new', { replace: true });
    expect(mockNavigate).not.toHaveBeenCalledWith('https://evil.com/steal', expect.anything());
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    jest.useRealTimers();
  });
});

describe('AuthContextProvider — silentRefresh subdirectory deployment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockApiBaseUrl.mockReturnValue('/chat');
  });

  afterEach(() => {
    mockApiBaseUrl.mockReturnValue('');
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('strips base path from window.location.pathname before navigating (prevents /chat/chat doubling)', () => {
    jest.useFakeTimers();
    window.history.replaceState({}, '', '/chat/c/abc123?model=gpt-4');

    renderProviderLive();

    expect(mockRefreshMutate).toHaveBeenCalledTimes(1);
    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'USER' }, token: 'new-token' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/c/abc123?model=gpt-4', { replace: true });
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.stringContaining('/chat/c/'),
      expect.anything(),
    );
    jest.useRealTimers();
  });

  it('falls back to root when window.location.pathname equals the base path', () => {
    jest.useFakeTimers();
    window.history.replaceState({}, '', '/chat');

    renderProviderLive();

    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'USER' }, token: 'new-token' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    jest.useRealTimers();
  });
});

describe('AuthContextProvider — custom role detection and fetching', () => {
  const mockUseGetRole = jest.requireMock('~/data-provider').useGetRole;
  const staffPermissions = {
    name: 'STAFF',
    permissions: { PROMPTS: { USE: true, CREATE: false } },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('calls useGetRole with the custom role name and enabled: true for custom role users', () => {
    jest.useFakeTimers();

    renderProviderLive();

    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'STAFF' }, token: 'tok' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    const staffCalls = mockUseGetRole.mock.calls.filter(([name]: [string]) => name === 'STAFF');
    expect(staffCalls.length).toBeGreaterThan(0);
    const lastStaffCall = staffCalls[staffCalls.length - 1];
    expect(lastStaffCall[1]).toEqual(expect.objectContaining({ enabled: true }));

    jest.useRealTimers();
  });

  it('calls useGetRole with enabled: false for USER role users', () => {
    jest.useFakeTimers();

    renderProviderLive();

    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'USER' }, token: 'tok' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    const sentinelCalls = mockUseGetRole.mock.calls.filter(([name]: [string]) => name === '_');
    expect(sentinelCalls.length).toBeGreaterThan(0);
    for (const call of sentinelCalls) {
      expect(call[1]).toEqual(expect.objectContaining({ enabled: false }));
    }

    jest.useRealTimers();
  });

  it('calls useGetRole with enabled: false for ADMIN role users', () => {
    jest.useFakeTimers();

    renderProviderLive();

    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'ADMIN' }, token: 'tok' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    const sentinelCalls = mockUseGetRole.mock.calls.filter(([name]: [string]) => name === '_');
    expect(sentinelCalls.length).toBeGreaterThan(0);
    for (const call of sentinelCalls) {
      expect(call[1]).toEqual(expect.objectContaining({ enabled: false }));
    }

    jest.useRealTimers();
  });

  it('includes custom role data in the roles context map when loaded', () => {
    jest.useFakeTimers();
    mockUseGetRole.mockImplementation((name: string, opts?: { enabled?: boolean }) => {
      if (name === 'STAFF' && opts?.enabled) {
        return { data: staffPermissions };
      }
      return { data: null };
    });

    const { getByTestId } = renderProviderLive();

    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ user: { id: '1', role: 'STAFF' }, token: 'tok' });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    const rolesAttr = getByTestId('consumer').getAttribute('data-roles') ?? '{}';
    const roles = JSON.parse(rolesAttr);
    expect(roles).toHaveProperty('STAFF');
    expect(roles.STAFF).toEqual(staffPermissions);

    mockUseGetRole.mockReturnValue({ data: null });
    jest.useRealTimers();
  });
});
