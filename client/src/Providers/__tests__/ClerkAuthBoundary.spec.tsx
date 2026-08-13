/* eslint-disable i18next/no-literal-string */
import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import type { TStartupConfig } from 'librechat-data-provider';
import ClerkAuthBoundary from '../ClerkAuthBoundary';

const mockClerkProvider = jest.fn(
  ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div data-testid="clerk-provider" data-props={JSON.stringify(props)}>
      {children}
    </div>
  ),
);
const mockSignOut = jest.fn();
const mockClerkSessionProvider = jest.fn(
  ({ children, value }: { children: React.ReactNode; value?: { sessionId: string | null } }) => (
    <div data-testid="clerk-session" data-session-id={value?.sessionId ?? ''}>
      {children}
    </div>
  ),
);

let mockResolvedLanguage = 'en';
let mockAuth = { sessionId: 'session-1' as string | null };
let mockStartupQuery: {
  data?: Partial<TStartupConfig>;
  isLoading: boolean;
  isError: boolean;
} = {
  data: undefined,
  isLoading: true,
  isError: false,
};

jest.mock('@clerk/react', () => ({
  ClerkProvider: (props: { children: React.ReactNode; [key: string]: unknown }) =>
    mockClerkProvider(props),
  useAuth: () => mockAuth,
  useClerk: () => ({ signOut: mockSignOut }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: mockResolvedLanguage },
    t: (key: string) => (key === 'com_auth_clerk_loading' ? 'Loading sign in' : key),
  }),
}));

jest.mock('../clerkLocalization', () => ({
  getClerkLocalization: (locale?: string) => ({
    locale: locale?.toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-US',
  }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockStartupQuery,
}));

jest.mock('~/hooks/AuthContext', () => ({
  ClerkSessionProvider: (props: {
    children: React.ReactNode;
    value?: { sessionId: string | null };
  }) => mockClerkSessionProvider(props),
}));

const enabledConfig = {
  appTitle: 'LibreChat',
  clerkLoginEnabled: true,
  clerkPublishableKey: 'pk_test_browser',
} as Partial<TStartupConfig>;

function MountedChild({ onMount }: { onMount?: () => void }) {
  useEffect(() => {
    onMount?.();
  }, [onMount]);
  return <div data-testid="router">Router</div>;
}

describe('ClerkAuthBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolvedLanguage = 'en';
    mockAuth = { sessionId: 'session-1' };
    mockStartupQuery = { data: undefined, isLoading: true, isError: false };
  });

  it('shows an accessible boot status without mounting the router during the first request', () => {
    render(
      <ClerkAuthBoundary>
        <MountedChild />
      </ClerkAuthBoundary>,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByTestId('router')).not.toBeInTheDocument();
    expect(mockClerkProvider).not.toHaveBeenCalled();
  });

  it('wraps the router only for a complete enabled config and exposes the active Clerk session', () => {
    mockStartupQuery = { data: enabledConfig, isLoading: false, isError: false };

    render(
      <ClerkAuthBoundary>
        <MountedChild />
      </ClerkAuthBoundary>,
    );

    expect(screen.getByTestId('router')).toBeInTheDocument();
    expect(screen.getByTestId('clerk-provider')).toBeInTheDocument();
    expect(screen.getByTestId('clerk-session')).toHaveAttribute('data-session-id', 'session-1');
    expect(mockClerkProvider).toHaveBeenLastCalledWith(
      expect.objectContaining({
        publishableKey: 'pk_test_browser',
        signInUrl: '/login',
      }),
    );
  });

  it('passes the router through without Clerk when startup config disables Clerk', () => {
    mockStartupQuery = {
      data: { ...enabledConfig, clerkLoginEnabled: false, clerkPublishableKey: undefined },
      isLoading: false,
      isError: false,
    };

    render(
      <ClerkAuthBoundary>
        <MountedChild />
      </ClerkAuthBoundary>,
    );

    expect(screen.getByTestId('router')).toBeInTheDocument();
    expect(mockClerkProvider).not.toHaveBeenCalled();
  });

  it('passes the router through on startup config error so the route error path can render', () => {
    mockStartupQuery = { data: undefined, isLoading: false, isError: true };

    render(
      <ClerkAuthBoundary>
        <MountedChild />
      </ClerkAuthBoundary>,
    );

    expect(screen.getByTestId('router')).toBeInTheDocument();
    expect(mockClerkProvider).not.toHaveBeenCalled();
  });

  it('never mounts Clerk for a defensive partial enabled configuration', () => {
    mockStartupQuery = {
      data: { appTitle: 'LibreChat', clerkLoginEnabled: true },
      isLoading: false,
      isError: false,
    };

    render(
      <ClerkAuthBoundary>
        <MountedChild />
      </ClerkAuthBoundary>,
    );

    expect(screen.getByTestId('router')).toBeInTheDocument();
    expect(mockClerkProvider).not.toHaveBeenCalled();
  });

  it('retains a complete config when the startup query is cleared by login mutation', () => {
    mockStartupQuery = { data: enabledConfig, isLoading: false, isError: false };
    const onMount = jest.fn();
    const view = render(
      <ClerkAuthBoundary>
        <MountedChild onMount={onMount} />
      </ClerkAuthBoundary>,
    );

    mockStartupQuery = { data: undefined, isLoading: true, isError: false };
    view.rerender(
      <ClerkAuthBoundary>
        <MountedChild onMount={onMount} />
      </ClerkAuthBoundary>,
    );

    expect(screen.getByTestId('clerk-provider')).toBeInTheDocument();
    expect(screen.getByTestId('router')).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it('reacts to locale changes without remounting the provider child', () => {
    mockStartupQuery = { data: enabledConfig, isLoading: false, isError: false };
    const onMount = jest.fn();
    const view = render(
      <ClerkAuthBoundary>
        <MountedChild onMount={onMount} />
      </ClerkAuthBoundary>,
    );

    mockResolvedLanguage = 'fr-FR';
    view.rerender(
      <ClerkAuthBoundary>
        <MountedChild onMount={onMount} />
      </ClerkAuthBoundary>,
    );

    expect(mockClerkProvider).toHaveBeenLastCalledWith(
      expect.objectContaining({ localization: expect.objectContaining({ locale: 'fr-FR' }) }),
    );
    expect(onMount).toHaveBeenCalledTimes(1);
  });
});
