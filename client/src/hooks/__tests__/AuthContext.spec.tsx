/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { RecoilRoot } from 'recoil';
import { MemoryRouter } from 'react-router-dom';
import { render, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistTwoFactorSetupToken, readTwoFactorSetupToken } from 'librechat-data-provider';
import type { TAuthConfig } from '~/common';
import { AuthContextProvider, useAuthContext } from '../AuthContext';
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

let mockCapturedLogoutOptions: {
  onSuccess: (...args: unknown[]) => void;
  onError: (...args: unknown[]) => void;
};

const mockRefreshMutate = jest.fn();
let capturedAuthContext: ReturnType<typeof useAuthContext> | undefined;

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
  useLogoutUserMutation: jest.fn(
    (options: {
      onSuccess: (...args: unknown[]) => void;
      onError: (...args: unknown[]) => void;
    }) => {
      mockCapturedLogoutOptions = options;
      return { mutate: jest.fn() };
    },
  ),
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

function TestConsumer() {
  const ctx = useAuthContext();
  capturedAuthContext = ctx;
  return (
    <div
      data-testid="consumer"
      data-authenticated={ctx.isAuthenticated}
      data-roles={JSON.stringify(ctx.roles ?? {})}
    />
  );
}

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <MemoryRouter>
          <AuthContextProvider authConfig={authConfig}>
            <TestConsumer />
          </AuthContextProvider>
        </MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );
}

/** Renders without test:true so silentRefresh actually runs */
function renderProviderLive() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <MemoryRouter>
          <AuthContextProvider authConfig={{ loginRedirect: '/login' }}>
            <TestConsumer />
          </AuthContextProvider>
        </MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );
}

describe('AuthContextProvider two-factor login handoff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    capturedAuthContext = undefined;
    window.history.replaceState({}, '', '/login');
  });

  afterEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('routes unenrolled users to required setup', () => {
    renderProvider();

    act(() => {
      mockCapturedLoginOptions.onSuccess({
        twoFAPending: true,
        twoFASetupRequired: true,
        tempToken: 'setup-token',
      });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login/2fa/setup', { replace: true });
    /** The credential is handed over out of band, never through the address bar. */
    expect(readTwoFactorSetupToken()).toBe('setup-token');
  });

  it('retains a non-default destination through setup reload and consumes it after completion', () => {
    window.history.replaceState(
      {},
      '',
      '/login?redirect_to=%2Fc%2Fredirect-lifecycle-proof%3Fmodel%3Dtest',
    );
    const firstRender = renderProvider();

    act(() => {
      mockCapturedLoginOptions.onSuccess({
        twoFAPending: true,
        twoFASetupRequired: true,
        tempToken: 'setup-token',
      });
    });

    expect(sessionStorage.getItem(SESSION_KEY)).toBe('/c/redirect-lifecycle-proof?model=test');
    firstRender.unmount();
    window.history.replaceState({}, '', '/login/2fa/setup');
    renderProvider();

    act(() => {
      capturedAuthContext?.completeAuthentication('auth-token', { id: 'user-1' } as never);
    });

    expect(mockNavigate).toHaveBeenLastCalledWith('/c/redirect-lifecycle-proof?model=test', {
      replace: true,
    });
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();

    act(() => {
      capturedAuthContext?.completeAuthentication('auth-token', { id: 'user-1' } as never);
    });
    expect(mockNavigate).toHaveBeenLastCalledWith('/c/new', { replace: true });
  });

  it('keeps enrolled users on the existing verification route', () => {
    renderProvider();

    act(() => {
      mockCapturedLoginOptions.onSuccess({
        twoFAPending: true,
        tempToken: 'challenge-token',
      });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/login/2fa?tempToken=challenge-token', {
      replace: true,
    });
  });
});

describe('AuthContextProvider: login onError redirect handling', () => {
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

describe('AuthContextProvider — logout onSuccess/onError handling', () => {
  const mockSetTokenHeader = jest.requireMock('librechat-data-provider').setTokenHeader;

  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/c/some-chat');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('calls window.location.replace and setTokenHeader(undefined) when redirect is present', () => {
    const replaceSpy = jest.spyOn(window.location, 'replace').mockImplementation(() => {});

    renderProvider();

    act(() => {
      mockCapturedLogoutOptions.onSuccess({
        message: 'Logout successful',
        redirect: 'https://idp.example.com/logout?id_token_hint=abc',
      });
    });

    expect(replaceSpy).toHaveBeenCalledWith('https://idp.example.com/logout?id_token_hint=abc');
    expect(mockSetTokenHeader).toHaveBeenCalledWith(undefined);
  });

  it('does not call window.location.replace when redirect is absent', async () => {
    const replaceSpy = jest.spyOn(window.location, 'replace').mockImplementation(() => {});

    renderProvider();

    act(() => {
      mockCapturedLogoutOptions.onSuccess({ message: 'Logout successful' });
    });

    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('does not trigger silentRefresh after OIDC redirect', () => {
    const replaceSpy = jest.spyOn(window.location, 'replace').mockImplementation(() => {});

    renderProviderLive();
    mockRefreshMutate.mockClear();

    act(() => {
      mockCapturedLogoutOptions.onSuccess({
        message: 'Logout successful',
        redirect: 'https://idp.example.com/logout?id_token_hint=abc',
      });
    });

    expect(replaceSpy).toHaveBeenCalled();
    expect(mockRefreshMutate).not.toHaveBeenCalled();
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

  it('routes an unenrolled refresh session to setup and preserves the requested destination', () => {
    window.history.replaceState({}, '', '/c/requested?model=test#latest');
    renderProviderLive();
    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      refreshOptions.onSuccess({ twoFASetupRequired: true, tempToken: 'setup token' });
    });

    expect(sessionStorage.getItem(SESSION_KEY)).toBe('/c/requested?model=test#latest');
    expect(mockNavigate).toHaveBeenCalledWith('/login/2fa/setup', { replace: true });
    /** Carried verbatim rather than URL-encoded, because it never enters a URL. */
    expect(readTwoFactorSetupToken()).toBe('setup token');
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

  it('keeps a required setup route mounted when refresh fails after reload', () => {
    window.history.replaceState({}, '', '/login/2fa/setup');
    persistTwoFactorSetupToken('setup-token');
    renderProviderLive();
    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onError: (error: Error) => void },
    ];

    act(() => refreshOptions.onError(new Error('No refresh session')));

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/login/2fa/setup');
  });

  it('keeps a required setup route mounted when refresh returns no token after reload', () => {
    window.history.replaceState({}, '', '/login/2fa/setup');
    persistTwoFactorSetupToken('setup-token');
    renderProviderLive();
    const [, refreshOptions] = mockRefreshMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => refreshOptions.onSuccess({}));

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/login/2fa/setup');
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

describe('AuthContextProvider — logout error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/c/some-chat');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('clears auth state on logout error without external redirect', () => {
    jest.useFakeTimers();
    const replaceSpy = jest.spyOn(window.location, 'replace').mockImplementation(() => {});
    const { getByTestId } = renderProvider();

    act(() => {
      mockCapturedLogoutOptions.onError(new Error('Logout failed'));
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(replaceSpy).not.toHaveBeenCalled();
    expect(getByTestId('consumer').getAttribute('data-authenticated')).toBe('false');
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
